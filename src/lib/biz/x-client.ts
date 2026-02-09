import { getConfig } from "../../commands/config.js";

export interface XConfig {
  bearerToken: string;
}

export interface XPost {
  id: string;
  text: string;
  authorId: string;
  username: string;
  createdAt: string;
  publicMetrics: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
  };
}

interface XRawTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
  };
}

interface XRawUser {
  id: string;
  username: string;
  name: string;
}

interface XSearchResponse {
  data?: XRawTweet[];
  includes?: {
    users?: XRawUser[];
  };
  errors?: any[];
}

interface XUserLookupResponse {
  data?: XRawUser;
  errors?: any[];
}

export class XClient {
  private config: XConfig;
  private baseUrl = 'https://api.twitter.com/2';
  private userIdCache = new Map<string, string>();

  constructor(config: XConfig) {
    this.config = config;
  }

  static fromConfig(): XClient | null {
    const config = getConfig();
    const env = process.env.HUSKY_ENV || 'PROD';
    
    const bearerToken = process.env[`${env}_X_BEARER_TOKEN`] || process.env.X_BEARER_TOKEN || config.xBearerToken;
    
    if (!bearerToken) {
      return null;
    }

    return new XClient({ bearerToken });
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, string>, retryCount = 0): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const timeout = 15000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.config.bearerToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(id);

      if (response.status === 429 && retryCount < 2) {
        const resetTime = parseInt(response.headers.get('x-rate-limit-reset') || '0', 10);
        const waitTime = resetTime ? Math.max(0, (resetTime * 1000) - Date.now() + 1000) : 5000;
        
        // Cap wait time to 30s for CLI
        if (waitTime < 30000) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.makeRequest<T>(endpoint, params, retryCount + 1);
        }
      }

      if (!response.ok) {
        const error = await response.text();
        // Redact token if it somehow ended up in the error text
        const redactedError = error.replace(this.config.bearerToken, '[REDACTED]');
        throw new Error(`X API error: ${response.status} ${response.statusText} - ${redactedError}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async searchRecentTweets(query: string, maxResults = 10): Promise<XPost[]> {
    const clampedResults = Math.max(10, Math.min(maxResults, 100));
    const data = await this.makeRequest<XSearchResponse>('/tweets/search/recent', {
      query,
      max_results: clampedResults.toString(),
      'tweet.fields': 'created_at,public_metrics,author_id',
      expansions: 'author_id',
      'user.fields': 'username',
    });

    if (!data.data) return [];

    const users = new Map(data.includes?.users?.map(u => [u.id, u.username]) || []);

    return data.data.map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id,
      username: users.get(tweet.author_id) || 'unknown',
      createdAt: tweet.created_at,
      publicMetrics: {
        retweetCount: tweet.public_metrics?.retweet_count ?? 0,
        replyCount: tweet.public_metrics?.reply_count ?? 0,
        likeCount: tweet.public_metrics?.like_count ?? 0,
        quoteCount: tweet.public_metrics?.quote_count ?? 0,
      },
    }));
  }

  async getUserTweets(username: string, maxResults = 10): Promise<XPost[]> {
    const clampedResults = Math.max(5, Math.min(maxResults, 100));
    const cleanUsername = encodeURIComponent(username.replace('@', ''));
    
    // 1. Resolve username to ID (with cache)
    let userId = this.userIdCache.get(cleanUsername);
    if (!userId) {
      const userData = await this.makeRequest<XUserLookupResponse>(`/users/by/username/${cleanUsername}`, {});
      if (!userData.data) return [];
      userId = userData.data.id;
      this.userIdCache.set(cleanUsername, userId);
    }

    // 2. Get tweets
    const data = await this.makeRequest<XSearchResponse>(`/users/${encodeURIComponent(userId)}/tweets`, {
      max_results: clampedResults.toString(),
      'tweet.fields': 'created_at,public_metrics,author_id',
      expansions: 'author_id',
      'user.fields': 'username',
    });

    if (!data.data) return [];

    return data.data.map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id,
      username: username,
      createdAt: tweet.created_at,
      publicMetrics: {
        retweetCount: tweet.public_metrics?.retweet_count ?? 0,
        replyCount: tweet.public_metrics?.reply_count ?? 0,
        likeCount: tweet.public_metrics?.like_count ?? 0,
        quoteCount: tweet.public_metrics?.quote_count ?? 0,
      },
    }));
  }
}

export function isXConfigured(): boolean {
  const config = getConfig();
  const env = process.env.HUSKY_ENV || 'PROD';
  const bearerToken = process.env[`${env}_X_BEARER_TOKEN`] || process.env.X_BEARER_TOKEN || config.xBearerToken;
  return !!bearerToken;
}
