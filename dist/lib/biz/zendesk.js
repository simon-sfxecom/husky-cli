/**
 * Zendesk API Client
 * Extended for v0.9 with macros and enhanced ticket operations
 */
import { getConfig } from '../../commands/config.js';
export class ZendeskClient {
    config;
    baseUrl;
    constructor(config) {
        this.config = config;
        this.baseUrl = config.BASE_URL || `https://${config.SUBDOMAIN}.zendesk.com/api/v2`;
    }
    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig() {
        const config = getConfig();
        const env = process.env.HUSKY_ENV || 'PROD';
        const zendeskConfig = {
            SUBDOMAIN: process.env[`${env}_ZENDESK_SUBDOMAIN`] || process.env.ZENDESK_SUBDOMAIN || config.zendeskSubdomain || '',
            EMAIL: process.env[`${env}_ZENDESK_EMAIL`] || process.env.ZENDESK_EMAIL || config.zendeskEmail || '',
            API_TOKEN: process.env[`${env}_ZENDESK_API_TOKEN`] || process.env.ZENDESK_API_TOKEN || config.zendeskApiToken || '',
        };
        if (!zendeskConfig.SUBDOMAIN || !zendeskConfig.EMAIL || !zendeskConfig.API_TOKEN) {
            throw new Error('Missing Zendesk credentials. Configure with:\n' +
                '  husky config set zendesk-subdomain <subdomain>\n' +
                '  husky config set zendesk-email <email>\n' +
                '  husky config set zendesk-api-token <token>\n' +
                'Or set env vars: PROD_ZENDESK_SUBDOMAIN, PROD_ZENDESK_EMAIL, PROD_ZENDESK_API_TOKEN');
        }
        return new ZendeskClient(zendeskConfig);
    }
    /**
     * Make authenticated request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const auth = Buffer.from(`${this.config.EMAIL}/token:${this.config.API_TOKEN}`).toString('base64');
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Zendesk API Error ${response.status}: ${error}`);
        }
        if (response.status === 204) {
            return {};
        }
        return response.json();
    }
    // =========================================================================
    // TICKETS
    // =========================================================================
    async listTickets(params) {
        const query = new URLSearchParams();
        if (params?.page)
            query.set('page', String(params.page));
        if (params?.per_page)
            query.set('per_page', String(params.per_page));
        if (params?.sort_by)
            query.set('sort_by', params.sort_by);
        if (params?.sort_order)
            query.set('sort_order', params.sort_order);
        // Filter by status using search
        if (params?.status) {
            return this.searchTickets(`status:${params.status}`);
        }
        const endpoint = `/tickets.json${query.toString() ? `?${query}` : ''}`;
        const response = await this.request(endpoint);
        return response.tickets;
    }
    async getTicket(ticketId) {
        const response = await this.request(`/tickets/${ticketId}.json`);
        return response.ticket;
    }
    async createTicket(data) {
        const response = await this.request('/tickets.json', {
            method: 'POST',
            body: JSON.stringify({ ticket: data }),
        });
        return response.ticket;
    }
    async updateTicket(ticketId, data) {
        const response = await this.request(`/tickets/${ticketId}.json`, {
            method: 'PUT',
            body: JSON.stringify({ ticket: data }),
        });
        return response.ticket;
    }
    async deleteTicket(ticketId) {
        await this.request(`/tickets/${ticketId}.json`, { method: 'DELETE' });
    }
    async addComment(ticketId, body, isPublic = true) {
        return this.updateTicket(ticketId, {
            comment: { body, public: isPublic },
        });
    }
    async addInternalNote(ticketId, body) {
        return this.addComment(ticketId, body, false);
    }
    async closeTicket(ticketId) {
        return this.updateTicket(ticketId, { status: 'solved' });
    }
    async assignTicket(ticketId, assigneeId) {
        return this.updateTicket(ticketId, { assignee_id: assigneeId });
    }
    async addTags(ticketId, tags) {
        const ticket = await this.getTicket(ticketId);
        const existingTags = ticket.tags || [];
        const newTags = [...new Set([...existingTags, ...tags])];
        return this.updateTicket(ticketId, { tags: newTags });
    }
    async removeTags(ticketId, tags) {
        const ticket = await this.getTicket(ticketId);
        const existingTags = ticket.tags || [];
        const newTags = existingTags.filter(t => !tags.includes(t));
        return this.updateTicket(ticketId, { tags: newTags });
    }
    async getTicketComments(ticketId) {
        const response = await this.request(`/tickets/${ticketId}/comments.json`);
        return response.comments;
    }
    async searchTickets(query) {
        const searchParams = new URLSearchParams({ query: `type:ticket ${query}` });
        const response = await this.request(`/search.json?${searchParams}`);
        return response.results;
    }
    // =========================================================================
    // ATTACHMENTS
    // =========================================================================
    async getTicketAttachments(ticketId) {
        const comments = await this.getTicketComments(ticketId);
        const attachments = [];
        for (const comment of comments) {
            if (comment.attachments) {
                attachments.push(...comment.attachments);
            }
        }
        return attachments;
    }
    async downloadAttachment(contentUrl) {
        const auth = Buffer.from(`${this.config.EMAIL}/token:${this.config.API_TOKEN}`).toString('base64');
        const response = await fetch(contentUrl, {
            headers: { 'Authorization': `Basic ${auth}` },
        });
        if (!response.ok) {
            throw new Error(`Failed to download attachment: ${response.status}`);
        }
        return response.arrayBuffer();
    }
    // =========================================================================
    // USERS
    // =========================================================================
    async getUser(userId) {
        const response = await this.request(`/users/${userId}.json`);
        return response.user;
    }
    async searchUsers(query) {
        const searchParams = new URLSearchParams({ query });
        const response = await this.request(`/users/search.json?${searchParams}`);
        return response.users;
    }
    async getUserTickets(userId) {
        const response = await this.request(`/users/${userId}/tickets/requested.json`);
        return response.tickets;
    }
    // =========================================================================
    // MACROS (Templates)
    // =========================================================================
    async listMacros(params) {
        const query = new URLSearchParams();
        if (params?.active !== undefined)
            query.set('active', String(params.active));
        if (params?.category)
            query.set('category', String(params.category));
        const endpoint = `/macros.json${query.toString() ? `?${query}` : ''}`;
        const response = await this.request(endpoint);
        return response.macros;
    }
    async getMacro(macroId) {
        const response = await this.request(`/macros/${macroId}.json`);
        return response.macro;
    }
    async applyMacro(ticketId, macroId) {
        // Get macro to extract its actions
        const macro = await this.getMacro(macroId);
        // Build update from macro actions
        const update = {};
        for (const action of macro.actions) {
            if (action.field === 'comment_value' || action.field === 'comment_value_html') {
                update.comment = { body: String(action.value), public: true };
            }
            else if (action.field === 'status') {
                update.status = String(action.value);
            }
            else if (action.field === 'priority') {
                update.priority = String(action.value);
            }
        }
        return this.updateTicket(ticketId, update);
    }
}
export default ZendeskClient;
