import { getConfig } from "../../commands/config.js";

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

export interface RedditApiPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  author: string;
  subreddit: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  is_self: boolean;
  thumbnail?: string;
}

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  author: string;
  subreddit: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
  isSelf: boolean;
  thumbnail?: string;
}

export interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  replies?: { data: { children: Array<{ data: RedditComment }> } };
}

interface RedditListingResponse<T> {
  data: {
    children: Array<{ kind: string; data: T }>;
    after: string | null;
  };
}

function mapRedditPost(raw: RedditApiPost): RedditPost {
  return {
    id: raw.id,
    title: raw.title,
    selftext: raw.selftext,
    url: raw.url,
    author: raw.author,
    subreddit: raw.subreddit,
    score: raw.score,
    upvoteRatio: raw.upvote_ratio,
    numComments: raw.num_comments,
    createdUtc: raw.created_utc,
    permalink: raw.permalink,
    isSelf: raw.is_self,
    thumbnail: raw.thumbnail,
  };
}

export class RedditClient {
  private config: RedditConfig;
  private accessToken?: string;
  private tokenExpiry?: number;
  private baseUrl = 'https://oauth.reddit.com';
  private static AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
  private static TOKEN_REFRESH_BUFFER_MS = 60_000;

  constructor(config: RedditConfig) {
    this.config = config;
  }

  static fromConfig(): RedditClient {
    const config = getConfig();
    const env = process.env.HUSKY_ENV || 'PROD';
    
    const clientId = process.env[`${env}_REDDIT_CLIENT_ID`] || process.env.REDDIT_CLIENT_ID || config.redditClientId;
    const clientSecret = process.env[`${env}_REDDIT_CLIENT_SECRET`] || process.env.REDDIT_CLIENT_SECRET || config.redditClientSecret;
    
    if (!clientId || !clientSecret) {
      throw new Error("Reddit credentials not configured. Please set reddit-client-id and reddit-client-secret.");
    }

    const clientConfig: RedditConfig = {
      clientId,
      clientSecret,
      userAgent: process.env.REDDIT_USER_AGENT || 'HuskyResearchBot/1.0 (by /u/husky-bot)',
    };
    
    return new RedditClient(clientConfig);
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return;
    }

    const authString = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    
    const timeout = 15000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(RedditClient.AUTH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.config.userAgent,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
        }),
        signal: controller.signal,
      });

      clearTimeout(id);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reddit auth failed: ${response.status} ${response.statusText} - ${errorText.substring(0, 500)}`);
      }

      const data = await response.json() as RedditTokenResponse;
      if (!data.access_token) {
        throw new Error("Reddit auth response missing access_token");
      }
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - RedditClient.TOKEN_REFRESH_BUFFER_MS;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  private async makeRequest<T>(endpoint: string, params?: Record<string, string>, retryCount = 0): Promise<T> {
    await this.ensureAuthenticated();

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const timeout = 15000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': this.config.userAgent,
        },
        signal: controller.signal,
      });

      clearTimeout(id);

      if (response.status === 429 && retryCount < 2) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));
        return this.makeRequest<T>(endpoint, params, retryCount + 1);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reddit API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 500)}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async getSubredditPosts(
    subreddit: string,
    options: {
      sort?: 'hot' | 'new' | 'top' | 'rising';
      time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      limit?: number;
      after?: string;
    } = {}
  ): Promise<{ posts: RedditPost[]; after: string | null }> {
    const { sort = 'hot', time = 'day', limit = 25, after } = options;
    
    const params: Record<string, string> = {
      limit: Math.min(limit, 100).toString(),
    };
    
    if (time && (sort === 'top' || sort === 'new')) { // Reddit also accepts 't' for some other sorts
      params.t = time;
    }
    if (after) {
      params.after = after;
    }

    const safeSubreddit = encodeURIComponent(subreddit);
    const data = await this.makeRequest<RedditListingResponse<RedditApiPost>>(
      `/r/${safeSubreddit}/${sort}`,
      params
    );

    return {
      posts: data.data.children.filter(child => child.kind === 't3').map(child => mapRedditPost(child.data)),
      after: data.data.after,
    };
  }

  async searchSubreddit(
    subreddit: string,
    query: string,
    options: {
      sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
      time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      limit?: number;
    } = {}
  ): Promise<RedditPost[]> {
    const { sort = 'relevance', time = 'week', limit = 25 } = options;
    
    const params: Record<string, string> = {
      q: query,
      restrict_sr: 'true',
      sort,
      t: time,
      limit: Math.min(limit, 100).toString(),
    };

    const safeSubreddit = encodeURIComponent(subreddit);
    const data = await this.makeRequest<RedditListingResponse<RedditApiPost>>(
      `/r/${safeSubreddit}/search`,
      params
    );

    return data.data.children.filter(child => child.kind === 't3').map(child => mapRedditPost(child.data));
  }

  async getPostComments(postId: string, subreddit: string): Promise<RedditComment[]> {
    const safeSubreddit = encodeURIComponent(subreddit);
    const safePostId = encodeURIComponent(postId);
    const data = await this.makeRequest<any[]>(`/r/${safeSubreddit}/comments/${safePostId}`);
    
    if (Array.isArray(data) && data.length > 1) {
      const commentsData = data[1] as RedditListingResponse<RedditComment>;
      return commentsData.data.children
        .filter(child => child.kind === 't1')
        .map(child => child.data);
    }
    
    return [];
  }
}

export function isRedditConfigured(): boolean {
  const config = getConfig();
  const env = process.env.HUSKY_ENV || 'PROD';
  const clientId = process.env[`${env}_REDDIT_CLIENT_ID`] || process.env.REDDIT_CLIENT_ID || config.redditClientId;
  const clientSecret = process.env[`${env}_REDDIT_CLIENT_SECRET`] || process.env.REDDIT_CLIENT_SECRET || config.redditClientSecret;
  return !!(clientId && clientSecret);
}
