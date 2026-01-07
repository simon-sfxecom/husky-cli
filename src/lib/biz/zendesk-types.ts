/**
 * Zendesk API Types
 * Extended for v0.9 with macros support
 */

// Configuration
export interface ZendeskConfig {
    SUBDOMAIN: string;
    EMAIL: string;
    API_TOKEN: string;
    BASE_URL?: string;
}

// Enums
export enum TicketPriority {
    Low = 'low',
    Normal = 'normal',
    High = 'high',
    Urgent = 'urgent',
}

export enum TicketStatus {
    New = 'new',
    Open = 'open',
    Pending = 'pending',
    Hold = 'hold',
    Solved = 'solved',
    Closed = 'closed',
}

export enum TicketType {
    Problem = 'problem',
    Incident = 'incident',
    Question = 'question',
    Task = 'task',
}

// Pagination
export interface PaginationParams {
    page?: number;
    per_page?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

// User
export interface ZendeskUser {
    id: number;
    name: string;
    email: string;
    phone?: string;
    role: string;
    created_at: string;
    updated_at: string;
    organization_id?: number;
    tags?: string[];
}

// Ticket
export interface ZendeskTicket {
    id: number;
    subject: string;
    description?: string;
    status: TicketStatus | string;
    priority?: TicketPriority | string;
    type?: TicketType | string;
    requester_id?: number;
    assignee_id?: number;
    group_id?: number;
    tags?: string[];
    custom_fields?: Array<{ id: number; value: unknown }>;
    created_at: string;
    updated_at: string;
    url?: string;
}

// Ticket Comment
export interface TicketComment {
    id: number;
    type: string;
    author_id: number;
    body: string;
    html_body?: string;
    public: boolean;
    created_at: string;
    attachments?: Attachment[];
}

// Attachment
export interface Attachment {
    id: number;
    file_name: string;
    content_url: string;
    content_type: string;
    size: number;
}

// Create/Update Ticket
export interface CreateTicketRequest {
    subject: string;
    comment: {
        body: string;
        public?: boolean;
    };
    requester?: {
        name?: string;
        email?: string;
    };
    requester_id?: number;
    priority?: TicketPriority | string;
    status?: TicketStatus | string;
    type?: TicketType | string;
    tags?: string[];
    assignee_id?: number;
}

export interface UpdateTicketRequest {
    subject?: string;
    comment?: {
        body: string;
        public?: boolean;
    };
    status?: TicketStatus | string;
    priority?: TicketPriority | string;
    assignee_id?: number;
    tags?: string[];
}

// Search Result
export interface SearchResult<T> {
    results: T[];
    count: number;
    next_page: string | null;
    previous_page: string | null;
}

// ============================================================================
// Macros (Templates)
// ============================================================================

export interface MacroAction {
    field: string;
    value: string | string[];
}

export interface ZendeskMacro {
    id: number;
    title: string;
    description?: string;
    active: boolean;
    actions: MacroAction[];
    restriction?: {
        type: string;
        id?: number;
        ids?: number[];
    };
    created_at: string;
    updated_at: string;
    url?: string;
}
