export interface PaginationOptions<T> {
    items: T[];
    pageSize?: number;
    renderItem: (item: T, index: number) => string;
    title?: string;
    emptyMessage?: string;
    selectableItems?: boolean;
    onSelect?: (item: T) => Promise<void>;
}
export interface PaginationResult<T> {
    selectedItem: T | null;
    action: "select" | "exit";
}
/**
 * Interactive paginated list with arrow key navigation
 *
 * @example
 * await paginateList({
 *   items: tasks,
 *   pageSize: 10,
 *   renderItem: (t, i) => `${t.id} - ${t.title}`,
 *   title: "Tasks",
 *   selectableItems: true,
 *   onSelect: async (task) => console.log(`Selected: ${task.title}`)
 * });
 */
export declare function paginateList<T>(options: PaginationOptions<T>): Promise<PaginationResult<T>>;
/**
 * Simple paginated display without interactivity
 * Useful for CLI commands that just want to show paginated output
 */
export declare function printPaginated<T>(items: T[], page: number, pageSize: number, renderItem: (item: T, index: number) => string, title?: string): {
    hasMore: boolean;
    totalPages: number;
    currentPage: number;
};
