"use client";

import React, { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useProductTableFilters } from "./use-product-table-filters";
import { ProductCatalogView } from "@/types/globals";
import { POSProductGridView } from "@/components/sales/POSProductGridView";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Table as TableIcon,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { POSProductTableView } from "@/components/sales/POSProductTable";
import { StockFilterValue } from "@/lib/searchparams";
import { findProductByBarcode } from "@/actions/products";
import { BarcodeQuickScanner } from "@/components/barcode/barcode-quick-scanner";
import { toast } from "sonner";
import { useCart } from "@/components/providers/cart-provider";

const CATEGORY_ICONS = [Tag];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getCategoryIcon(value: string) {
  if (!value) return Tag;
  return CATEGORY_ICONS[hashString(value) % CATEGORY_ICONS.length];
}

export default function ProductTable({
  data,
  totalData,
  categoryList,
}: {
  data: ProductCatalogView[];
  totalData: number;
  categoryList: { label: string; value: string }[];
}) {
  const {
    categoriesFilter,
    setCategoriesFilter,
    isAnyFilterActive,
    resetFilters,
    searchQuery,
    setPage,
    page,
    limit,
    view,
    setView,
    setSearchQuery,
    stock,
  } = useProductTableFilters();

  const { addItemToCart, increaseItemQuantity, cartItems } = useCart();

  const isGridView = (view || "grid") === "grid";

  // URL query state for pagination
  const [stockFilter, setStockFilter] = useQueryState(
    "stock",
    parseAsString
      .withOptions({ shallow: false, history: "push" })
      .withDefault(stock),
  );
  const [currentPage, setCurrentPage] = useQueryState(
    "page",
    parseAsInteger
      .withOptions({ shallow: false, history: "push" })
      .withDefault(page),
  );
  const [pageSize, setPageSize] = useQueryState(
    "limit",
    parseAsInteger
      .withOptions({ shallow: false, history: "push" })
      .withDefault(limit),
  );

  const displayedProducts = useMemo(() => {
    if (!data) return [];
    if (stockFilter === "in_stock") {
      return data.filter((p) => (Number(p.stock_quantity) || 0) > 0);
    }
    if (stockFilter === "low_stock") {
      return data.filter((p) => {
        const stock = Number(p.stock_quantity) || 0;
        return stock >= 0 && stock <= 5;
      });
    }
    return data;
  }, [data, stockFilter]);

  const [localSearch, setLocalSearch] = useState(searchQuery || "");

  // Update local search when external prop changes
  React.useEffect(() => {
    setLocalSearch(searchQuery || "");
  }, [searchQuery]);

  // Debounced search handler
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    setSearchQuery(val ? val : null);
    setPage(1);
  };

  const handleClearSearch = () => {
    setLocalSearch("");
    setSearchQuery(null);
    setPage(1);
  };

  // The missing piece that broke pagination: search and category changes
  // already reset to page 1, but the stock filter didn't — so switching it
  // while on, say, page 3 could strand you on a page with zero matching
  // items, looking exactly like "pagination is broken".
  const handleStockFilterChange = (val: StockFilterValue) => {
    setStockFilter(val);
    setPage(1);
  };

  const isStockFilterControlled = stockFilter !== undefined;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pageCount = Math.max(1, Math.ceil(totalData / limit));
  const currentCategoryName = categoriesFilter || "All Products";

  const handleSelectCategory = (catValue: string | null) => {
    setCategoriesFilter(catValue ? catValue : null);
    setPage(1);
  };
  // console.log(data)
  // const data=[{
  //       id: '01a0d7f3-4dab-7278-a877-90747e06ccd2',
  //       name: 'Test barcode',
  //       description: 'sfsafasdfasdasdada',
  //       cost_price: 2,
  //       unit_price: 5,
  //       stock_quantity: 100,
  //       stock_value: 500,
  //       category_name: 'Garden',
  //       photo_url: null,
  //       category_id: '01a01ccc-4dff-70ea-b092-e51caf4e7bf0',
  //       barcode: '81821621033',
  //       user_id: '01a01c91-21a3-758f-af41-5a87a15c6dfc',
  //       created_by: 'frebbytech',
  //       active: 1,
  //       created_at: '2026-09-25 09:44:01',
  //       updated_at: '2026-09-25 09:44:01'
  //     }]
  // Centralized barcode scan handler for POS
  // Centralized barcode scan handler for POS using local data array
  //   const handleBarcodeScan =async (scannedBarcode: string) => {
  // let product=null;

  //     // Find the product in the local data array by barcode
  //      product = data.find((item) => item?.barcode === scannedBarcode);

  //     if (product) {
  //       const stock = Number(product.stock_quantity) || 0;

  //       // Prevent add if stock quantity is zero or less
  //       if (stock <= 0) {
  //         toast.error(`Product "${product.name}" is out of stock!`, {
  //           position: "top-right",
  //           className: "p-4 text-red-600 font-semibold",
  //         });
  //         return;
  //       }

  //     } else {

  //     const result = await findProductByBarcode(scannedBarcode);
  //     if (result.success && result.data) {
  //        product = result.data;

  //       const stock = Number(product.stock_quantity) || 0;
  //       if (stock <= 0) {
  //         toast.error(`Product "${product.name}" is out of stock!`, {
  //           position: "top-right",
  //           className: "p-4 text-red-600 font-semibold",
  //         });
  //         return;
  //       }

  //          // Add item to the cart
  //       addItemToCart({
  //         id: product.id,
  //         name: product.name,
  //         cost_price: Number(product.cost_price) || 0,
  //         unit_price: Number(product.unit_price) || 0,
  //         quantity: 1,
  //         stock_quantity: Number(product.stock_quantity),
  //       });

  //       // Show error toast if barcode doesn't match any product in data
  //       toast.error(`Product not found for barcode "${scannedBarcode}"`, {
  //         description:
  //           "Verify that the barcode is correct and exists in inventory.",
  //         position: "top-right",
  //         className: "p-4 font-medium",
  //         duration: 4000,
  //       });
  //     }
  //   };
  // }

  const handleBarcodeScan = async (scannedBarcode: string) => {
    const barcode = scannedBarcode.trim();
    if (!barcode) return;

    // Fast path: check the products already loaded on this page before hitting the server.
    let product = data.find((item) => item?.barcode === barcode) ?? null;

    if (!product) {
      try {
        const result = await findProductByBarcode(barcode);
        if (result.success && result.data) product = result.data;
      } catch (error) {
        toast.error("Couldn't look up that barcode", {
          description:
            error instanceof Error
              ? error.message
              : "Check your connection and try again.",
          position: "top-right",
        });
        return;
      }
    }

    if (!product) {
      toast.error(`No product found for barcode "${barcode}"`, {
        description:
          "Check that the barcode is correct and assigned to a product.",
        position: "top-right",
        duration: 4000,
      });
      return;
    }

    // Same rule the grid view uses: cap at stock, and increase an existing
    // line instead of adding a duplicate one for a product already in the cart.
    const stock = Number(product.stock_quantity) || 0;
    const currentQty =
      cartItems.find((item) => item.id === product.id)?.quantity ?? 0;

    if (currentQty >= stock) {
      toast.error(
        stock <= 0
          ? `"${product.name}" is out of stock.`
          : `Only ${stock} of "${product.name}" in stock, and that's already in the cart.`,
        { position: "top-right" },
      );
      return;
    }

    if (currentQty > 0) {
      increaseItemQuantity(product.id);
    } else {
      addItemToCart({
        id: product.id,
        name: product.name,
        cost_price: Number(product.cost_price) || 0,
        unit_price: Number(product.unit_price) || 0,
        quantity: 1,
        stock_quantity: stock,
      });
    }
  };

  // const handleBarcodeScan = async (scannedBarcode: string) => {
  //   const result = await findProductByBarcode(scannedBarcode);
  //   if (result.success && result.data) {
  //     const product = result.data;
  //     const stock = Number(product.stock_quantity) || 0;
  //     if (stock <= 0) {
  //       toast.error(`Product "${product.name}" is out of stock!`, {
  //         position: "top-right",
  //         className: "p-4 text-red-600 font-semibold",
  //       });
  //       return;
  //     }
  //     addItemToCart({
  //       id: product.id,
  //       name: product.name,
  //       cost_price: Number(product.cost_price) || 0,
  //       unit_price: Number(product.unit_price) || 0,
  //       // stock_quantity: stock,
  //       quantity: 1,
  //       // barcode: product.barcode,
  //     });
  //   } else {
  //     toast.error(`Product not found for barcode "${scannedBarcode}"`, {
  //       description:
  //         "Verify that the barcode is assigned to an active product.",
  //       position: "top-right",
  //       className: "p-4 font-medium",
  //       duration: 4000,
  //     });
  //   }
  // };

  return (
    <>
      {/* <div className="hidden md:block space-y-4"> */}
      <div className="space-y-4">
        {/* View Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-left">
            <h2 className="text-xl md:text-2xl font-bold">
              Point of Sale (POS)
            </h2>
            <p className="text-sm md:text-sm text-muted-foreground">
              Browse items by category and quickly add to cart
            </p>
          </div>

          {/* View Switcher Top Level Toggle */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 shrink-0 w-fit">
            <Button
              type="button"
              variant={view === "grid" ? "default" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-sm shadow-none"
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Grid View</span>
            </Button>
            <Button
              type="button"
              variant={view === "table" ? "default" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-sm shadow-none"
              onClick={() => setView("table")}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>List View</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-4">
          <Accordion type="single" collapsible defaultValue="top-bars">
            <AccordionItem value="top-bars" className="border-b-0">
              {/* The Header Toggler */}
              <div className="flex items-center gap-2 justify-end mr-2">
                <AccordionTrigger className="py-0 hover:no-underline" >
                <span className="text-sm text-right font-semibold text-muted-foreground">
                  Toggle bar
                </span>

                </AccordionTrigger>
              </div>

              {/* The Collapsible Content Area */}
              <AccordionContent className="mt-3 pb-0">
                {/* Top Header & Search Bar */}
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
                  <div className="@container w-full">
                    <div
                      className="
      flex flex-col gap-3
      @[760px]:flex-row
      @[760px]:items-end
      @[760px]:justify-between
    "
                    >
                      {/* Search Input */}
                      <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

                        <Input
                          value={localSearch}
                          onChange={handleSearchChange}
                          placeholder="Search products by name or barcode..."
                          className="h-10 bg-background pl-9 pr-9 text-sm"
                        />

                        {localSearch && (
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Fast Barcode Scanner Section */}
                      <div
                        className="
        rounded-lg border border-primary/15 bg-primary/5 p-2.5
        w-full
        @[760px]:w-auto
        @[760px]:min-w-[280px]
      "
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-primary">
                          <span>POS Barcode Scanner</span>

                          {/* <span className="text-[10px] font-normal text-muted-foreground">
                      (Scan with USB / Bluetooth device or camera)
                    </span> */}
                        </div>

                        <BarcodeQuickScanner
                          onBarcodeScanned={handleBarcodeScan}
                          placeholder="Scan barcode or type code..."
                          autoFocus
                        />
                      </div>

                      {/* Controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Stock Filter */}
                        <Select
                          value={stockFilter}
                          onValueChange={(val: StockFilterValue) =>
                            handleStockFilterChange(val)
                          }
                        >
                          <SelectTrigger className="h-10 w-[130px] text-sm">
                            <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                            <SelectValue placeholder="Stock" />
                          </SelectTrigger>

                          <SelectContent>
                            <SelectItem value="all">All Items</SelectItem>
                            <SelectItem value="in_stock">In Stock</SelectItem>
                            <SelectItem value="low_stock">
                              Low Stock (≤5)
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Reset Filters */}
                        {(isAnyFilterActive || stockFilter !== "all") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10 gap-1.5 px-3 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                            onClick={() => {
                              resetFilters();
                              setStockFilter("all");
                              setPage(1);
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mobile Category Horizontal Scroll */}
                  <div className="flex md:hidden overflow-x-auto pb-1 gap-1.5 scrollbar-none">
                    <Button
                      size="sm"
                      variant={!categoriesFilter ? "default" : "outline"}
                      className={cn(
                        "h-8 text-sm shrink-0 rounded-full px-3 gap-1.5",
                        !categoriesFilter && "shadow-sm",
                      )}
                      onClick={() => handleSelectCategory(null)}
                    >
                      <LayoutGrid className="h-3 w-3" />
                      All Products
                    </Button>
                    {categoryList.map((cat) => {
                      const isSelected = categoriesFilter === cat.value;
                      const CatIcon = getCategoryIcon(cat.value);
                      return (
                        <Tooltip key={cat.value}>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant={isSelected ? "default" : "outline"}
                              className={cn(
                                "h-8 text-sm shrink-0 rounded-full px-3 gap-1.5",
                                isSelected && "shadow-sm",
                              )}
                              onClick={() => handleSelectCategory(cat.value)}
                            >
                              <CatIcon className="h-3 w-3" />
                              {cat.label}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent
                            align="center"
                            side="right"
                            sideOffset={8}
                          >
                            <p>{cat.value}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <>
            {/* POS Main Body: Left Categories Sidebar + Right Grid */}
            <div className="flex flex-col md:flex-row gap-4 items-start">
              {/* Left Category Sidebar (Desktop) — collapses to an icon rail */}
              <aside
                className={cn(
                  "hidden md:flex flex-col shrink-0 rounded-xl border bg-card p-2.5 space-y-3 shadow-sm sticky top-4 transition-[width] duration-200",
                  sidebarCollapsed ? "w-14 items-center" : "w-44",
                )}
              >
                <div
                  className={cn(
                    "flex items-center border-b pb-2",
                    sidebarCollapsed
                      ? "justify-center w-full"
                      : "justify-between px-1.5 w-full",
                  )}
                >
                  {!sidebarCollapsed && (
                    <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      <Layers className="h-3.5 w-3.5" />
                      <span>Categories</span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4 font-semibold"
                      >
                        {categoryList.length}
                      </Badge>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    onClick={() => setSidebarCollapsed((v) => !v)}
                    aria-label={
                      sidebarCollapsed
                        ? "Expand categories"
                        : "Collapse categories"
                    }
                    title={
                      sidebarCollapsed
                        ? "Expand categories"
                        : "Collapse categories"
                    }
                  >
                    {sidebarCollapsed ? (
                      <PanelLeftOpen className="h-3.5 w-3.5" />
                    ) : (
                      <PanelLeftClose className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                <ScrollArea
                  className={cn(
                    "h-[560px]",
                    sidebarCollapsed ? "w-full px-0.5" : "w-full pr-2",
                  )}
                >
                  <div
                    className={cn(
                      "space-y-1",
                      sidebarCollapsed && "flex flex-col items-center",
                    )}
                  >
                    {/* All Categories Option */}
                    <button
                      type="button"
                      onClick={() => handleSelectCategory(null)}
                      title="All Categories"
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-all text-left group",
                        sidebarCollapsed
                          ? "h-10 w-10 justify-center"
                          : "w-full justify-between px-3 py-2",
                        !categoriesFilter
                          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {sidebarCollapsed ? (
                        <LayoutGrid className="h-4 w-4 shrink-0" />
                      ) : (
                        <>
                          <span className="flex items-center gap-2 truncate">
                            <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                            All Categories
                          </span>
                          {!categoriesFilter && (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </>
                      )}
                    </button>

                    {/* Category Items */}
                    {categoryList.map((cat) => {
                      const isSelected = categoriesFilter === cat.value;
                      const CatIcon = getCategoryIcon(cat.value);
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => handleSelectCategory(cat.value)}
                          title={cat.label}
                          className={cn(
                            "flex items-center rounded-lg text-sm font-medium transition-all text-left group",
                            sidebarCollapsed
                              ? "h-10 w-10 justify-center"
                              : "w-full justify-between px-3 py-2",
                            isSelected
                              ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                              : "hover:bg-muted text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {sidebarCollapsed ? (
                            <CatIcon className="h-4 w-4 shrink-0" />
                          ) : (
                            <>
                              <span className="flex items-center gap-2 truncate">
                                {/* <CatIcon className="h-3.5 w-3.5 shrink-0" /> */}
                                {cat.label}
                              </span>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 shrink-0" />
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </aside>

              {/* Right Area: Grid & Product Items */}
              <main className="flex-1 w-full space-y-4 ">
                {/* Subheader with category title and result count */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground">
                      {currentCategoryName}
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      ({displayedProducts.length} items on page, {totalData}{" "}
                      total)
                    </span>
                  </div>
                </div>

                {stockFilter !== "all" && !isStockFilterControlled && (
                  <div className="flex items-center gap-1.5 px-1 -mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                    <Filter className="h-3 w-3 shrink-0" />
                    <span>
                      Stock filter only applies to the {data.length} product
                      {data.length === 1 ? "" : "s"} already loaded on this page
                      — paging won&apos;t pull in more matches from other pages.
                    </span>
                  </div>
                )}

                {/* POS Grid View or Table View */}
                <ScrollArea className=" lg:h-[calc(65svh-10px)] ">
                  {isGridView ? (
                    <POSProductGridView
                      displayedProducts={displayedProducts}
                      resetFilters={resetFilters}
                      isAnyFilterActive={isAnyFilterActive}
                    />
                  ) : (
                    <POSProductTableView
                      displayedProducts={displayedProducts}
                      resetFilters={resetFilters}
                      isAnyFilterActive={isAnyFilterActive}
                    />
                  )}
                </ScrollArea>

                {/* Pagination Footer */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t px-1">
                  <div className="text-sm text-muted-foreground">
                    Showing page {page} of {pageCount} ({totalData} total
                    products)
                  </div>

                  <div className="flex items-center gap-2">
                    {pageSize && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span>Per page:</span>
                        <Select
                          value={String(limit)}
                          onValueChange={(val) => {
                            setPageSize(Number(val));
                            setCurrentPage(1);
                          }}
                        >
                          <SelectTrigger className="h-8 w-16 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="8">8</SelectItem>
                            <SelectItem value="12">12</SelectItem>
                            <SelectItem value="24">24</SelectItem>
                            <SelectItem value="48">48</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Prev / Next buttons */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-sm"
                        onClick={() =>
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage <= 1}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                      </Button>
                      <div className="text-sm font-semibold px-2">
                        {page} / {pageCount}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-sm"
                        onClick={() =>
                          setCurrentPage(Math.min(pageCount, currentPage + 1))
                        }
                        disabled={currentPage >= pageCount}
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </>
        </div>
      </div>
    </>
  );
}
