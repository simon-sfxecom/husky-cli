/**
 * Zendesk API Client
 * Extended for v0.9 with macros and enhanced ticket operations
 */
import { ZendeskConfig, ZendeskTicket, ZendeskUser, TicketComment, CreateTicketRequest, UpdateTicketRequest, PaginationParams, Attachment, ZendeskMacro } from './zendesk-types.js';
export declare class ZendeskClient {
    private config;
    private baseUrl;
    constructor(config: ZendeskConfig);
    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig(): ZendeskClient;
    /**
     * Make authenticated request
     */
    private request;
    listTickets(params?: PaginationParams & {
        status?: string;
    }): Promise<ZendeskTicket[]>;
    getTicket(ticketId: number): Promise<ZendeskTicket>;
    createTicket(data: CreateTicketRequest): Promise<ZendeskTicket>;
    updateTicket(ticketId: number, data: UpdateTicketRequest): Promise<ZendeskTicket>;
    deleteTicket(ticketId: number): Promise<void>;
    addComment(ticketId: number, body: string, isPublic?: boolean): Promise<ZendeskTicket>;
    addInternalNote(ticketId: number, body: string): Promise<ZendeskTicket>;
    closeTicket(ticketId: number): Promise<ZendeskTicket>;
    assignTicket(ticketId: number, assigneeId: number): Promise<ZendeskTicket>;
    addTags(ticketId: number, tags: string[]): Promise<ZendeskTicket>;
    removeTags(ticketId: number, tags: string[]): Promise<ZendeskTicket>;
    getTicketComments(ticketId: number): Promise<TicketComment[]>;
    searchTickets(query: string): Promise<ZendeskTicket[]>;
    getTicketAttachments(ticketId: number): Promise<Attachment[]>;
    downloadAttachment(contentUrl: string): Promise<ArrayBuffer>;
    getUser(userId: number): Promise<ZendeskUser>;
    searchUsers(query: string): Promise<ZendeskUser[]>;
    getUserTickets(userId: number): Promise<ZendeskTicket[]>;
    listMacros(params?: {
        active?: boolean;
        category?: number;
    }): Promise<ZendeskMacro[]>;
    getMacro(macroId: number): Promise<ZendeskMacro>;
    applyMacro(ticketId: number, macroId: number): Promise<ZendeskTicket>;
}
export default ZendeskClient;
