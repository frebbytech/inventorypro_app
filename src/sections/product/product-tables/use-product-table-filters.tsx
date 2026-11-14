"use client";

import { searchParams } from "@/lib/searchparams";
import { useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";

export const CATEGORY_OPTIONS = [
  { value: "Steel Plate", label: "Steel Plate" },
  { value: "Galvanised Plate", label: "Galvanised Plate" },
  { value: "Square Pipe Steel", label: "Square Pipe Steel" },
  { value: "Square Galvanised", label: "Square Galvanised" },
  { value: "Rectangular Steel", label: "Rectangular Steel" },
  { value: "Rectangular Galvanised", label: "Rectangular Galvanised" },
  { value: "Round Pipes", label: "Round Pipes" },
  { value: "Flat Bar", label: "Flat Bar" },
  { value: "Flat Bar Galvanised", label: "Flat Bar Galvanised" },
  { value: "Angles", label: "Angles" },
  { value: "Electrode", label: "Electrode" },
  { value: "Blade", label: "Blade" },
  { value: "Accessories", label: "Accessories" },
  { value: "Disc", label: "Disc" },
  { value: "Bearing", label: "Bearing" },
  { value: "Hinches", label: "Hinches" },
  { value: "Wheel", label: "Wheel" },
];
export function useProductTableFilters() {
  const [searchQuery, setSearchQuery] = useQueryState(
    "q",
    searchParams.q
      .withOptions({ shallow: false, throttleMs: 1000 })
      .withDefault("")
  );

  const [categoriesFilter, setCategoriesFilter] = useQueryState(
    "categories",
    searchParams.categories.withOptions({ shallow: false }).withDefault("")
  );

  const [page, setPage] = useQueryState(
    "page",
    searchParams.page.withDefault(1)
  );

  const resetFilters = useCallback(() => {
    setSearchQuery(null);
    setCategoriesFilter(null);

    setPage(1);
  }, [setSearchQuery, setCategoriesFilter, setPage]);

  const isAnyFilterActive = useMemo(() => {
    return !!searchQuery || !!categoriesFilter;
  }, [searchQuery, categoriesFilter]);

  return {
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    resetFilters,
    isAnyFilterActive,
    categoriesFilter,
    setCategoriesFilter,
  };
}
