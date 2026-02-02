/**
 * Zendesk Proxy Client
 *
 * Wraps API proxy calls for Zendesk operations.
 * This client uses server-side credentials via the Husky API proxy.
 */

import { apiRequest } from '../api-client.js';
import type {
  ZendeskTicket,
  ZendeskUser,
  TicketComment,
  ZendeskMacro,
} from './zendesk-types.js';

export class ZendeskProxyClient {
  private available: boolean | null = null;

  /**
   * Check if proxy is available (has permission)
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    try {
      await apiRequest<{ status: string }>('/api/proxy/zendesk/users', {
        method: 'GET',
      });
      this.available = true;
      return true;
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('403') || err.message.includes('401') || err.message.includes('Forbidden')) {
        this.available = false;
        return false;
      }
      // Network error - treat as unavailable
      this.available = false;
      return false;
    }
  }

  // =========================================================================
  // TICKETS
  // =========================================================================

  async listTickets(params?: { status?: string; per_page?: number; page?: number }): Promise<ZendeskTicket[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.per_page) query.set('per_page', String(params.per_page));
    if (params?.page) query.set('page', String(params.page));

    const queryString = query.toString();
    const endpoint = `/api/proxy/zendesk/tickets${queryString ? `?${queryString}` : ''}`;

    const response = await apiRequest<{ tickets: ZendeskTicket[] }>(endpoint);
    return response.tickets;
  }

  async getTicket(ticketId: number): Promise<{ ticket: ZendeskTicket; comments: TicketComment[] }> {
    const response = await apiRequest<{ ticket: ZendeskTicket; comments: TicketComment[] }>(
      `/api/proxy/zendesk/tickets/${ticketId}`
    );
    return response;
  }

  async createTicket(data: {
    subject: string;
    comment: { body: string };
    requester?: { email: string };
    priority?: string;
    tags?: string[];
  }): Promise<ZendeskTicket> {
    const response = await apiRequest<{ ticket: ZendeskTicket }>(
      '/api/proxy/zendesk/tickets',
      {
        method: 'POST',
        body: data,
      }
    );
    return response.ticket;
  }

  async updateTicket(
    ticketId: number,
    data: {
      status?: string;
      priority?: string;
      assignee_id?: number;
      tags?: string[];
      custom_fields?: Array<{ id: number; value: unknown }>;
    }
  ): Promise<ZendeskTicket> {
    const response = await apiRequest<{ ticket: ZendeskTicket }>(
      `/api/proxy/zendesk/tickets/${ticketId}`,
      {
        method: 'PATCH',
        body: data,
      }
    );
    return response.ticket;
  }

  async replyToTicket(ticketId: number, body: string, isPublic = true): Promise<ZendeskTicket> {
    const response = await apiRequest<{ success: boolean; ticket: ZendeskTicket }>(
      `/api/proxy/zendesk/tickets/${ticketId}/reply`,
      {
        method: 'POST',
        body: { body, public: isPublic },
      }
    );
    return response.ticket;
  }

  async searchTickets(query: string): Promise<ZendeskTicket[]> {
    const params = new URLSearchParams({ query });
    const response = await apiRequest<{ tickets: ZendeskTicket[] }>(
      `/api/proxy/zendesk/search?${params}`
    );
    return response.tickets;
  }

  // =========================================================================
  // USERS
  // =========================================================================

  async listUsers(): Promise<ZendeskUser[]> {
    const response = await apiRequest<{ users: ZendeskUser[] }>(
      '/api/proxy/zendesk/users'
    );
    return response.users;
  }

  // =========================================================================
  // MACROS
  // =========================================================================

  async listMacros(): Promise<ZendeskMacro[]> {
    const response = await apiRequest<{ macros: ZendeskMacro[] }>(
      '/api/proxy/zendesk/macros'
    );
    return response.macros;
  }
}

// Singleton instance
let proxyClient: ZendeskProxyClient | null = null;

export function getZendeskProxyClient(): ZendeskProxyClient {
  if (!proxyClient) {
    proxyClient = new ZendeskProxyClient();
  }
  return proxyClient;
}

/**
 * Try to use proxy, return null if unavailable.
 * Useful for checking if proxy should be used.
 */
export async function tryZendeskProxy(): Promise<ZendeskProxyClient | null> {
  const client = getZendeskProxyClient();
  const available = await client.isAvailable();
  return available ? client : null;
}

export default ZendeskProxyClient;
