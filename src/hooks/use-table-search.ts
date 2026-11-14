import { useEffect, useMemo, useState } from "react";

interface UseTableSearchOptions<T> {
  items: T[];
  /** Returns true when `item` matches the (already trimmed, lowercased) query. */
  matches: (item: T, query: string) => boolean;
  pageSize?: number;
}

/**
 * Client-side search + pagination for a list already loaded in the browser.
 * Filters first, then paginates what's left, and keeps the current page valid
 * as the query or the underlying list changes.
 *
 * Shared by every "search this table" feature in this app, so the same
 * filter-then-paginate behaviour (and edge cases) only has to be right once.
 */
export function useTableSearch<T>({ items, matches, pageSize = 10 }: UseTableSearchOptions<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? items.filter((item) => matches(item, query)) : items;
  }, [items, search, matches]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // If the list shrinks (a search narrows it, or the underlying data changes)
  // so the current page no longer exists, fall back to the last real page.
  const currentPage = Math.min(page, pageCount);

  // A fresh search, or a new underlying list, always starts from the top of its own results.
  useEffect(() => {
    setPage(1);
  }, [search, items]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filtered.length);

  return {
    search,
    setSearch,
    page: currentPage,
    setPage,
    pageCount,
    pageItems,
    total: items.length,
    filteredTotal: filtered.length,
    rangeStart,
    rangeEnd,
    isFiltered: search.trim() !== "",
  };
}
