import { Command } from "commander";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./config.js";
import { z } from "zod";
import { apiRequest } from "../lib/api-client.js";

// Input validation schemas
const YouTubeUrlSchema = z.string().min(1, "YouTube URL cannot be empty");

const YouTubeOptionsSchema = z.object({
  json: z.boolean().optional(),
  prompt: z.string().max(10000, "Custom prompt too long (max 10000 characters)").optional(),
  language: z.enum(["en", "de"]).optional(),
  useProxy: z.boolean().optional(),
});

interface YouTubeOptions {
  json?: boolean;
  prompt?: string;
  language?: "en" | "de";
  useProxy?: boolean;
}

export const youtubeCommand = new Command("youtube")
  .description("YouTube video summarization using Gemini AI")
  .argument("<url>", "YouTube video URL")
  .option("--json", "Output as JSON")
  .option("--prompt <prompt>", "Custom summarization prompt")
  .option("--language <lang>", "Summary language (en, de)", "de")
  .option("--no-proxy", "Skip API proxy, use direct Gemini API")
  .action(async (url: string, options: YouTubeOptions) => {
    try {
      // Validate URL
      const validatedUrl = YouTubeUrlSchema.parse(url);

      // Validate options
      const validatedOptions = YouTubeOptionsSchema.parse(options);

      // Try proxy first (if not disabled)
      if (validatedOptions.useProxy !== false) {
        try {
          await summarizeViaProxy(validatedUrl, validatedOptions);
          return;
        } catch (error) {
          const err = error as Error;
          // Only fall back on auth/access errors, not on video errors
          if (!err.message.includes("403") && !err.message.includes("401") && !err.message.includes("Forbidden")) {
            throw error;
          }
          if (!validatedOptions.json) {
            console.log("⚠️  Proxy unavailable, falling back to direct API...\n");
          }
        }
      }

      // Fall back to direct API
      await summarizeVideoDirect(validatedUrl, validatedOptions);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Error: Invalid input");
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
 * Extract video ID from YouTube URL
 */
function extractVideoId(url: string): string {
  // Support various YouTube URL formats:
  // - https://www.youtube.com/watch?v=VIDEO_ID
  // - https://youtu.be/VIDEO_ID
  // - https://www.youtube.com/embed/VIDEO_ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  throw new Error(`Invalid YouTube URL: ${url}`);
}

/**
 * Summarize via API proxy (uses server-side credentials)
 */
async function summarizeViaProxy(url: string, options: YouTubeOptions): Promise<void> {
  const videoId = extractVideoId(url);
  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

  if (!options.json) {
    console.log(`📹 Video: ${videoId}`);
    console.log(`🔗 URL: ${fullUrl}`);
    console.log(`🌐 Using API proxy...\n`);
  }

  interface ProxySummarizeResponse {
    success: boolean;
    videoId: string;
    url: string;
    summary: string;
    language: string;
  }

  const result = await apiRequest<ProxySummarizeResponse>("/api/proxy/youtube/summarize", {
    method: "POST",
    body: {
      url: fullUrl,
      prompt: options.prompt,
      language: options.language || "de",
    },
  });

  if (options.json) {
    console.log(JSON.stringify({
      videoId: result.videoId,
      url: result.url,
      summary: result.summary,
      language: result.language,
    }, null, 2));
  } else {
    console.log('📝 Zusammenfassung:');
    console.log('='.repeat(70));
    console.log(result.summary);
    console.log('='.repeat(70));
    console.log(`\n✓ URL: ${result.url}`);
  }
}

/**
 * Summarize YouTube video using direct Gemini API (fallback)
 */
async function summarizeVideoDirect(url: string, options: YouTubeOptions): Promise<void> {
  const videoId = extractVideoId(url);
  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

  if (!options.json) {
    console.log(`📹 Video: ${videoId}`);
    console.log(`🔗 URL: ${fullUrl}\n`);
  }

  // Get Gemini API key
  // Priority: Standard Gemini API (has 3.0) > Vertex AI (has 2.5 Pro) > Config
  const config = getConfig();
  const env = process.env.HUSKY_ENV || 'PROD';

  const standardKey = process.env.HUSKY_GEMINI_API_KEY ||
                      process.env[`${env}_GEMINI_API_KEY`] ||
                      process.env.GEMINI_API_KEY ||
                      config.geminiApiKey;

  const vertexKey = process.env.HUSKY_VERTEX_AI_KEY ||
                    process.env[`${env}_VERTEX_AI_KEY`];

  const geminiApiKey = standardKey || vertexKey;
  const isVertex = !standardKey && !!vertexKey;

  if (!geminiApiKey) {
    console.error('Error: Missing Gemini API Key');
    console.error('');
    console.error('Configure with:');
    console.error('  husky config set gemini-api-key <key>');
    console.error('');
    console.error('Or set environment variable:');
    console.error('  HUSKY_GEMINI_API_KEY or HUSKY_VERTEX_AI_KEY');
    console.error('');
    console.error('Get your key from: https://aistudio.google.com/app/apikey');
    process.exit(1);
  }

  // Use Gemini 3.0 for standard API, 2.5 Pro for Vertex AI
  const modelName = isVertex ? "gemini-2.5-pro" : "gemini-3.0-flash";
  const modelLabel = isVertex ? "Gemini 2.5 Pro (Vertex AI)" : "Gemini 3.0 Flash";

  if (!options.json) {
    console.log(`🤖 Analyzing with ${modelLabel}...\n`);
  }

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  // Custom prompt or default
  const prompt = options.prompt || (options.language === "en" ? `
Create a structured summary of this YouTube video.

Format:
## Main Topics
[3-5 key points]

## Key Insights
[Most important learnings]

## Summary
[1-2 paragraph overview]

## Keywords
[Relevant keywords, comma-separated]
  `.trim() : `
Erstelle eine strukturierte Zusammenfassung dieses YouTube Videos.

Format:
## Hauptthemen
[3-5 Hauptpunkte]

## Wichtige Erkenntnisse
[Wichtigste Learnings]

## Zusammenfassung
[1-2 Paragraphen Gesamtzusammenfassung]

## Keywords
[Relevante Keywords kommagetrennt]
  `.trim());

  // Gemini can directly analyze YouTube URLs
  let summary: string;
  try {
    const result = await model.generateContent([
      {
        text: prompt
      },
      {
        fileData: {
          mimeType: "video/youtube",
          fileUri: fullUrl
        }
      }
    ]);

    summary = result.response.text();

    if (!summary || summary.trim().length === 0) {
      throw new Error('Empty response from Gemini API');
    }
  } catch (error) {
    const err = error as Error;

    // Provide helpful error messages based on error type
    if (err.message.includes('API_KEY_INVALID') || err.message.includes('401')) {
      console.error('Error: Invalid API key');
      console.error('Update your key with: husky config set gemini-api-key <key>');
      process.exit(1);
    } else if (err.message.includes('quota') || err.message.includes('429')) {
      console.error('Error: API quota exceeded');
      console.error('Please try again later or check your quota limits');
      process.exit(1);
    } else if (err.message.includes('not found') || err.message.includes('404')) {
      console.error('Error: Video not found or not accessible');
      console.error('Make sure the YouTube video is public and the URL is correct');
      process.exit(1);
    } else {
      console.error(`Error: Failed to summarize video`);
      if (process.env.DEBUG) {
        console.error(`Debug: ${err.message}`);
      } else {
        console.error('Run with DEBUG=1 for more details');
      }
      process.exit(1);
    }
  }

  if (options.json) {
    console.log(JSON.stringify({
      videoId,
      url: fullUrl,
      summary
    }, null, 2));
  } else {
    console.log('📝 Zusammenfassung:');
    console.log('='.repeat(70));
    console.log(summary);
    console.log('='.repeat(70));
    console.log(`\n✓ URL: ${fullUrl}`);
  }
}
