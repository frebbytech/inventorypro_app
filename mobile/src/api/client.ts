import type {
  AdjustStockInput,
  CreateSaleInput,
  ProductDetailResponse,
  ProductItem,
  ProductQueryParams,
  SaleReceiptDetail,
  SalesQueryParams,
  SaleTransactionSummary,
  TodayDashboardData,
} from "@/types/domain";

/**
 * REST endpoint contract for optional external InventoryPro HTTP API sync
 * (`EXPO_PUBLIC_API_BASE_URL`). By default, mobile uses on-device `expo-sqlite` + Drizzle ORM.
 */
export const API_ENDPOINTS = {
  health: "GET /api/mobile/v1/health",
  authLogin: "POST /api/mobile/v1/auth/login",
  authMe: "GET /api/mobile/v1/auth/me",
  authLogout: "POST /api/mobile/v1/auth/logout",
  todayDashboard: "GET /api/mobile/v1/dashboard/today",
  categories: "GET /api/mobile/v1/categories",
  productsList: "GET /api/mobile/v1/products?q=&category=&stock=",
  productDetail: "GET /api/mobile/v1/products/:id",
  productStockAdjust: "PATCH /api/mobile/v1/products/:id/stock",
  productByBarcode: "GET /api/mobile/v1/products/barcode/:code",
  salesList: "GET /api/mobile/v1/sales?q=&paymentMode=",
  salesCreate: "POST /api/mobile/v1/sales",
  saleReceipt: "GET /api/mobile/v1/sales/:id/receipt",
} as const;

export const PROPOSED_ENDPOINTS = API_ENDPOINTS;

export interface InventoryProApiClient {
  readonly adapterName: string;
  readonly isDemo: boolean;

  getTodayDashboard(): Promise<TodayDashboardData>;
  getCategories(): Promise<string[]>;
  getProducts(params?: ProductQueryParams): Promise<ProductItem[]>;
  getProductById(productId: string): Promise<ProductDetailResponse | null>;
  adjustProductStock(
    productId: string,
    input: AdjustStockInput,
  ): Promise<ProductItem>;
  lookupProductByBarcode(barcode: string): Promise<ProductItem | null>;
  getRecentSales(params?: SalesQueryParams): Promise<SaleTransactionSummary[]>;
  getSaleReceiptById(saleId: string): Promise<SaleReceiptDetail | null>;
  createSale(input: CreateSaleInput): Promise<SaleReceiptDetail>;
}
