import type {
  AdjustStockInput,
  AuditLogItem,
  AuditLogsQueryParams,
  BulkImportProductsResult,
  CategoryItem,
  CreateCategoryInput,
  CreateProductInput,
  CreateRestockInput,
  CreateSaleInput,
  ProductDetailResponse,
  ProductItem,
  ProductQueryParams,
  RefundSaleInput,
  RestockLogItem,
  RestockQueryParams,
  SaleReceiptDetail,
  SalesDateRange,
  SalesQueryParams,
  SalesReportData,
  SaleTransactionSummary,
  StoreProfile,
  TodayDashboardData,
  UpdateBusinessSettingsInput,
  UpdateCategoryInput,
  UpdateProductInput,
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
  categoryDetails: "GET /api/mobile/v1/categories/manage?q=",
  categoryCreate: "POST /api/mobile/v1/categories",
  categoryUpdate: "PATCH /api/mobile/v1/categories/:id",
  productsList: "GET /api/mobile/v1/products?q=&category=&stock=&threshold=",
  productsCreate: "POST /api/mobile/v1/products",
  productsBulkCreate: "POST /api/mobile/v1/products/bulk",
  productDetail: "GET /api/mobile/v1/products/:id",
  productUpdate: "PATCH /api/mobile/v1/products/:id",
  productStockAdjust: "PATCH /api/mobile/v1/products/:id/stock",
  productByBarcode: "GET /api/mobile/v1/products/barcode/:code",
  restockLogs: "GET /api/mobile/v1/inventory/restocks?q=&productId=&limit=",
  restockCreate: "POST /api/mobile/v1/inventory/restocks",
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
  getCategoryDetails(query?: string): Promise<CategoryItem[]>;
  createCategory(input: CreateCategoryInput): Promise<CategoryItem>;
  updateCategory(
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryItem>;
  getProducts(params?: ProductQueryParams): Promise<ProductItem[]>;
  getProductById(productId: string): Promise<ProductDetailResponse | null>;
  createProduct(input: CreateProductInput): Promise<ProductItem>;
  updateProduct(
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductItem>;
  bulkCreateProducts(
    items: CreateProductInput[],
  ): Promise<BulkImportProductsResult>;
  adjustProductStock(
    productId: string,
    input: AdjustStockInput,
  ): Promise<ProductItem>;
  lookupProductByBarcode(barcode: string): Promise<ProductItem | null>;
  getRestockLogs(params?: RestockQueryParams): Promise<RestockLogItem[]>;
  recordRestock(input: CreateRestockInput): Promise<RestockLogItem>;
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
