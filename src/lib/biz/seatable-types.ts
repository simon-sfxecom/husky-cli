/**
 * SeaTable API Types
 */

/**
 * Client configuration
 */
export interface SeaTableConfig {
    apiToken: string;
    serverUrl?: string;
}

/**
 * Column Types in SeaTable
 */
export enum ColumnType {
    Text = 'text',
    Number = 'number',
    Checkbox = 'checkbox',
    Date = 'date',
    SingleSelect = 'single-select',
    MultipleSelect = 'multiple-select',
    Image = 'image',
    File = 'file',
    Email = 'email',
    URL = 'url',
    Duration = 'duration',
    Rating = 'rating',
    Formula = 'formula',
    Link = 'link',
    Creator = 'creator',
    CreatedTime = 'ctime',
    LastModifier = 'last-modifier',
    ModifiedTime = 'mtime',
}

/**
 * SeaTable Row
 */
export interface SeaTableRow {
    _id: string;
    _ctime?: string;
    _mtime?: string;
    _creator?: string;
    _last_modifier?: string;
    [key: string]: unknown;
}

/**
 * SeaTable Column
 */
export interface SeaTableColumn {
    key: string;
    name: string;
    type: ColumnType;
    width?: number;
    editable?: boolean;
    resizable?: boolean;
    data?: {
        link_id?: string;
        other_table_id?: string;
        options?: Array<{
            name: string;
            color: string;
            textColor?: string;
        }>;
    };
}

/**
 * SeaTable Table
 */
export interface SeaTableTable {
    _id: string;
    name: string;
    columns: SeaTableColumn[];
}

/**
 * SeaTable Base Metadata
 */
export interface SeaTableMetadata {
    tables: SeaTableTable[];
}

/**
 * Row Query Parameters
 */
export interface QueryRowsParams {
    table_name: string;
    view_name?: string;
    order_by?: string;
    direction?: 'asc' | 'desc';
    start?: number;
    limit?: number;
}

/**
 * Filter Parameters
 */
export interface FilterParams {
    filters?: Array<{
        column_name: string;
        filter_predicate: 'is' | 'is_not' | 'contains' | 'does_not_contain' | 'is_empty' | 'is_not_empty' | 'equal' | 'not_equal' | 'greater' | 'greater_or_equal' | 'less' | 'less_or_equal';
        filter_term?: string | number | boolean;
    }>;
    filter_conjunction?: 'And' | 'Or';
}

/**
 * Row Creation/Update Data
 */
export interface RowData {
    [key: string]: string | number | boolean | string[] | null;
}

/**
 * Query Response
 */
export interface QueryResponse {
    rows: SeaTableRow[];
    metadata?: {
        total_count?: number;
    };
}
