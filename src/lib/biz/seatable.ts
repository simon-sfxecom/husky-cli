/**
 * SeaTable API Client
 * Ported from TigerV0 with Husky Biz CLI integration
 * 
 * IMPORTANT: SeaTable uses a 2-stage token system:
 * 1. API Token (permanent) - generated in SeaTable UI
 * 2. Base Token (3 days TTL) - generated from API Token automatically
 */

import type {
    SeaTableConfig,
    SeaTableRow,
    SeaTableMetadata,
    QueryRowsParams,
    FilterParams,
    RowData,
    QueryResponse,
} from './seatable-types.js';
import { getConfig } from '../../commands/config.js';

interface BaseTokenResponse {
    app_name: string;
    access_token: string;
    dtable_uuid: string;
    dtable_server: string;
    dtable_socket: string;
}

export class SeaTableClient {
    private serverUrl: string;
    private apiToken: string;
    private baseToken: string | null = null;
    private baseTokenExpiry: number | null = null;
    private dtableServer: string | null = null;
    private dtableUuid: string | null = null;

    constructor(config: SeaTableConfig) {
        this.apiToken = config.apiToken;
        this.serverUrl = config.serverUrl || 'https://cloud.seatable.io';
    }

    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig(): SeaTableClient {
        const config = getConfig();
        const env = process.env.HUSKY_ENV || 'PROD';

        const seaTableConfig: SeaTableConfig = {
            apiToken: process.env[`${env}_SEATABLE_API_TOKEN`] || process.env.SEATABLE_API_TOKEN || config.seatableApiToken || '',
            serverUrl: process.env[`${env}_SEATABLE_SERVER_URL`] || process.env.SEATABLE_SERVER_URL || config.seatableServerUrl || 'https://cloud.seatable.io',
        };

        if (!seaTableConfig.apiToken) {
            throw new Error(
                'Missing SeaTable API Token. Configure with:\n' +
                '  husky config set seatable-api-token <token>\n' +
                'Or set env var: PROD_SEATABLE_API_TOKEN\n\n' +
                'Get your token from SeaTable: Base → Advanced → API Token'
            );
        }

        return new SeaTableClient(seaTableConfig);
    }

    private isApiGateway(): boolean {
        return (this.dtableServer || '').includes('api-gateway');
    }

    private buildEndpoint(path: string): string {
        const base = this.isApiGateway()
            ? '/api/v2/dtables/'
            : '/dtable-server/api/v1/dtables/';
        return `${base}${this.dtableUuid || ''}${path}`;
    }

    /**
     * Get a Base Token from the API Token
     * Base Tokens are valid for 3 days
     */
    private async getBaseToken(): Promise<void> {
        const now = Date.now();
        if (this.baseToken && this.baseTokenExpiry && now < this.baseTokenExpiry) {
            return;
        }

        const response = await fetch(`${this.serverUrl}/api/v2.1/dtable/app-access-token/`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${this.apiToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to get SeaTable Base Token: ${response.status} ${error}`);
        }

        const data: BaseTokenResponse = await response.json();
        this.baseToken = data.access_token;
        this.dtableServer = data.dtable_server;
        this.dtableUuid = data.dtable_uuid;

        // Set expiry to 2.5 days from now (to be safe)
        this.baseTokenExpiry = now + (2.5 * 24 * 60 * 60 * 1000);
    }

    /**
     * Make an authenticated API request
     */
    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        await this.getBaseToken();

        if (!this.dtableServer || !this.baseToken || !this.dtableUuid) {
            throw new Error('Failed to obtain SeaTable Base Token');
        }

        const endpoint = this.buildEndpoint(path);
        const baseUrl = (this.dtableServer || '').replace(/\/+$/, '');
        const url = `${baseUrl}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.baseToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`SeaTable API Error ${response.status}: ${error}`);
        }

        return response.json();
    }

    // =========================================================================
    // METADATA
    // =========================================================================

    async getMetadata(): Promise<SeaTableMetadata> {
        const response = await this.request<{ metadata?: SeaTableMetadata } | SeaTableMetadata>('/metadata/');
        // Response may be { metadata: { tables: [...] } } or directly { tables: [...] }
        if ('metadata' in response && response.metadata) {
            return response.metadata;
        }
        return response as SeaTableMetadata;
    }

    // =========================================================================
    // ROWS
    // =========================================================================

    async listRows(params: QueryRowsParams): Promise<SeaTableRow[]> {
        const query = new URLSearchParams({
            table_name: params.table_name,
        });

        if (params.view_name) query.set('view_name', params.view_name);
        if (params.order_by) query.set('order_by', params.order_by);
        if (params.direction) query.set('direction', params.direction);
        if (params.start !== undefined) query.set('start', String(params.start));
        if (params.limit !== undefined) query.set('limit', String(params.limit));

        const response = await this.request<{ rows: SeaTableRow[] }>(`/rows/?${query}`);
        return response.rows;
    }

    async getRow(tableName: string, rowId: string): Promise<SeaTableRow | null> {
        try {
            const query = new URLSearchParams({
                table_name: tableName,
                row_id: rowId,
            });
            return await this.request<SeaTableRow>(`/rows/?${query}`);
        } catch {
            return null;
        }
    }

    async queryRows(
        tableName: string,
        filters: FilterParams,
        params?: Partial<QueryRowsParams>
    ): Promise<QueryResponse> {
        const body = {
            table_name: tableName,
            filters: filters.filters || [],
            filter_conjunction: filters.filter_conjunction || 'And',
            ...params,
        };

        return this.request<QueryResponse>('/filtered-rows/', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    async searchRows(tableName: string, searchQuery: string): Promise<SeaTableRow[]> {
        const query = new URLSearchParams({
            table_name: tableName,
            q: searchQuery,
        });

        const response = await this.request<{ rows: SeaTableRow[] }>(`/search/?${query}`);
        return response.rows;
    }

    async appendRow(tableName: string, row: RowData): Promise<SeaTableRow> {
        const response = await this.request<{ rows?: SeaTableRow[]; first_row?: SeaTableRow; row_ids?: Array<{ _id: string }> }>(
            '/rows/',
            {
                method: 'POST',
                body: JSON.stringify({
                    table_name: tableName,
                    rows: [row],
                }),
            }
        );

        if (response.rows?.[0]) return response.rows[0];
        if (response.first_row) return response.first_row;

        let rowId = response.row_ids?.[0];
        if (rowId && typeof rowId === 'object' && '_id' in rowId) {
            const fetchedRow = await this.getRow(tableName, rowId._id);
            if (fetchedRow) return fetchedRow;
        }

        throw new Error('Unexpected append response from SeaTable');
    }

    async updateRow(tableName: string, rowId: string, data: RowData): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>('/rows/', {
            method: 'PUT',
            body: JSON.stringify({
                table_name: tableName,
                row_id: rowId,
                row: data,
            }),
        });
    }

    async deleteRow(tableName: string, rowId: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>('/rows/', {
            method: 'DELETE',
            body: JSON.stringify({
                table_name: tableName,
                row_id: rowId,
            }),
        });
    }

    async deleteRows(tableName: string, rowIds: string[]): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>('/batch-delete-rows/', {
            method: 'DELETE',
            body: JSON.stringify({
                table_name: tableName,
                row_ids: rowIds,
            }),
        });
    }
}

export default SeaTableClient;
