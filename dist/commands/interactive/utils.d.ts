export interface MenuItem {
    name: string;
    value: string;
    description?: string;
}
export interface ValidConfig {
    apiUrl: string;
    apiKey?: string;
}
export declare function ensureConfig(): ValidConfig;
export declare function clearScreen(): void;
export declare function printHeader(): void;
export declare function pressEnterToContinue(): Promise<void>;
export declare function formatDate(dateStr: string | undefined): string;
export declare function truncate(str: string, length: number): string;
