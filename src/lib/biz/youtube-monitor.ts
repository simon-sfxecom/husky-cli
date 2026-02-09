import { getConfig } from "../../commands/config.js";

export interface YouTubeConfig {
  apiKey: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
  };
  duration?: string;
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnails: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
  subscriberCount?: string;
  videoCount?: string;
}

interface YouTubeApiResponse<T> {
  items: T[];
  nextPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
}

interface RawChannelItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    publishedAt: string;
    thumbnails: YouTubeChannel['thumbnails'];
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
  };
}

function mapChannelItem(item: RawChannelItem): YouTubeChannel {
  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    customUrl: item.snippet.customUrl,
    publishedAt: item.snippet.publishedAt,
    thumbnails: item.snippet.thumbnails,
    subscriberCount: item.statistics?.subscriberCount,
    videoCount: item.statistics?.videoCount,
  };
}

export class YouTubeMonitorClient {
  private config: YouTubeConfig;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(config: YouTubeConfig) {
    this.config = config;
  }

  static fromConfig(): YouTubeMonitorClient {
    const config = getConfig();
    const env = process.env.HUSKY_ENV || 'PROD';
    
    const apiKey = process.env[`${env}_YOUTUBE_API_KEY`] || process.env.YOUTUBE_API_KEY || config.youtubeApiKey;
    
    if (!apiKey) {
      throw new Error("YouTube API Key not configured. Please set youtube-api-key.");
    }

    const clientConfig: YouTubeConfig = {
      apiKey,
    };
    
    return new YouTubeMonitorClient(clientConfig);
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, string>, retryCount = 0): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append('key', this.config.apiKey);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.append(key, value);
    });

    const timeout = 15000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(id);

      if (response.status === 429 && retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 5000 * (retryCount + 1)));
        return this.makeRequest<T>(endpoint, params, retryCount + 1);
      }

      if (!response.ok) {
        const error = await response.text();
        // Redact API key from error message
        const redactedError = error.replace(this.config.apiKey, '[REDACTED]');
        throw new Error(`YouTube API error: ${response.status} ${response.statusText} - ${redactedError}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async getChannelById(channelId: string): Promise<YouTubeChannel | null> {
    const data = await this.makeRequest<YouTubeApiResponse<RawChannelItem>>('/channels', {
      part: 'snippet,statistics',
      id: channelId,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    return mapChannelItem(data.items[0]);
  }

  async getChannelByHandle(handle: string): Promise<YouTubeChannel | null> {
    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    
    const data = await this.makeRequest<YouTubeApiResponse<RawChannelItem>>('/channels', {
      part: 'snippet,statistics',
      forHandle: cleanHandle,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    return mapChannelItem(data.items[0]);
  }

  async getLatestVideos(
    channelId: string,
    options: {
      maxResults?: number;
      publishedAfter?: Date;
    } = {}
  ): Promise<YouTubeVideo[]> {
    const { maxResults = 10, publishedAfter } = options;
    const clampedResults = Math.min(maxResults, 50);

    const params: Record<string, string> = {
      part: 'snippet',
      channelId,
      type: 'video',
      order: 'date',
      maxResults: clampedResults.toString(),
    };

    if (publishedAfter) {
      params.publishedAfter = publishedAfter.toISOString();
    }

    const data = await this.makeRequest<YouTubeApiResponse<{
      id: { videoId: string };
      snippet: {
        title: string;
        description: string;
        channelId: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: YouTubeVideo['thumbnails'];
      };
    }>>('/search', params);

    if (!data.items || data.items.length === 0) {
      return [];
    }

    const videoIds = data.items.map(item => item.id.videoId).filter(Boolean);

    if (videoIds.length === 0) {
      return [];
    }

    // Get video details for duration, view count, etc. (Max 50 IDs per call)
    const detailsData = await this.makeRequest<YouTubeApiResponse<{
      id: string;
      contentDetails?: {
        duration: string;
      };
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>>('/videos', {
      part: 'contentDetails,statistics',
      id: videoIds.slice(0, 50).join(','),
    });

    const detailsMap = new Map(
      detailsData.items?.map(item => [item.id, item]) || []
    );

    return data.items
      .filter(item => item.id.videoId)
      .map(item => {
        const videoId = item.id.videoId;
        const details = detailsMap.get(videoId);

        return {
          id: videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          channelId: item.snippet.channelId,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
          duration: details?.contentDetails?.duration,
          viewCount: details?.statistics?.viewCount,
          likeCount: details?.statistics?.likeCount,
          commentCount: details?.statistics?.commentCount,
        };
      });
  }

  async getVideoTranscript(videoId: string): Promise<string | null> {
    try {
      const { YoutubeTranscript } = await import('youtube-transcript');
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      return transcript.map(entry => entry.text).join(' ');
    } catch (error) {
      return null;
    }
  }

  async searchVideos(
    query: string,
    options: {
      maxResults?: number;
      publishedAfter?: Date;
      channelId?: string;
    } = {}
  ): Promise<YouTubeVideo[]> {
    const { maxResults = 10, publishedAfter, channelId } = options;
    const clampedResults = Math.min(maxResults, 50);

    const params: Record<string, string> = {
      part: 'snippet',
      q: query,
      type: 'video',
      order: 'date',
      maxResults: clampedResults.toString(),
    };

    if (publishedAfter) {
      params.publishedAfter = publishedAfter.toISOString();
    }

    if (channelId) {
      params.channelId = channelId;
    }

    const data = await this.makeRequest<YouTubeApiResponse<{
      id: { videoId: string };
      snippet: {
        title: string;
        description: string;
        channelId: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: YouTubeVideo['thumbnails'];
      };
    }>>('/search', params);

    if (!data.items) {
      return [];
    }

    return data.items
      .filter(item => item.id.videoId)
      .map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnails: item.snippet.thumbnails,
      }));
  }
}

export function isYouTubeConfigured(): boolean {
  const config = getConfig();
  const env = process.env.HUSKY_ENV || 'PROD';
  const apiKey = process.env[`${env}_YOUTUBE_API_KEY`] || process.env.YOUTUBE_API_KEY || config.youtubeApiKey;
  return !!apiKey;
}
