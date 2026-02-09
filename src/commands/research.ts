import { Command } from "commander";
import { apiRequest } from "../lib/api-client.js";
import { isRedditConfigured, RedditClient, RedditPost as CliRedditPost } from "../lib/biz/reddit.js";
import { isYouTubeConfigured, YouTubeMonitorClient, YouTubeVideo as CliYouTubeVideo } from "../lib/biz/youtube-monitor.js";
import { isXConfigured, XClient, XPost as CliXPost } from "../lib/biz/x-client.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./config.js";
import { ApiBrain } from "../lib/biz/api-brain.js";
import chalk from "chalk";

// ============================================================================
// Constants
// ============================================================================

/** Timeout for all API and fetch calls (ms) */
const API_TIMEOUT_MS = 15_000;

/** Maximum Reddit posts to fetch per subreddit */
const REDDIT_POSTS_PER_SUBREDDIT = 50;

/** Maximum YouTube videos to fetch per channel */
const YOUTUBE_VIDEOS_PER_CHANNEL = 10;

/** Maximum X posts to fetch per account */
const X_POSTS_PER_ACCOUNT = 10;

/** Default max age for YouTube videos (hours) */
const DEFAULT_YOUTUBE_MAX_AGE_HOURS = 48;

/** Maximum Reddit posts to include in summary prompt */
const SUMMARY_TOP_REDDIT_COUNT = 10;

/** Maximum YouTube videos to include in summary prompt */
const SUMMARY_TOP_YOUTUBE_COUNT = 5;

/** Maximum X posts to include in summary prompt */
const SUMMARY_TOP_X_COUNT = 5;

/** Maximum posts to display in markdown results */
const MARKDOWN_DISPLAY_LIMIT = 10;

/** Relevance score multiplier per matched keyword */
const RELEVANCE_SCORE_PER_KEYWORD = 20;

/** Maximum relevance score */
const MAX_RELEVANCE_SCORE = 100;

/** Maximum X post content length in the summary prompt */
const X_POST_CONTENT_PREVIEW_LENGTH = 200;

/** Maximum summary text length for notifications */
const NOTIFICATION_SUMMARY_MAX_LENGTH = 500;

/** Default job list limit */
const DEFAULT_JOB_LIST_LIMIT = "10";

/** Valid output formats for results command */
const VALID_RESULT_FORMATS = ["json", "markdown", "summary"] as const;
type ResultFormat = typeof VALID_RESULT_FORMATS[number];

/** Valid job statuses */
const VALID_JOB_STATUSES = ["pending", "running", "completed", "failed"] as const;

// ============================================================================
// Response Type Interfaces
// ============================================================================

interface SubredditConfig {
  name: string;
  displayName: string;
  enabled: boolean;
  minScore: number;
  maxAgeHours: number;
}

interface YouTubeChannelConfig {
  channelId: string;
  channelName: string;
  enabled: boolean;
  maxAgeHours: number;
}

interface XAccountConfig {
  username: string;
  enabled: boolean;
  searchKeywords: string[];
  maxAgeHours: number;
}

interface NotificationChannel {
  type: string;
  config: {
    webhookUrl?: string;
    email?: string;
  };
  enabled: boolean;
}

interface ResearchConfigResponse {
  id: string;
  version: number;
  subreddits: SubredditConfig[];
  youtubeChannels: YouTubeChannelConfig[];
  xAccounts: XAccountConfig[];
  aiKeywords: string[];
  minScoreThreshold: number;
  schedule: {
    enabled: boolean;
    cronExpression: string;
    timezone: string;
  };
  notificationChannels: NotificationChannel[];
}

interface ResearchJobResponse {
  id: string;
  status: string;
  triggeredAt: string;
  startedAt?: string;
  completedAt?: string;
  totalPostsFound: number;
  totalPostsFiltered: number;
  error?: string;
  configSnapshot: ResearchConfigResponse;
  sources: string[];
}

interface TriggerResponse {
  success: boolean;
  jobId: string;
  message: string;
}

interface JobListResponse {
  jobs: ResearchJobResponse[];
}

interface RedditPostsResponse {
  posts: Array<{
    title: string;
    subreddit: string;
    score: number;
    url: string;
    relevanceScore?: number;
  }>;
}

interface YouTubeVideosResponse {
  videos: Array<{
    title: string;
    channelName: string;
    publishedAt: string;
    url: string;
    relevanceScore?: number;
  }>;
}

interface SummaryResponse {
  fullSummary: string;
  keyInsights: string[];
  storedInKB: boolean;
  kbEntryId?: string;
}

// ============================================================================
// Mapped Post Interfaces (replaces `any` in map functions)
// ============================================================================

interface RelevanceResult {
  isAiRelated: boolean;
  relevanceScore: number;
  relevanceReason: string;
  tags: string[];
}

interface MappedRedditPost extends RelevanceResult {
  jobId: string;
  fetchedAt: string;
  redditPostId: string;
  subreddit: string;
  title: string;
  content: string;
  url: string;
  discussionUrl: string;
  author: string;
  score: number;
  upvoteRatio: number;
  commentCount: number;
  createdAt: string;
}

interface MappedYouTubeVideo extends RelevanceResult {
  jobId: string;
  fetchedAt: string;
  videoId: string;
  channelId: string;
  channelName: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string;
}

interface MappedXPost extends RelevanceResult {
  jobId: string;
  fetchedAt: string;
  postId: string;
  username: string;
  content: string;
  url: string;
  postedAt: string;
  likes: number;
  retweets: number;
}

interface GeneratedSummary {
  fullSummary: string;
  keyInsights: string[];
  topPosts: {
    reddit: MappedRedditPost | undefined;
    youtube: MappedYouTubeVideo | undefined;
    x: MappedXPost | undefined;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Create an AbortSignal with the standard API timeout */
function apiTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(API_TIMEOUT_MS);
}

/**
 * Sanitize user-generated content before interpolating into LLM prompts.
 * Strips characters that could be used for prompt injection while keeping
 * the text readable.
 */
function sanitizeForPrompt(text: string): string {
  return text
    // Remove control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Collapse sequences of backticks (prevents markdown code-fence injection)
    .replace(/`{3,}/g, "``")
    // Remove system/role instruction patterns
    .replace(/\b(system|assistant|user)\s*:/gi, "")
    // Limit length to prevent flooding
    .slice(0, 1000)
    .trim();
}

/**
 * Robustly extract a JSON object from an LLM response.
 * Handles markdown code fences and extra text around the JSON.
 */
function extractJsonFromLlmResponse(text: string): Record<string, unknown> | null {
  // Try markdown code fence first: ```json ... ``` or ``` ... ```
  const fencedMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch {
      // Fall through to next strategy
    }
  }

  // Try to find the outermost balanced braces
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // Fall through
    }
  }

  return null;
}

/** Format an error for logging, extracting the message if it's an Error instance */
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Validate a string is a positive integer. Returns the parsed number or null.
 */
function parsePositiveInt(value: string): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

// ============================================================================
// Command Definition
// ============================================================================

export const researchCommand = new Command("research")
  .description("AI News Research - Monitor Reddit, YouTube, and X for AI-related content");

// Config subcommand
researchCommand
  .command("config")
  .description("View or manage research configuration")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const config = await apiRequest<ResearchConfigResponse>("/api/research/config", {
        signal: apiTimeoutSignal(),
      });

      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      console.log("🔍 Research Configuration\n");
      console.log(`Version: ${config.version}`);
      console.log(`Schedule: ${config.schedule.enabled ? '✅' : '❌'} ${config.schedule.cronExpression} (${config.schedule.timezone})`);
      console.log(`Min Score: ${config.minScoreThreshold}`);
      
      console.log("\n📊 Subreddits:");
      config.subreddits.forEach((sub) => {
        console.log(`  ${sub.enabled ? '✅' : '❌'} r/${sub.name} (min: ${sub.minScore})`);
      });

      console.log("\n📺 YouTube Channels:");
      config.youtubeChannels.forEach((ch) => {
        console.log(`  ${ch.enabled ? '✅' : '❌'} ${ch.channelName}`);
      });

      console.log("\n🔔 Notifications:");
      config.notificationChannels.forEach((nc) => {
        console.log(`  ${nc.enabled ? '✅' : '❌'} ${nc.type}`);
      });
    } catch (error) {
      console.error("Failed to get config:", formatError(error));
      process.exit(1);
    }
  });

// Run subcommand - Trigger research manually
researchCommand
  .command("run")
  .description("Trigger a research job manually")
  .option("--job <id>", "Job ID (for resuming existing job)")
  .option("--json", "Output as JSON")
  .action(async (options: { job?: string; json?: boolean }) => {
    try {
      if (options.job) {
        // Resume existing job
        console.log(`Resuming research job: ${options.job}`);
        await runResearchJob(options.job, options.json);
      } else {
        // Trigger new job
        if (!options.json) console.log("Triggering new research job...");
        const result = await apiRequest<TriggerResponse>("/api/research/trigger", {
          method: "POST",
          body: {},
          signal: apiTimeoutSignal(),
        });
        
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`✅ Job created: ${result.jobId}`);
          console.log(`Message: ${result.message}`);
          console.log("\nThe supervisor will be notified and start the research shortly.");
        }
      }
    } catch (error) {
      console.error("Failed to run research:", formatError(error));
      process.exit(1);
    }
  });

// Jobs subcommand - List jobs
researchCommand
  .command("jobs")
  .description("List research jobs")
  .option("--status <status>", "Filter by status (pending|running|completed|failed)")
  .option("--limit <n>", "Limit results", DEFAULT_JOB_LIST_LIMIT)
  .option("--json", "Output as JSON")
  .action(async (options: { status?: string; limit?: string; json?: boolean }) => {
    try {
      if (options.status && !(VALID_JOB_STATUSES as readonly string[]).includes(options.status)) {
        console.error(`Invalid status: ${options.status}. Must be one of: ${VALID_JOB_STATUSES.join(", ")}`);
        process.exit(1);
      }

      if (options.limit) {
        const parsed = parsePositiveInt(options.limit);
        if (parsed === null) {
          console.error(`Invalid --limit: "${options.limit}". Must be a positive integer.`);
          process.exit(1);
        }
      }

      const params = new URLSearchParams();
      if (options.status) params.append("status", options.status);
      if (options.limit) params.append("limit", options.limit);

      const data = await apiRequest<JobListResponse>(`/api/research/jobs?${params.toString()}`, {
        signal: apiTimeoutSignal(),
      });

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log("🔍 Research Jobs\n");
      data.jobs.forEach((job) => {
        const statusEmoji = {
          pending: "⏳",
          running: "🔄",
          completed: "✅",
          failed: "❌"
        }[job.status] || "❓";
        
        console.log(`${statusEmoji} ${job.id}`);
        console.log(`   Status: ${job.status}`);
        console.log(`   Triggered: ${new Date(job.triggeredAt).toLocaleString()}`);
        console.log(`   Posts: ${job.totalPostsFound} found, ${job.totalPostsFiltered} filtered`);
        console.log();
      });
    } catch (error) {
      console.error("Failed to list jobs:", formatError(error));
      process.exit(1);
    }
  });

// Results subcommand - Get job results
researchCommand
  .command("results <job-id>")
  .description("Get research job results")
  .option("--format <format>", "Output format (json|markdown|summary)", "summary")
  .option("--json", "Output as JSON (shorthand for --format json)")
  .action(async (jobId: string, options: { format?: string; json?: boolean }) => {
    try {
      const format: ResultFormat = options.json ? "json" : validateResultFormat(options.format);

      const [job, summary] = await Promise.all([
        apiRequest<ResearchJobResponse>(`/api/research/jobs/${jobId}`, {
          signal: apiTimeoutSignal(),
        }),
        apiRequest<SummaryResponse>(`/api/research/jobs/${jobId}/summary`, {
          signal: apiTimeoutSignal(),
        }).catch((err: unknown) => {
          if (process.env.DEBUG) {
            console.error(`[debug] Failed to fetch summary for job ${jobId}: ${formatError(err)}`);
          }
          return null;
        })
      ]);

      if (format === "json") {
        console.log(JSON.stringify({ job, summary }, null, 2));
        return;
      }

      console.log(`🔍 Research Results: ${jobId}\n`);
      console.log(`Status: ${job.status}`);
      console.log(`Triggered: ${new Date(job.triggeredAt).toLocaleString()}`);
      
      if (job.status === "running") {
        console.log("\n⚠️  Job is still running. Check back later.");
        return;
      }

      if (job.status === "failed") {
        console.log(`\n❌ Job failed: ${job.error || "Unknown error"}`);
        return;
      }

      console.log(`\n📊 Summary:`);
      console.log(`  Total Posts: ${job.totalPostsFound}`);
      console.log(`  Filtered (AI-related): ${job.totalPostsFiltered}`);

      if (summary) {
        console.log(`\n📝 AI-Generated Summary:`);
        console.log(summary.fullSummary);

        if (summary.keyInsights?.length > 0) {
          console.log(`\n💡 Key Insights:`);
          summary.keyInsights.forEach((insight, i) => {
            console.log(`  ${i + 1}. ${insight}`);
          });
        }

        if (summary.storedInKB) {
          console.log(`\n✅ Stored in Knowledge Base: ${summary.kbEntryId}`);
        }
      }

      if (format === "markdown") {
        // Fetch detailed results
        const [reddit, youtube] = await Promise.all([
          apiRequest<RedditPostsResponse>(`/api/research/jobs/${jobId}/reddit-posts`, {
            signal: apiTimeoutSignal(),
          }).catch((err: unknown) => {
            if (process.env.DEBUG) {
              console.error(`[debug] Failed to fetch Reddit posts for job ${jobId}: ${formatError(err)}`);
            }
            return { posts: [] as RedditPostsResponse["posts"] };
          }),
          apiRequest<YouTubeVideosResponse>(`/api/research/jobs/${jobId}/youtube-videos`, {
            signal: apiTimeoutSignal(),
          }).catch((err: unknown) => {
            if (process.env.DEBUG) {
              console.error(`[debug] Failed to fetch YouTube videos for job ${jobId}: ${formatError(err)}`);
            }
            return { videos: [] as YouTubeVideosResponse["videos"] };
          })
        ]);

        if (reddit.posts?.length > 0) {
          console.log(`\n## Reddit Posts (${reddit.posts.length})\n`);
          reddit.posts.slice(0, MARKDOWN_DISPLAY_LIMIT).forEach((post) => {
            console.log(`### ${post.title}`);
            console.log(`- **Subreddit:** r/${post.subreddit}`);
            console.log(`- **Score:** ${post.score} | **Relevance:** ${post.relevanceScore || 'N/A'}/10`);
            console.log(`- **URL:** ${post.url}\n`);
          });
        }

        if (youtube.videos?.length > 0) {
          console.log(`\n## YouTube Videos (${youtube.videos.length})\n`);
          youtube.videos.slice(0, MARKDOWN_DISPLAY_LIMIT).forEach((video) => {
            console.log(`### ${video.title}`);
            console.log(`- **Channel:** ${video.channelName}`);
            console.log(`- **Published:** ${new Date(video.publishedAt).toLocaleDateString()}`);
            console.log(`- **Relevance:** ${video.relevanceScore || 'N/A'}/10`);
            console.log(`- **URL:** ${video.url}\n`);
          });
        }
      }
    } catch (error) {
      console.error("Failed to get results:", formatError(error));
      process.exit(1);
    }
  });

// Status subcommand - Check API configuration
researchCommand
  .command("status")
  .description("Check research API configuration status")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    const redditConfigured = isRedditConfigured();
    const youtubeConfigured = isYouTubeConfigured();
    const xConfigured = isXConfigured();

    if (options.json) {
      console.log(JSON.stringify({
        reddit: { configured: redditConfigured },
        youtube: { configured: youtubeConfigured },
        x: { configured: xConfigured }
      }, null, 2));
      return;
    }

    console.log("🔍 Research API Status\n");
    
    console.log("Reddit API:");
    if (redditConfigured) {
      console.log("  ✅ Configured");
      console.log("  ✅ Configuration valid");
    } else {
      console.log("  ❌ Not configured");
      console.log("     Use: husky config set reddit-client-id <id>");
      console.log("     Use: husky config set reddit-client-secret <secret>");
    }

    console.log("\nYouTube API:");
    if (youtubeConfigured) {
      console.log("  ✅ Configured");
      console.log("  ✅ Configuration valid");
    } else {
      console.log("  ❌ Not configured");
      console.log("     Use: husky config set youtube-api-key <key>");
    }

    console.log("\nX/Twitter API:");
    if (xConfigured) {
      console.log("  ✅ Configured");
      console.log("  ✅ Configuration valid");
    } else {
      console.log("  ❌ Not configured");
      console.log("     Use: husky config set x-bearer-token <token>");
    }
  });

// ============================================================================
// Validation Helpers
// ============================================================================

function validateResultFormat(format: string | undefined): ResultFormat {
  const f = format || "summary";
  if (!(VALID_RESULT_FORMATS as readonly string[]).includes(f)) {
    console.error(`Invalid --format: "${f}". Must be one of: ${VALID_RESULT_FORMATS.join(", ")}`);
    process.exit(1);
  }
  return f as ResultFormat;
}

// ============================================================================
// Core Research Job Runner
// ============================================================================

async function runResearchJob(jobId: string, jsonOutput?: boolean): Promise<void> {
  const log = (msg: string) => { if (!jsonOutput) console.log(msg); };
  const logSuccess = (msg: string) => { if (!jsonOutput) console.log(chalk.green(msg)); };
  const logError = (msg: string) => { if (!jsonOutput) console.error(chalk.red(msg)); };
  const logDebug = (msg: string) => { if (process.env.DEBUG) console.error(`[debug] ${msg}`); };

  try {
    // 1. Fetch job details
    log(`📡 Fetching job details for ${jobId}...`);
    const job = await apiRequest<ResearchJobResponse>(`/api/research/jobs/${jobId}`, {
      signal: apiTimeoutSignal(),
    });
    const config = job.configSnapshot;

    // 2. Race condition protection: only transition from "pending" to "running"
    if (job.status !== "pending") {
      logError(`⚠️  Job ${jobId} is in "${job.status}" status, expected "pending". Aborting to avoid race condition.`);
      if (jsonOutput) {
        console.log(JSON.stringify({ success: false, error: `Job status is "${job.status}", expected "pending"` }));
      }
      process.exit(1);
    }

    await apiRequest(`/api/research/jobs/${jobId}`, {
      method: "PATCH",
      body: { status: "running", startedAt: new Date().toISOString() },
      signal: apiTimeoutSignal(),
    });

    const redditPosts: MappedRedditPost[] = [];
    const youtubeVideos: MappedYouTubeVideo[] = [];
    const xPosts: MappedXPost[] = [];
    let totalFound = 0;

    // 3. Execute Reddit Research
    if (isRedditConfigured() && config.subreddits.some(s => s.enabled)) {
      log("🤖 Starting Reddit research...");
      const reddit = RedditClient.fromConfig();
      
      for (const sub of config.subreddits.filter(s => s.enabled)) {
        log(`   - Searching r/${sub.name}...`);
        try {
          const { posts } = await reddit.getSubredditPosts(sub.name, { sort: 'hot', limit: REDDIT_POSTS_PER_SUBREDDIT });
          totalFound += posts.length;

          for (const post of posts) {
            const postDate = new Date(post.createdUtc * 1000);
            const ageHours = (Date.now() - postDate.getTime()) / (1000 * 60 * 60);
            
            if (ageHours > sub.maxAgeHours) continue;

            const relevance = calculateRelevance(post.title + " " + post.selftext, config.aiKeywords);
            if (relevance.isAiRelated && post.score >= sub.minScore) {
              redditPosts.push(mapRedditPostToApi(post, jobId, relevance));
            }
          }
        } catch (err) {
          logError(`     Error searching r/${sub.name}: ${formatError(err)}`);
          logDebug(`Reddit r/${sub.name} error stack: ${err instanceof Error ? err.stack : ""}`);
        }
      }
    }

    // 4. Execute YouTube Research
    if (isYouTubeConfigured() && config.youtubeChannels.some(c => c.enabled)) {
      log("📺 Starting YouTube research...");
      const yt = YouTubeMonitorClient.fromConfig();
      for (const channel of config.youtubeChannels.filter(c => c.enabled)) {
        log(`   - Searching channel ${channel.channelName}...`);
        try {
          // Resolve channel ID if empty
          let channelId = channel.channelId;
          if (!channelId) {
            const resolved = await yt.getChannelByHandle(channel.channelName);
            if (resolved) channelId = resolved.id;
          }

          if (channelId) {
            const minDate = new Date();
            minDate.setHours(minDate.getHours() - (channel.maxAgeHours || DEFAULT_YOUTUBE_MAX_AGE_HOURS));
            const videos = await yt.getLatestVideos(channelId, { maxResults: YOUTUBE_VIDEOS_PER_CHANNEL, publishedAfter: minDate });
            totalFound += videos.length;

            for (const video of videos) {
              const relevance = calculateRelevance(video.title + " " + video.description, config.aiKeywords);
              if (relevance.isAiRelated) {
                youtubeVideos.push(mapYouTubeVideoToApi(video, jobId, relevance));
              }
            }
          }
        } catch (err) {
          logError(`     Error searching channel ${channel.channelName}: ${formatError(err)}`);
          logDebug(`YouTube ${channel.channelName} error stack: ${err instanceof Error ? err.stack : ""}`);
        }
      }
    }

    // 5. Execute X (Twitter) Research
    if (isXConfigured() && config.xAccounts.some(a => a.enabled)) {
      log("🐦 Starting X research...");
      const x = XClient.fromConfig();
      if (x) {
        for (const account of config.xAccounts.filter(a => a.enabled)) {
          log(`   - Searching @${account.username}...`);
          try {
            const tweets = await x.getUserTweets(account.username, X_POSTS_PER_ACCOUNT);
            totalFound += tweets.length;

            for (const tweet of tweets) {
              const postDate = new Date(tweet.createdAt);
              const ageHours = (Date.now() - postDate.getTime()) / (1000 * 60 * 60);

              if (ageHours > account.maxAgeHours) continue;

              const relevance = calculateRelevance(tweet.text, config.aiKeywords.concat(account.searchKeywords));
              if (relevance.isAiRelated) {
                xPosts.push(mapXPostToApi(tweet, jobId, relevance));
              }
            }
          } catch (err) {
            logError(`     Error searching @${account.username}: ${formatError(err)}`);
            logDebug(`X @${account.username} error stack: ${err instanceof Error ? err.stack : ""}`);
          }
        }
      }
    }

    // 6. Save results back to API
    log(`💾 Saving ${redditPosts.length} Reddit posts, ${youtubeVideos.length} YouTube videos, and ${xPosts.length} X posts...`);
    if (redditPosts.length > 0) {
      await apiRequest(`/api/research/jobs/${jobId}/reddit-posts`, {
        method: "POST",
        body: redditPosts,
        signal: apiTimeoutSignal(),
      });
    }
    if (youtubeVideos.length > 0) {
      await apiRequest(`/api/research/jobs/${jobId}/youtube-videos`, {
        method: "POST",
        body: youtubeVideos,
        signal: apiTimeoutSignal(),
      });
    }
    if (xPosts.length > 0) {
      await apiRequest(`/api/research/jobs/${jobId}/x-posts`, {
        method: "POST",
        body: xPosts,
        signal: apiTimeoutSignal(),
      });
    }

    // 7. Generate Summary
    log("🧠 Generating AI summary...");
    const summary = await generateSummary(redditPosts, youtubeVideos, config.aiKeywords, xPosts);
    let kbEntryId: string | undefined;

    if (summary) {
      // 7.1 Save summary to KB
      try {
        log("💾 Storing summary in Knowledge Base...");
        const brain = new ApiBrain({ agentId: "researcher", agentType: "supervisor" });
        kbEntryId = await brain.remember(
          `AI Research Summary (${new Date().toLocaleDateString()}):\n\n${summary.fullSummary}\n\nKey Insights:\n${summary.keyInsights.map(i => "- " + i).join("\n")}`,
          ["research", "ai-news", jobId]
        );
      } catch (err) {
        logError(`   Failed to store in KB: ${formatError(err)}`);
        logDebug(`KB store error stack: ${err instanceof Error ? err.stack : ""}`);
      }

      // 7.2 Save summary to API
      await apiRequest(`/api/research/jobs/${jobId}/summary`, { 
        method: "POST", 
        body: {
          ...summary,
          jobId,
          date: new Date().toISOString(),
          totalPosts: redditPosts.length + youtubeVideos.length + xPosts.length,
          redditCount: redditPosts.length,
          youtubeCount: youtubeVideos.length,
          xCount: xPosts.length,
          storedInKB: !!kbEntryId,
          kbEntryId,
        },
        signal: apiTimeoutSignal(),
      });

      // 7.3 Send Notification
      const gchatEnabled = config.notificationChannels.find(c => c.type === "google_chat" && c.enabled);
      if (gchatEnabled) {
        log("🔔 Sending Google Chat notification...");
        try {
          const truncatedSummary = summary.fullSummary.length > NOTIFICATION_SUMMARY_MAX_LENGTH
            ? summary.fullSummary.slice(0, NOTIFICATION_SUMMARY_MAX_LENGTH) + "..."
            : summary.fullSummary;

          const notificationText = `🔍 *AI News Research Complete* (${new Date().toLocaleDateString()})\n\n` +
            `*Job ID:* \`${jobId}\`\n` +
            `*Stats:* ${redditPosts.length} Reddit, ${youtubeVideos.length} YouTube, ${xPosts.length} X\n\n` +
            `*Key Insights:*\n${summary.keyInsights.map(i => "• " + i).join("\n")}\n\n` +
            `*Summary:* ${truncatedSummary}\n\n` +
            `View details: \`husky research results ${jobId}\``;
          
          await apiRequest("/api/google-chat/send", {
            method: "POST",
            body: { text: notificationText, threadName: `research-${jobId}` },
            signal: apiTimeoutSignal(),
          });
        } catch (err) {
          logError(`   Failed to send notification: ${formatError(err)}`);
          logDebug(`Notification error stack: ${err instanceof Error ? err.stack : ""}`);
        }
      }
    }

    // 8. Mark job as completed
    await apiRequest(`/api/research/jobs/${jobId}`, {
      method: "PATCH",
      body: { 
        status: "completed", 
        completedAt: new Date().toISOString(),
        totalPostsFound: totalFound,
        totalPostsFiltered: redditPosts.length + youtubeVideos.length + xPosts.length
      },
      signal: apiTimeoutSignal(),
    });

    logSuccess("✨ Research job completed successfully!");

  } catch (error) {
    logError(`❌ Research job failed: ${formatError(error)}`);
    await apiRequest(`/api/research/jobs/${jobId}`, {
      method: "PATCH",
      body: { status: "failed", error: error instanceof Error ? error.message : String(error) },
      signal: apiTimeoutSignal(),
    }).catch((patchErr: unknown) => {
      logDebug(`Failed to mark job as failed: ${formatError(patchErr)}`);
    });
    
    if (jsonOutput) {
      console.log(JSON.stringify({ success: false, error: String(error) }));
    }
    process.exit(1);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateRelevance(text: string, keywords: string[]): RelevanceResult {
  const lowercaseText = text.toLowerCase();
  const matchedKeywords = keywords.filter(kw => {
    // Use word boundary regex so "AI" doesn't match "email", "said", etc.
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    return pattern.test(lowercaseText);
  });
  
  const isAiRelated = matchedKeywords.length > 0;
  const relevanceScore = Math.min(matchedKeywords.length * RELEVANCE_SCORE_PER_KEYWORD, MAX_RELEVANCE_SCORE);
  const relevanceReason = isAiRelated ? `Matches keywords: ${matchedKeywords.join(", ")}` : "No AI keywords found";
  
  return {
    isAiRelated,
    relevanceScore,
    relevanceReason,
    tags: matchedKeywords
  };
}

function mapRedditPostToApi(post: CliRedditPost, jobId: string, relevance: RelevanceResult): MappedRedditPost {
  return {
    ...relevance,
    jobId,
    fetchedAt: new Date().toISOString(),
    redditPostId: post.id,
    subreddit: post.subreddit,
    title: post.title,
    content: post.selftext,
    url: post.url,
    discussionUrl: `https://reddit.com${post.permalink}`,
    author: post.author,
    score: post.score,
    upvoteRatio: post.upvoteRatio,
    commentCount: post.numComments,
    createdAt: new Date(post.createdUtc * 1000).toISOString(),
  };
}

function mapYouTubeVideoToApi(video: CliYouTubeVideo, jobId: string, relevance: RelevanceResult): MappedYouTubeVideo {
  return {
    ...relevance,
    jobId,
    fetchedAt: new Date().toISOString(),
    videoId: video.id,
    channelId: video.channelId,
    channelName: video.channelTitle,
    title: video.title,
    description: video.description,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    publishedAt: new Date(video.publishedAt).toISOString(),
  };
}

function mapXPostToApi(tweet: CliXPost, jobId: string, relevance: RelevanceResult): MappedXPost {
  return {
    ...relevance,
    jobId,
    fetchedAt: new Date().toISOString(),
    postId: tweet.id,
    username: tweet.username,
    content: tweet.text,
    url: `https://twitter.com/${tweet.username}/status/${tweet.id}`,
    postedAt: new Date(tweet.createdAt).toISOString(),
    likes: tweet.publicMetrics.likeCount,
    retweets: tweet.publicMetrics.retweetCount,
  };
}

async function generateSummary(
  redditPosts: MappedRedditPost[],
  youtubeVideos: MappedYouTubeVideo[],
  keywords: string[],
  xPosts: MappedXPost[] = []
): Promise<GeneratedSummary | null> {
  try {
    const cliConfig = getConfig();
    const env = process.env.HUSKY_ENV || 'PROD';
    const apiKey = process.env[`${env}_GEMINI_API_KEY`] || process.env.GEMINI_API_KEY || cliConfig.geminiApiKey;

    if (!apiKey) {
      console.warn("   ⚠️  Gemini API Key not configured. Skipping AI summary.");
      const totalPosts = redditPosts.length + youtubeVideos.length + xPosts.length;
      return {
        fullSummary: "AI summary skipped due to missing API key.",
        keyInsights: [`Collected ${totalPosts} posts.`],
        topPosts: {
          reddit: [...redditPosts].sort((a, b) => b.score - a.score)[0],
          youtube: [...youtubeVideos].sort((a, b) => b.relevanceScore - a.relevanceScore)[0],
          x: [...xPosts].sort((a, b) => b.likes - a.likes)[0],
        }
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const topReddit = [...redditPosts].sort((a, b) => b.score - a.score).slice(0, SUMMARY_TOP_REDDIT_COUNT);
    const topYouTube = [...youtubeVideos].sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, SUMMARY_TOP_YOUTUBE_COUNT);
    const topX = [...xPosts].sort((a, b) => b.likes - a.likes).slice(0, SUMMARY_TOP_X_COUNT);

    // Sanitize all user content before interpolating into the prompt
    const redditLines = topReddit
      .map(p => `- [r/${sanitizeForPrompt(p.subreddit)}] ${sanitizeForPrompt(p.title)} (${p.discussionUrl})`)
      .join("\n");
    const youtubLines = topYouTube
      .map(v => `- [${sanitizeForPrompt(v.channelName)}] ${sanitizeForPrompt(v.title)} (${v.url})`)
      .join("\n");
    const xLines = topX
      .map(x => `- [@${sanitizeForPrompt(x.username)}] ${sanitizeForPrompt(x.content).slice(0, X_POST_CONTENT_PREVIEW_LENGTH)} (${x.url})`)
      .join("\n");

    const prompt = `You are an AI News Researcher. Summarize the following AI-related posts and videos collected today.
Keywords of interest: ${keywords.map(sanitizeForPrompt).join(", ")}

Reddit Posts:
${redditLines || "(none)"}

YouTube Videos:
${youtubLines || "(none)"}

X (Twitter) Posts:
${xLines || "(none)"}

Format your response as a JSON object with:
- fullSummary: A comprehensive 2-3 paragraph summary of the day's AI news.
- keyInsights: A string array of 3-7 actionable or interesting insights.

Respond ONLY with the JSON object.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Robust JSON extraction
    const summaryData = extractJsonFromLlmResponse(text);
    if (summaryData) {
      return {
        fullSummary: typeof summaryData.fullSummary === "string" ? summaryData.fullSummary : "Summary unavailable.",
        keyInsights: Array.isArray(summaryData.keyInsights)
          ? summaryData.keyInsights.filter((i): i is string => typeof i === "string")
          : [],
        topPosts: {
          reddit: topReddit[0],
          youtube: topYouTube[0],
          x: topX[0],
        }
      };
    }

    if (process.env.DEBUG) {
      console.error("[debug] Failed to extract JSON from Gemini response:", text.slice(0, 500));
    }
  } catch (error) {
    console.error("   ❌ Failed to generate summary:", formatError(error));
    if (process.env.DEBUG) {
      console.error("[debug] Summary generation error stack:", error instanceof Error ? error.stack : "");
    }
  }
  return null;
}
