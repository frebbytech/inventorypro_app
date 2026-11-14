"use client";

import { searchParams } from "@/lib/searchparams";
import { useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";

export function useSummaryTableFilters() {
  const [date, setDate] = useQueryState(
    "date",
    searchParams.date.withOptions({ shallow: false }).withDefault({
      from: undefined,
      to: undefined,
    }),
  );

  const [searchQuery, setSearchQuery] = useQueryState(
    "q",
    searchParams.q.withOptions({ shallow: false }).withDefault(""),
  );

  const [categoriesFilter, setCategoriesFilter] = useQueryState(
    "categories",
    searchParams.categories.withOptions({ shallow: false }).withDefault(""),
  );

  const [page, setPage] = useQueryState(
    "page",
    searchParams.page.withDefault(1),
  );

  const resetFilters = useCallback(() => {
    setSearchQuery(null);
    setCategoriesFilter(null);
    setDate(null);

    setPage(1);
  }, [setSearchQuery, setCategoriesFilter, setPage, setDate]);

  const isAnyFilterActive = useMemo(() => {
    return !!searchQuery || !!categoriesFilter || !!date;
  }, [searchQuery, categoriesFilter, date]);

  return {
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    resetFilters,
    isAnyFilterActive,
    categoriesFilter,
    setCategoriesFilter,
    date,
    setDate,
  };
}
