import type {
  AdjustStockInput,
  AuditLogItem,
  AuditLogsQueryParams,
  BroadcastMessageItem,
  BroadcastRecipient,
  BroadcastRecipientGroup,
  BulkImportProductsResult,
  CategoryItem,
  ChangePasswordInput,
  CreateCategoryInput,
  CreateCustomerInput,
  CreateEmployeeInput,
  CreateProductInput,
  CreateRestockInput,
  CreateSaleInput,
  CreateSupplierInput,
  CreateSupplierTransactionInput,
  CustomerDetailResponse,
  CustomerItem,
  DailyReportData,
  EmployeeDetailResponse,
  EmployeeItem,
  NotificationItem,
  NotificationsQueryParams,
  PaySupplierBalanceInput,
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
  SendBroadcastInput,
  SessionUser,
  StoreProfile,
  SupplierDetailResponse,
  SupplierItem,
  SupplierTransactionSummary,
  TodayDashboardData,
  UpdateBusinessSettingsInput,
  UpdateCategoryInput,
  UpdateCustomerInput,
  UpdateEmployeeInput,
  UpdateMyProfileInput,
  UpdateProductInput,
  UpdateSupplierInput,
  UserSessionItem,
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
  customersList: "GET /api/mobile/v1/customers?q=",
  customerDetail: "GET /api/mobile/v1/customers/:id",
  customerCreate: "POST /api/mobile/v1/customers",
  customerUpdate: "PATCH /api/mobile/v1/customers/:id",
  suppliersList: "GET /api/mobile/v1/suppliers?q=",
  supplierDetail: "GET /api/mobile/v1/suppliers/:id",
  supplierCreate: "POST /api/mobile/v1/suppliers",
  supplierUpdate: "PATCH /api/mobile/v1/suppliers/:id",
  supplierTxCreate: "POST /api/mobile/v1/suppliers/:id/transactions",
  supplierTxPay: "POST /api/mobile/v1/suppliers/transactions/:txId/pay",
  employeesList: "GET /api/mobile/v1/employees?q=",
  employeeDetail: "GET /api/mobile/v1/employees/:id",
  employeeCreate: "POST /api/mobile/v1/employees",
  employeeUpdate: "PATCH /api/mobile/v1/employees/:id",
  dailyReport: "GET /api/mobile/v1/reports/daily?date=",
  auditLogs: "GET /api/mobile/v1/audit-logs?q=&action=&limit=",
  notificationsList: "GET /api/mobile/v1/notifications?unreadOnly=&limit=",
  notificationsUnreadCount: "GET /api/mobile/v1/notifications/unread-count",
  notificationMarkRead: "PATCH /api/mobile/v1/notifications/:id/read",
  notificationMarkAllRead: "POST /api/mobile/v1/notifications/read-all",
  notificationDelete: "DELETE /api/mobile/v1/notifications/:id",
  notificationsClearAll: "DELETE /api/mobile/v1/notifications",
  broadcastRecipients: "GET /api/mobile/v1/messages/recipients?group=",
  broadcastMessagesList: "GET /api/mobile/v1/messages",
  broadcastMessageSend: "POST /api/mobile/v1/messages",
  securitySessionsList: "GET /api/mobile/v1/security/sessions",
  securitySessionRevoke: "DELETE /api/mobile/v1/security/sessions/:id",
  securitySessionsRevokeOthers: "POST /api/mobile/v1/security/sessions/revoke-others",
  securityProfileUpdate: "PATCH /api/mobile/v1/security/profile",
  securityPasswordChange: "POST /api/mobile/v1/security/password",
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
  getCustomers(query?: string): Promise<CustomerItem[]>;
  getCustomerById(customerId: string): Promise<CustomerDetailResponse | null>;
  createCustomer(input: CreateCustomerInput): Promise<CustomerItem>;
  updateCustomer(
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerItem>;
  getSuppliers(query?: string): Promise<SupplierItem[]>;
  getSupplierById(supplierId: string): Promise<SupplierDetailResponse | null>;
  createSupplier(input: CreateSupplierInput): Promise<SupplierItem>;
  updateSupplier(
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierItem>;
  recordSupplierTransaction(
    input: CreateSupplierTransactionInput,
  ): Promise<SupplierTransactionSummary>;
  paySupplierTransactionBalance(
    input: PaySupplierBalanceInput,
  ): Promise<SupplierTransactionSummary>;
  getEmployees(query?: string): Promise<EmployeeItem[]>;
  getEmployeeById(employeeId: string): Promise<EmployeeDetailResponse | null>;
  createEmployee(input: CreateEmployeeInput): Promise<EmployeeItem>;
  updateEmployee(
    employeeId: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeItem>;
  getDailyReport(date?: string): Promise<DailyReportData>;
  getAuditLogs(params?: AuditLogsQueryParams): Promise<AuditLogItem[]>;
  getNotifications(params?: NotificationsQueryParams): Promise<NotificationItem[]>;
  getUnreadNotificationCount(): Promise<number>;
  markNotificationRead(notificationId: string): Promise<NotificationItem>;
  markAllNotificationsRead(): Promise<{ updatedCount: number }>;
  deleteNotification(notificationId: string): Promise<void>;
  clearAllNotifications(): Promise<{ deletedCount: number }>;
  getBroadcastRecipients(group: BroadcastRecipientGroup): Promise<BroadcastRecipient[]>;
  getBroadcastMessages(): Promise<BroadcastMessageItem[]>;
  sendBroadcastMessage(input: SendBroadcastInput): Promise<BroadcastMessageItem>;
  getUserSessions(): Promise<UserSessionItem[]>;
  revokeUserSession(sessionId: string): Promise<void>;
  revokeOtherUserSessions(): Promise<{ revokedCount: number }>;
  updateMyProfile(input: UpdateMyProfileInput): Promise<SessionUser>;
  changeMyPassword(input: ChangePasswordInput): Promise<void>;
  updateStockAlertThreshold(threshold: number): Promise<StoreProfile>;
  updateBusinessSettings(input: UpdateBusinessSettingsInput): Promise<StoreProfile>;
}
