import { select } from "@inquirer/prompts";

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

const NAVIGATION_SEPARATOR = "──────────────";

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
export async function paginateList<T>(options: PaginationOptions<T>): Promise<PaginationResult<T>> {
  const {
    items,
    pageSize = 10,
    renderItem,
    title = "Items",
    emptyMessage = "No items found.",
    selectableItems = false,
    onSelect,
  } = options;

  if (items.length === 0) {
    console.log(`\n  ${emptyMessage}`);
    return { selectedItem: null, action: "exit" };
  }

  const totalPages = Math.ceil(items.length / pageSize);
  let currentPage = 0;

  while (true) {
    const startIndex = currentPage * pageSize;
    const endIndex = Math.min(startIndex + pageSize, items.length);
    const pageItems = items.slice(startIndex, endIndex);

    // Clear screen and show header
    console.clear();
    console.log(`\n  ${title} (${items.length} total)`);
    console.log(`  Page ${currentPage + 1} of ${totalPages}`);
    console.log("  " + "─".repeat(50));

    // Build choices for current page
    const choices: Array<{ name: string; value: string; description?: string }> = [];

    // Add page items
    pageItems.forEach((item, idx) => {
      const globalIndex = startIndex + idx;
      const displayText = renderItem(item, globalIndex);
      choices.push({
        name: displayText,
        value: selectableItems ? `item:${globalIndex}` : `view:${globalIndex}`,
        description: selectableItems ? "Select this item" : undefined,
      });
    });

    // Add separator
    choices.push({
      name: NAVIGATION_SEPARATOR,
      value: "separator",
      description: "",
    });

    // Navigation options
    const navOptions: Array<{ name: string; value: string; description?: string }> = [];

    if (currentPage > 0) {
      navOptions.push({
        name: "← Previous Page",
        value: "prev",
        description: `Go to page ${currentPage}`,
      });
    }

    if (currentPage < totalPages - 1) {
      navOptions.push({
        name: "→ Next Page",
        value: "next",
        description: `Go to page ${currentPage + 2}`,
      });
    }

    if (totalPages > 2) {
      navOptions.push({
        name: "⇢ Jump to Page...",
        value: "jump",
        description: `Go to a specific page (1-${totalPages})`,
      });
    }

    navOptions.push({
      name: "✕ Exit",
      value: "exit",
      description: "Return to previous menu",
    });

    choices.push(...navOptions);

    try {
      const answer = await select({
        message: "Navigate with ↑↓, select with Enter:",
        choices,
        pageSize: pageSize + 5, // Room for navigation
      });

      if (answer === "separator") {
        // User selected separator, ignore and continue
        continue;
      }

      if (answer === "prev") {
        currentPage = Math.max(0, currentPage - 1);
        continue;
      }

      if (answer === "next") {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
        continue;
      }

      if (answer === "jump") {
        const jumpChoice = await selectPageNumber(totalPages, currentPage);
        if (jumpChoice !== null) {
          currentPage = jumpChoice;
        }
        continue;
      }

      if (answer === "exit") {
        return { selectedItem: null, action: "exit" };
      }

      // Handle item selection
      if (answer.startsWith("item:") || answer.startsWith("view:")) {
        const index = parseInt(answer.split(":")[1], 10);
        const selectedItem = items[index];

        if (selectableItems && onSelect && selectedItem) {
          await onSelect(selectedItem);
        }

        return { selectedItem, action: "select" };
      }
    } catch (error) {
      // User pressed Ctrl+C or escape
      return { selectedItem: null, action: "exit" };
    }
  }
}

/**
 * Helper to select a page number
 */
async function selectPageNumber(totalPages: number, currentPage: number): Promise<number | null> {
  const choices = [];

  for (let i = 0; i < totalPages; i++) {
    choices.push({
      name: `Page ${i + 1}${i === currentPage ? " (current)" : ""}`,
      value: i.toString(),
    });
  }

  choices.push({
    name: "Cancel",
    value: "cancel",
  });

  try {
    const answer = await select({
      message: "Select page:",
      choices,
      pageSize: Math.min(totalPages + 1, 15),
    });

    if (answer === "cancel") {
      return null;
    }

    return parseInt(answer, 10);
  } catch {
    return null;
  }
}

/**
 * Simple paginated display without interactivity
 * Useful for CLI commands that just want to show paginated output
 */
export function printPaginated<T>(
  items: T[],
  page: number,
  pageSize: number,
  renderItem: (item: T, index: number) => string,
  title?: string
): { hasMore: boolean; totalPages: number; currentPage: number } {
  const totalPages = Math.ceil(items.length / pageSize);
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, items.length);
  const pageItems = items.slice(startIndex, endIndex);

  if (title) {
    console.log(`\n  ${title}`);
    console.log("  " + "─".repeat(50));
  }

  pageItems.forEach((item, idx) => {
    console.log(renderItem(item, startIndex + idx));
  });

  if (totalPages > 1) {
    console.log("");
    console.log(`  Page ${currentPage + 1} of ${totalPages} (${items.length} total)`);
  }

  return {
    hasMore: currentPage < totalPages - 1,
    totalPages,
    currentPage,
  };
}
