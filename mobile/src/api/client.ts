import type {
  AdjustStockInput,
  AuditLogItem,
  AuditLogsQueryParams,
  BulkImportProductsResult,
  CreateProductInput,
  CreateSaleInput,
  ProductDetailResponse,
  ProductItem,
  ProductQueryParams,
  RefundSaleInput,
  SaleReceiptDetail,
  SalesDateRange,
  SalesQueryParams,
  SalesReportData,
  SaleTransactionSummary,
  StoreProfile,
  TodayDashboardData,
  UpdateBusinessSettingsInput,
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
  productsList: "GET /api/mobile/v1/products?q=&category=&stock=&threshold=",
  productsCreate: "POST /api/mobile/v1/products",
  productsBulkCreate: "POST /api/mobile/v1/products/bulk",
  productDetail: "GET /api/mobile/v1/products/:id",
  productStockAdjust: "PATCH /api/mobile/v1/products/:id/stock",
  productByBarcode: "GET /api/mobile/v1/products/barcode/:code",
  salesList: "GET /api/mobile/v1/sales?q=&paymentMode=&status=&dateRange=",
  salesCreate: "POST /api/mobile/v1/sales",
  saleReceipt: "GET /api/mobile/v1/sales/:id/receipt",
  saleRefund: "POST /api/mobile/v1/sales/:id/refund",
  salesReport: "GET /api/mobile/v1/sales/report?range=",
  auditLogs: "GET /api/mobile/v1/audit-logs?q=&action=&limit=",
  storeThresholdUpdate: "PATCH /api/mobile/v1/settings/stock-threshold",
  storeBusinessUpdate: "PATCH /api/mobile/v1/settings/business",
} as const;

export const PROPOSED_ENDPOINTS = API_ENDPOINTS;

export interface InventoryProApiClient {
  readonly adapterName: string;
  readonly isDemo: boolean;

  getTodayDashboard(): Promise<TodayDashboardData>;
  getCategories(): Promise<string[]>;
  getProducts(params?: ProductQueryParams): Promise<ProductItem[]>;
  getProductById(productId: string): Promise<ProductDetailResponse | null>;
  createProduct(input: CreateProductInput): Promise<ProductItem>;
  bulkCreateProducts(
    items: CreateProductInput[],
  ): Promise<BulkImportProductsResult>;
  adjustProductStock(
    productId: string,
    input: AdjustStockInput,
  ): Promise<ProductItem>;
  lookupProductByBarcode(barcode: string): Promise<ProductItem | null>;
  getRecentSales(params?: SalesQueryParams): Promise<SaleTransactionSummary[]>;
  getSaleReceiptById(saleId: string): Promise<SaleReceiptDetail | null>;
  createSale(input: CreateSaleInput): Promise<SaleReceiptDetail>;
  refundSale(
    saleId: string,
    input?: RefundSaleInput,
  ): Promise<SaleReceiptDetail>;
  getSalesReport(dateRange?: SalesDateRange): Promise<SalesReportData>;
  getAuditLogs(params?: AuditLogsQueryParams): Promise<AuditLogItem[]>;
  updateStockAlertThreshold(threshold: number): Promise<StoreProfile>;
  updateBusinessSettings(input: UpdateBusinessSettingsInput): Promise<StoreProfile>;
}
