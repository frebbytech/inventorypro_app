import { matchSorter } from "match-sorter";
import { dateRangeType } from "@/lib/searchparams";

// A named, reusable predicate registered once when the catalog is created.
// `value` is whatever the caller passes at query time under that same key
// in `filters` (e.g. { stock: "in_stock" }) — the catalog doesn't need to
// know what "stock" means, it just calls your predicate for each item.
type CustomFilter<T> = (item: T, value: string) => boolean;

interface CreateCatalogOptions<
  T,
  F extends (...args: any[]) => Promise<{ data: T[] | null | undefined }>,
> {
  fetchData: F;
  searchKeys: Array<keyof T | string>;
  categoryKey: keyof T;
  dateKey?: keyof T; // Dynamic key to find the date string/object on the item
  // Register any additional filters beyond search/category/date here, e.g.
  //   customFilters: {
  //     stock: (item, value) => {
  //       const qty = Number((item as any).stock_quantity) || 0;
  //       if (value === "in_stock") return qty > 0;
  //       if (value === "low_stock") return qty > 0 && qty <= 5;
  //       return true; // "all" (or anything else) — don't filter
  //     },
  //   }
  // Then pass `filters: { stock: stockFilter }` into getAll/getPaginated.
  customFilters?: Record<string, CustomFilter<T>>;
}

export const createDataCatalog = <
  T,
  F extends (...args: any[]) => Promise<{ data: T[] | null | undefined }>,
>({
  fetchData,
  searchKeys,
  categoryKey,
  dateKey,
  customFilters,
}: CreateCatalogOptions<T, F>) => {
  return async (...args: Parameters<F>) => {
    const { data } = await fetchData(...args);

    // Defined as plain const functions (not object-literal methods) so
    // getPaginated never needs `this` to call getAll. Object methods rely on
    // being invoked as `catalog.getAll(...)` — the moment a caller does the
    // very normal `const { getAll } = await catalog(...)` and calls getAll()
    // on its own, `this` inside getPaginated becomes undefined and every
    // filter silently stops working. Closures sidestep that entirely.
    const getAll = async ({
      categories = [],
      search,
      dateRange,
      filters,
    }: {
      categories?: string[];
      search?: string;
      dateRange?: dateRangeType;
      filters?: Record<string, string>;
    }) => {
      let items = data || [];

      // Category Filtering
      if (categories.length > 0) {
        items = items.filter((item) => {
          const val = item[categoryKey];
          return typeof val === "string" && categories.includes(val);
        });
      }

      // Any additional named filters registered via customFilters — this is
      // what lets callers add things like stock status without editing this
      // shared function. A filter is only applied when its value is present
      // and isn't the "no filter" sentinel "all".
      
      if (filters && customFilters) {
        for (const [key, value] of Object.entries(filters)) {
          if (!value || value === "all") continue;
          const predicate = customFilters[key];
          if (!predicate) continue;
          items = items.filter((item) => predicate(item, value));
        }
      }

      // Search Functionality — guard against whitespace-only queries, which
      // would otherwise get passed to matchSorter and filter out everything.
      if (search && search.trim()) {
        items = matchSorter(items, search.trim(), {
          keys: searchKeys as string[],
        });
      }

      // Date Range Filtering
      if (dateKey && dateRange && (dateRange.from || dateRange.to)) {
        items = items.filter((item) => {
          const itemDateValue = item[dateKey];
          if (!itemDateValue) return false;

          // Coerce the record's date property into a JS Date object instance
          const recordDate = new Date(itemDateValue as any);

          // Guard check for invalid dates inside the mock data
          if (isNaN(recordDate.getTime())) return false;

          if (dateRange.from) {
            // Normalize to start of day for accurate boundary matching
            const startOfDay = new Date(dateRange.from);
            startOfDay.setHours(0, 0, 0, 0);
            if (recordDate < startOfDay) return false;
          }

          if (dateRange.to) {
            // Normalize to end of day for accurate boundary matching
            const endOfDay = new Date(dateRange.to);
            endOfDay.setHours(23, 59, 59, 999);
            if (recordDate > endOfDay) return false;
          }

          return true;
        });
      }

      return items;
    };

    const getPaginated = async ({
      page = 1,
      limit = 10,
      categories,
      search,
      dateRange,
      filters,
    }: {
      page?: number;
      limit?: number;
      categories?: string;
      search?: string;
      dateRange?: dateRangeType;
      filters?: Record<string, string>;
    }) => {
      const categoriesArray = categories ? categories.split(".") : [];

      const allItems = await getAll({
        categories: categoriesArray,
        search,
        dateRange,
        filters,
      });
      const totalItems = allItems.length;

      // Clamp so an out-of-range page (e.g. filters shrank the result set)
      // returns the last valid page of results instead of an empty slice.
      const pageCount = Math.max(1, Math.ceil(totalItems / limit));
      const safePage = Math.min(Math.max(1, page), pageCount);

      const offset = (safePage - 1) * limit;
      const paginatedItems = allItems.slice(offset, offset + limit);

      return {
        success: true,
        time: new Date().toISOString(),
        message: "Records of selected page data",
        total_records: totalItems,
        page: safePage,
        page_count: pageCount,
        offset,
        limit,
        records: paginatedItems,
        data: allItems,
      };
    };

    return { getAll, getPaginated };
  };
};


// import { matchSorter } from "match-sorter";
// import { dateRangeType } from "@/lib/searchparams";

// // 1. Updated configuration interface to accept dateKey
// interface CreateCatalogOptions<
//   T,
//   F extends (...args: any[]) => Promise<{ data: T[] | null | undefined }>,
// > {
//   fetchData: F;
//   searchKeys: Array<keyof T | string>;
//   categoryKey: keyof T;
//   dateKey?: keyof T; // Dynamic key to find the date string/object on the item
// }

// export const createDataCatalog = <
//   T,
//   F extends (...args: any[]) => Promise<{ data: T[] | null | undefined }>,
// >({
//   fetchData,
//   searchKeys,
//   categoryKey,
//   dateKey, // Destructure dateKey
// }: CreateCatalogOptions<T, F>) => {
//   return async (...args: Parameters<F>) => {
//     const { data } = await fetchData(...args);

//     return {
//       records: [] as T[],

//       // 2. Accept dateRange in getAll filters
//       async getAll({
//         categories = [],
//         search,
//         dateRange,
//       }: {
//         categories?: string[];
//         search?: string;
//         dateRange?: dateRangeType;
//       }) {
//         let items = data || [];

//         // Category Filtering
//         if (categories.length > 0) {
       
//           items = items.filter((item) => {
//             const val = item[categoryKey];
//             return typeof val === "string" && categories.includes(val);
//           });
//         }

//         // Search Functionality
//         if (search) {
        
//           items = matchSorter(items, search, {
//             keys: searchKeys as string[],
//           });
//         }

//         // 3. Date Range Filtering Implementation
//         if (dateKey && dateRange && (dateRange.from || dateRange.to)) {

//           items = items.filter((item) => {
//             const itemDateValue = item[dateKey];
//             if (!itemDateValue) return false;

//             // Coerce the record's date property into a JS Date object instance
//             const recordDate = new Date(itemDateValue as any);

//             // Guard check for invalid dates inside the mock data
//             if (isNaN(recordDate.getTime())) return false;

//             if (dateRange.from) {
//               // Normalize to start of day for accurate boundary matching
//               const startOfDay = new Date(dateRange.from);
//               startOfDay.setHours(0, 0, 0, 0);
//               if (recordDate < startOfDay) return false;
//             }

//             if (dateRange.to) {
//               // Normalize to end of day for accurate boundary matching
//               const endOfDay = new Date(dateRange.to);
//               endOfDay.setHours(23, 59, 59, 999);
//               if (recordDate > endOfDay) return false;
//             }

//             return true;
//           });
//         }
//         return items;
//       },

//       // 4. Pass dateRange down from getPaginated parameter block
//       async getPaginated({
//         page = 1,
//         limit = 10,
//         categories,
//         search,
//         dateRange,
//       }: {
//         page?: number;
//         limit?: number;
//         categories?: string;
//         search?: string;
//         dateRange?: dateRangeType;
//       }) {
//         const categoriesArray = categories ? categories.split(".") : [];

//         const allItems = await this.getAll({
//           categories: categoriesArray,
//           search,
//           dateRange, // Forward date range parameters
//         });
//         const totalItems = allItems.length;

//         const offset = (page - 1) * limit;
//         const paginatedItems = allItems.slice(offset, offset + limit);

//         return {
//           success: true,
//           time: new Date().toISOString(),
//           message: "Records of selected page data",
//           total_records: totalItems,
//           offset,
//           limit,
//           records: paginatedItems,
//           data: allItems,
//         };
//       },
//     };
//   };
// };
