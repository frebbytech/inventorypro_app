"use client";

import {
  useQueryState,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs";
import { useCallback, useMemo } from "react";

export type StockFilterValue = "all" | "in_stock" | "low_stock";
export type ViewModeValue = "grid" | "table";

// Keys match what ProductListingPage already reads via searchParamsCache
// (page, q, limit, categories) plus the new "stock" key — keep these in
// sync with whatever parsers you register in @/lib/searchparams.
const PAGE_KEY = "page";
const LIMIT_KEY = "limit";
const SEARCH_KEY = "q";
const CATEGORIES_KEY = "categories";
const STOCK_KEY = "stock";
const VIEW_KEY = "view";

/**
 * Client-side counterpart to the server's searchParamsCache. Every setter
 * here writes to the URL (via nuqs), which is what makes pagination/filters
 * actually re-fetch data — POSProductGridView itself only ever calls these
 * setters, it never touches the URL or the network directly.
 */
export function usePOSProductFilters() {
  const [page, setPageRaw] = useQueryState(PAGE_KEY, parseAsInteger.withDefault(1));
  const [limit, setLimitRaw] = useQueryState(LIMIT_KEY, parseAsInteger.withDefault(12));
  const [searchQuery, setSearchQueryRaw] = useQueryState(
    SEARCH_KEY,
    parseAsString.withDefault("").withOptions({ throttleMs: 400 }),
  );
  const [categoriesFilter, setCategoriesFilterRaw] = useQueryState(
    CATEGORIES_KEY,
    parseAsString.withDefault(""),
  );
  const [stockFilter, setStockFilterRaw] = useQueryState(
    STOCK_KEY,
    parseAsStringEnum<StockFilterValue>(["all", "in_stock", "low_stock"]).withDefault("all"),
  );
  // Grid vs table — purely a display choice, doesn't affect what data is
  // fetched, so switching it never touches page/limit/search/etc.
  const [viewMode, setViewMode] = useQueryState(
    VIEW_KEY,
    parseAsStringEnum<ViewModeValue>(["grid", "table"]).withDefault("grid"),
  );

  const setPage = useCallback((next: number) => setPageRaw(next), [setPageRaw]);

  const setLimit = useCallback(
    (next: number) => {
      setLimitRaw(next);
      setPageRaw(1);
    },
    [setLimitRaw, setPageRaw],
  );

  const setSearchQuery = useCallback(
    (next: string | null) => {
      setSearchQueryRaw(next || "");
      setPageRaw(1);
    },
    [setSearchQueryRaw, setPageRaw],
  );

  const setCategoriesFilter = useCallback(
    (next: string | null) => {
      setCategoriesFilterRaw(next || "");
      setPageRaw(1);
    },
    [setCategoriesFilterRaw, setPageRaw],
  );

  const setStockFilter = useCallback(
    (next: StockFilterValue) => {
      setStockFilterRaw(next);
      setPageRaw(1);
    },
    [setStockFilterRaw, setPageRaw],
  );

  const resetFilters = useCallback(() => {
    setSearchQueryRaw("");
    setCategoriesFilterRaw("");
    setStockFilterRaw("all");
    setPageRaw(1);
  }, [setSearchQueryRaw, setCategoriesFilterRaw, setStockFilterRaw, setPageRaw]);

  const isAnyFilterActive = useMemo(
    () => Boolean(searchQuery) || Boolean(categoriesFilter) || stockFilter !== "all",
    [searchQuery, categoriesFilter, stockFilter],
  );

  return {
    page,
    setPage,
    limit,
    setLimit,
    searchQuery,
    setSearchQuery,
    categoriesFilter,
    setCategoriesFilter,
    stockFilter,
    setStockFilter,
    viewMode,
    setViewMode,
    resetFilters,
    isAnyFilterActive,
  };
}
