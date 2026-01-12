import { Command } from "commander";
import { writeFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { getConfig } from "./config.js";
import { z } from "zod";

const execAsync = promisify(exec);

// Input validation schema
const ImageOptionsSchema = z.object({
  ar: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('16:9'),
  output: z.string().optional(),
  json: z.boolean().optional()
});

interface ImageOptions {
  ar?: string;
  output?: string;
  json?: boolean;
}

export const imageCommand = new Command("image")
  .description("Image generation with Google Imagen 3 🎨")
  .argument("<prompt>", "Text description of the image to generate")
  .option("-o, --output <path>", "Output file path (default: imagen-{timestamp}.png)")
  .option("--ar <ratio>", "Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4 (default: 16:9)", "16:9")
  .option("--json", "Output metadata as JSON")
  .action(async (prompt: string, options: ImageOptions) => {
    try {
      // Validate prompt
      if (!prompt || prompt.trim().length === 0) {
        console.error("Error: Prompt cannot be empty");
        process.exit(1);
      }
      if (prompt.length > 1000) {
        console.error("Error: Prompt too long (max 1000 characters)");
        process.exit(1);
      }

      // Validate options with Zod
      const validatedOptions = ImageOptionsSchema.parse(options);

      await generateImage(prompt.trim(), validatedOptions);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Error: Invalid options");
        error.issues.forEach((issue: z.ZodIssue) => {
          console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
        });
        process.exit(1);
      }
      const err = error as Error;
      console.error(`Error: ${err.message}`);
      if (process.env.DEBUG) {
        console.error(`Debug: ${err.stack}`);
      }
      process.exit(1);
    }
  });

/**
 * Generate image from text prompt using Imagen 3 REST API
 */
async function generateImage(prompt: string, options: ImageOptions): Promise<void> {
  console.log(`🎨 Generating image with Google Imagen 3...`);
  console.log(`📝 Prompt: "${prompt}"\n`);

  // Get project ID from config or environment
  const config = getConfig();
  const projectId = process.env.GCP_PROJECT_ID || config.gcpProjectId || 'tigerv0';
  const location = process.env.GCP_LOCATION || config.gcpLocation || 'us-central1';

  const aspectRatio = options.ar || '16:9';
  const timestamp = Date.now();
  const outputPath = options.output || `imagen-${timestamp}.png`;

  console.log(`⚙️  Aspect Ratio: ${aspectRatio}`);
  console.log(`⚙️  Project: ${projectId}\n`);
  console.log(`🔄 Calling Vertex AI Imagen 3...\n`);

  try {
    // Get access token using gcloud
    const { stdout: token } = await execAsync('gcloud auth print-access-token');
    const accessToken = token.trim();

    if (!accessToken) {
      throw new Error('Failed to get access token. Make sure you are authenticated with gcloud.');
    }

    // Build Imagen 3 REST API URL
    const apiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`;

    // Prepare request body (NO string interpolation for security)
    const requestBody = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio,
        safetyFilterLevel: "block_some",
        personGeneration: "allow_adult"
      }
    };

    // Make secure HTTP request using fetch (NO curl command injection)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error('Authentication failed. Run: gcloud auth login');
      } else if (response.status === 403) {
        throw new Error('Permission denied. Check your GCP project permissions.');
      } else if (response.status === 429) {
        throw new Error('API quota exceeded. Please try again later.');
      } else {
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
    }

    const data = await response.json() as { predictions?: Array<{ bytesBase64Encoded: string }> };

    if (!data.predictions || data.predictions.length === 0) {
      throw new Error('No image was generated. Try a different prompt.');
    }

    // Extract base64 image data and save to file
    const base64Data = data.predictions[0].bytesBase64Encoded;
    const buffer = Buffer.from(base64Data, 'base64');

    writeFileSync(outputPath, buffer);

    if (options.json) {
      console.log(JSON.stringify({
        prompt,
        file: outputPath,
        aspectRatio,
        model: 'imagen-3.0-generate-001',
        project: projectId,
        location
      }, null, 2));
    } else {
      console.log(`💾 Saved: ${outputPath}`);
      console.log(`\n✅ Done! Generated image with Imagen 3 🎨`);
    }
  } catch (error) {
    const err = error as Error;
    // Don't expose sensitive error details in production
    if (err.message.includes('gcloud')) {
      throw err; // User-friendly message already set
    }
    throw new Error(`Failed to generate image. ${process.env.DEBUG ? err.message : 'Run with DEBUG=1 for details.'}`);
  }
}
