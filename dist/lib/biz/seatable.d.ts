/**
 * SeaTable API Client
 * Ported from TigerV0 with Husky Biz CLI integration
 *
 * IMPORTANT: SeaTable uses a 2-stage token system:
 * 1. API Token (permanent) - generated in SeaTable UI
 * 2. Base Token (3 days TTL) - generated from API Token automatically
 */
import type { SeaTableConfig, SeaTableRow, SeaTableMetadata, QueryRowsParams, FilterParams, RowData, QueryResponse } from './seatable-types.js';
export declare class SeaTableClient {
    private serverUrl;
    private apiToken;
    private baseToken;
    private baseTokenExpiry;
    private dtableServer;
    private dtableUuid;
    constructor(config: SeaTableConfig);
    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig(): SeaTableClient;
    private isApiGateway;
    private buildEndpoint;
    /**
     * Get a Base Token from the API Token
     * Base Tokens are valid for 3 days
     */
    private getBaseToken;
    /**
     * Make an authenticated API request
     */
    private request;
    getMetadata(): Promise<SeaTableMetadata>;
    listRows(params: QueryRowsParams): Promise<SeaTableRow[]>;
    getRow(tableName: string, rowId: string): Promise<SeaTableRow | null>;
    queryRows(tableName: string, filters: FilterParams, params?: Partial<QueryRowsParams>): Promise<QueryResponse>;
    searchRows(tableName: string, searchQuery: string): Promise<SeaTableRow[]>;
    appendRow(tableName: string, row: RowData): Promise<SeaTableRow>;
    updateRow(tableName: string, rowId: string, data: RowData): Promise<{
        success: boolean;
    }>;
    deleteRow(tableName: string, rowId: string): Promise<{
        success: boolean;
    }>;
    deleteRows(tableName: string, rowIds: string[]): Promise<{
        success: boolean;
    }>;
}
export default SeaTableClient;
