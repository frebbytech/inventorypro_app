import {
  createSearchParamsCache,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsJson,
  createParser,
} from "nuqs/server";
import { z } from "zod";

// Since JSON stringifies JavaScript dates into strings, accept both styles
export const dateRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
});

export type dateRangeType = z.infer<typeof dateRangeSchema>;
export const stockFilterSchema = z.enum(["all", "in_stock", "low_stock"]);

export type StockFilterValue = z.infer<typeof stockFilterSchema>;

const parseAsStockFilter = createParser<StockFilterValue>({
  parse: (value) => {
    const result = stockFilterSchema.safeParse(value);
    return result.success ? result.data : null;
  },
  serialize: (value) => value,
});

export const searchParams = {
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
  q: parseAsString,
  role: parseAsString,
  categories: parseAsString,
  view: parseAsString.withDefault("table"),

  // 2. Pass the schema directly into parseAsJson as an argument
  date: parseAsJson(dateRangeSchema).withDefault({
    from: undefined,
    to: undefined,
  }),
  stock: parseAsStockFilter.withDefault("all"),
};

export const searchParamsCache = createSearchParamsCache(searchParams);
export const serialize = createSerializer(searchParams);
