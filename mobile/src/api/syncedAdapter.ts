import { ensureDbReady } from "@/db/client";
import {
  adjustProductStock as dbAdjustProductStock,
  createCategory as dbCreateCategory,
  createCustomer as dbCreateCustomer,
  createProduct as dbCreateProduct,
  createSale as dbCreateSale,
  createSupplier as dbCreateSupplier,
  findProductByBarcode as dbFindProductByBarcode,
  getCustomerDetail as dbGetCustomerDetail,
  getDailyReport as dbGetDailyReport,
  getEmployeeDetail as dbGetEmployeeDetail,
  getProductDetail as dbGetProductDetail,
  getSaleReceipt as dbGetSaleReceipt,
  getSalesReport as dbGetSalesReport,
  getSupplierDetail as dbGetSupplierDetail,
  getTodayDashboard as dbGetTodayDashboard,
  getUnreadNotificationCount as dbGetUnreadNotificationCount,
  listAuditLogs as dbListAuditLogs,
  listBroadcastMessages as dbListBroadcastMessages,
  listBroadcastRecipients as dbListBroadcastRecipients,
  listCategories as dbListCategories,
  listCategoryDetails as dbListCategoryDetails,
  listCustomers as dbListCustomers,
  listEmployees as dbListEmployees,
  listNotifications as dbListNotifications,
  listProducts as dbListProducts,
  listRestockLogs as dbListRestockLogs,
  listSales as dbListSales,
  listSuppliers as dbListSuppliers,
  recordRestock as dbRecordRestock,
  refundSale as dbRefundSale,
  updateCategory as dbUpdateCategory,
  updateCustomer as dbUpdateCustomer,
  updateProduct as dbUpdateProduct,
  updateStoreBusinessProfile,
  updateStoreStockThreshold,
  updateSupplier as dbUpdateSupplier,
} from "@/db/queries";
import { enqueueOutboxMutation } from "@/db/syncStore";
import { ApiError, type HttpApiClient } from "./httpAdapter";
import type { AuthenticatedApiClient } from "./sqliteAdapter";
import type { SyncEngine } from "./syncEngine";
import type {
  AdjustStockInput,
  AuditLogItem,
  AuditLogsQueryParams,
  AuthLoginPayload,
  AuthLoginResult,
  AuthSessionResponse,
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

function createMutationId(): string {
  return `mob-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isNetworkOrServerFailure(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 0;
  }
  return true;
}

/**
 * Synced multi-tenant client:
 * - Reads: Server-authoritative live HTTP when reachable, falling back seamlessly to local SQLite snapshot when offline.
 * - Writes: Live HTTP with `X-Client-Mutation-Id`; 409/4xx errors fail immediately, while offline/network failures
 *   update local SQLite cache and enqueue into `sync_outbox` for automatic FIFO replay.
 */
export class SyncedApiClient implements AuthenticatedApiClient {
  readonly adapterName = "Synced (Web + Mobile)";
  readonly isDemo = false;

  constructor(
    private readonly http: HttpApiClient,
    private readonly getUserId: () => string | null,
    private readonly getSyncEngine: () => SyncEngine | null,
    private readonly onLocalDataChanged?: () => void,
  ) {}

  private async requireLocalActorUserId(): Promise<string> {
    const id = this.getUserId();
    if (!id) throw new Error("Sign in required.");
    return id;
  }

  private async readWithOfflineFallback<T>(
    onlineFn: () => Promise<T>,
    offlineFn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await onlineFn();
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) {
        throw err;
      }
      return offlineFn();
    }
  }

  private async writeWithOutbox<T>(options: {
    entityType: string;
    operation: string;
    endpoint: string;
    method: "POST" | "PATCH";
    payload: unknown;
    onlineCall: (mutationId: string) => Promise<T>;
    offlineCall?: () => Promise<T>;
  }): Promise<T> {
    const mutationId = createMutationId();
    try {
      const result = await options.onlineCall(mutationId);
      void this.getSyncEngine()?.catchUpDelta();
      this.onLocalDataChanged?.();
      return result;
    } catch (err) {
      if (!isNetworkOrServerFailure(err) || !options.offlineCall) {
        throw err;
      }
      const db = await ensureDbReady();
      const localResult = await options.offlineCall();
      enqueueOutboxMutation(db, {
        clientMutationId: mutationId,
        entityType: options.entityType,
        operation: options.operation,
        endpoint: options.endpoint,
        method: options.method,
        payload: options.payload,
      });
      await this.getSyncEngine()?.refreshOutboxCounts();
      this.onLocalDataChanged?.();
      return localResult;
    }
  }

  login(payload: AuthLoginPayload): Promise<AuthLoginResult> {
    return this.http.login(payload);
  }

  getMe(): Promise<AuthSessionResponse> {
    return this.http.getMe();
  }

  logout(): Promise<void> {
    return this.http.logout();
  }

  getTodayDashboard(): Promise<TodayDashboardData> {
    return this.readWithOfflineFallback(
      () => this.http.getTodayDashboard(),
      async () => dbGetTodayDashboard(await ensureDbReady()),
    );
  }

  getCategories(): Promise<string[]> {
    return this.readWithOfflineFallback(
      () => this.http.getCategories(),
      async () => dbListCategories(await ensureDbReady()),
    );
  }

  getCategoryDetails(query?: string): Promise<CategoryItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getCategoryDetails(query),
      async () => dbListCategoryDetails(await ensureDbReady(), query),
    );
  }

  createCategory(input: CreateCategoryInput): Promise<CategoryItem> {
    return this.writeWithOutbox({
      entityType: "category",
      operation: "create",
      endpoint: "/api/mobile/v1/categories",
      method: "POST",
      payload: input,
      onlineCall: (id) => this.http.createCategory(input, id),
      offlineCall: async () =>
        dbCreateCategory(await ensureDbReady(), {
          ...input,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  updateCategory(
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryItem> {
    return this.writeWithOutbox({
      entityType: "category",
      operation: "update",
      endpoint: `/api/mobile/v1/categories/${encodeURIComponent(categoryId)}`,
      method: "PATCH",
      payload: input,
      onlineCall: (id) => this.http.updateCategory(categoryId, input, id),
      offlineCall: async () =>
        dbUpdateCategory(await ensureDbReady(), {
          ...input,
          categoryId,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  getProducts(params?: ProductQueryParams): Promise<ProductItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getProducts(params),
      async () => dbListProducts(await ensureDbReady(), params),
    );
  }

  getProductById(productId: string): Promise<ProductDetailResponse | null> {
    return this.readWithOfflineFallback(
      () => this.http.getProductById(productId),
      async () => dbGetProductDetail(await ensureDbReady(), productId),
    );
  }

  createProduct(input: CreateProductInput): Promise<ProductItem> {
    return this.writeWithOutbox({
      entityType: "product",
      operation: "create",
      endpoint: "/api/mobile/v1/products",
      method: "POST",
      payload: input,
      onlineCall: (id) => this.http.createProduct(input, id),
      offlineCall: async () =>
        dbCreateProduct(await ensureDbReady(), {
          ...input,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  updateProduct(
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductItem> {
    return this.writeWithOutbox({
      entityType: "product",
      operation: "update",
      endpoint: `/api/mobile/v1/products/${encodeURIComponent(productId)}`,
      method: "PATCH",
      payload: input,
      onlineCall: (id) => this.http.updateProduct(productId, input, id),
      offlineCall: async () =>
        dbUpdateProduct(await ensureDbReady(), {
          ...input,
          productId,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  bulkCreateProducts(
    items: CreateProductInput[],
  ): Promise<BulkImportProductsResult> {
    return this.http.bulkCreateProducts(items);
  }

  adjustProductStock(
    productId: string,
    input: AdjustStockInput,
  ): Promise<ProductItem> {
    return this.writeWithOutbox({
      entityType: "product",
      operation: "stock_adjust",
      endpoint: `/api/mobile/v1/products/${encodeURIComponent(productId)}/stock`,
      method: "PATCH",
      payload: input,
      onlineCall: (id) => this.http.adjustProductStock(productId, input, id),
      offlineCall: async () =>
        dbAdjustProductStock(await ensureDbReady(), {
          ...input,
          productId,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  lookupProductByBarcode(barcode: string): Promise<ProductItem | null> {
    return this.readWithOfflineFallback(
      () => this.http.lookupProductByBarcode(barcode),
      async () => dbFindProductByBarcode(await ensureDbReady(), barcode),
    );
  }

  getRestockLogs(params?: RestockQueryParams): Promise<RestockLogItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getRestockLogs(params),
      async () => dbListRestockLogs(await ensureDbReady(), params),
    );
  }

  recordRestock(input: CreateRestockInput): Promise<RestockLogItem> {
    return this.writeWithOutbox({
      entityType: "product",
      operation: "restock",
      endpoint: "/api/mobile/v1/inventory/restocks",
      method: "POST",
      payload: input,
      onlineCall: (id) => this.http.recordRestock(input, id),
      offlineCall: async () =>
        dbRecordRestock(await ensureDbReady(), {
          ...input,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  getRecentSales(params?: SalesQueryParams): Promise<SaleTransactionSummary[]> {
    return this.readWithOfflineFallback(
      () => this.http.getRecentSales(params),
      async () => dbListSales(await ensureDbReady(), params),
    );
  }

  getSaleReceiptById(saleId: string): Promise<SaleReceiptDetail | null> {
    return this.readWithOfflineFallback(
      () => this.http.getSaleReceiptById(saleId),
      async () => dbGetSaleReceipt(await ensureDbReady(), saleId),
    );
  }

  createSale(input: CreateSaleInput): Promise<SaleReceiptDetail> {
    return this.writeWithOutbox({
      entityType: "sale",
      operation: "create",
      endpoint: "/api/mobile/v1/sales",
      method: "POST",
      payload: input,
      onlineCall: (id) => this.http.createSale(input, id),
      offlineCall: async () =>
        dbCreateSale(await ensureDbReady(), {
          ...input,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  refundSale(
    saleId: string,
    input?: RefundSaleInput,
  ): Promise<SaleReceiptDetail> {
    return this.writeWithOutbox({
      entityType: "sale",
      operation: "refund",
      endpoint: `/api/mobile/v1/sales/${encodeURIComponent(saleId)}/refund`,
      method: "POST",
      payload: input ?? {},
      onlineCall: (id) => this.http.refundSale(saleId, input, id),
      offlineCall: async () =>
        dbRefundSale(await ensureDbReady(), {
          ...input,
          saleId,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  getSalesReport(dateRange: SalesDateRange = "30d"): Promise<SalesReportData> {
    return this.readWithOfflineFallback(
      () => this.http.getSalesReport(dateRange),
      async () => dbGetSalesReport(await ensureDbReady(), dateRange),
    );
  }

  getCustomers(query?: string): Promise<CustomerItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getCustomers(query),
      async () => dbListCustomers(await ensureDbReady(), query),
    );
  }

  getCustomerById(customerId: string): Promise<CustomerDetailResponse | null> {
    return this.readWithOfflineFallback(
      () => this.http.getCustomerById(customerId),
      async () => dbGetCustomerDetail(await ensureDbReady(), customerId),
    );
  }

  createCustomer(input: CreateCustomerInput): Promise<CustomerItem> {
    return this.writeWithOutbox({
      entityType: "customer",
      operation: "create",
      endpoint: "/api/mobile/v1/customers",
      method: "POST",
      payload: input,
      onlineCall: (id) => this.http.createCustomer(input, id),
      offlineCall: async () =>
        dbCreateCustomer(await ensureDbReady(), {
          ...input,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  updateCustomer(
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerItem> {
    return this.writeWithOutbox({
      entityType: "customer",
      operation: "update",
      endpoint: `/api/mobile/v1/customers/${encodeURIComponent(customerId)}`,
      method: "PATCH",
      payload: input,
      onlineCall: (id) => this.http.updateCustomer(customerId, input, id),
      offlineCall: async () =>
        dbUpdateCustomer(await ensureDbReady(), {
          ...input,
          customerId,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  getSuppliers(query?: string): Promise<SupplierItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getSuppliers(query),
      async () => dbListSuppliers(await ensureDbReady(), query),
    );
  }

  getSupplierById(supplierId: string): Promise<SupplierDetailResponse | null> {
    return this.readWithOfflineFallback(
      () => this.http.getSupplierById(supplierId),
      async () => dbGetSupplierDetail(await ensureDbReady(), supplierId),
    );
  }

  createSupplier(input: CreateSupplierInput): Promise<SupplierItem> {
    return this.writeWithOutbox({
      entityType: "supplier",
      operation: "create",
      endpoint: "/api/mobile/v1/suppliers",
      method: "POST",
      payload: input,
      onlineCall: (id) => this.http.createSupplier(input, id),
      offlineCall: async () =>
        dbCreateSupplier(await ensureDbReady(), {
          ...input,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  updateSupplier(
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierItem> {
    return this.writeWithOutbox({
      entityType: "supplier",
      operation: "update",
      endpoint: `/api/mobile/v1/suppliers/${encodeURIComponent(supplierId)}`,
      method: "PATCH",
      payload: input,
      onlineCall: (id) => this.http.updateSupplier(supplierId, input, id),
      offlineCall: async () =>
        dbUpdateSupplier(await ensureDbReady(), {
          ...input,
          supplierId,
          userId: await this.requireLocalActorUserId(),
        }),
    });
  }

  recordSupplierTransaction(
    input: CreateSupplierTransactionInput,
  ): Promise<SupplierTransactionSummary> {
    return this.http.recordSupplierTransaction(input);
  }

  paySupplierTransactionBalance(
    input: PaySupplierBalanceInput,
  ): Promise<SupplierTransactionSummary> {
    return this.http.paySupplierTransactionBalance(input);
  }

  getEmployees(query?: string): Promise<EmployeeItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getEmployees(query),
      async () => dbListEmployees(await ensureDbReady(), query),
    );
  }

  getEmployeeById(employeeId: string): Promise<EmployeeDetailResponse | null> {
    return this.readWithOfflineFallback(
      () => this.http.getEmployeeById(employeeId),
      async () => dbGetEmployeeDetail(await ensureDbReady(), employeeId),
    );
  }

  createEmployee(input: CreateEmployeeInput): Promise<EmployeeItem> {
    return this.http.createEmployee(input);
  }

  updateEmployee(
    employeeId: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeItem> {
    return this.http.updateEmployee(employeeId, input);
  }

  getDailyReport(date?: string): Promise<DailyReportData> {
    return this.readWithOfflineFallback(
      () => this.http.getDailyReport(date),
      async () => dbGetDailyReport(await ensureDbReady(), date),
    );
  }

  getAuditLogs(params?: AuditLogsQueryParams): Promise<AuditLogItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getAuditLogs(params),
      async () => dbListAuditLogs(await ensureDbReady(), params),
    );
  }

  getNotifications(
    params?: NotificationsQueryParams,
  ): Promise<NotificationItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getNotifications(params),
      async () =>
        dbListNotifications(await ensureDbReady(), {
          ...params,
          userId: await this.requireLocalActorUserId(),
        }),
    );
  }

  getUnreadNotificationCount(): Promise<number> {
    return this.readWithOfflineFallback(
      () => this.http.getUnreadNotificationCount(),
      async () =>
        dbGetUnreadNotificationCount(
          await ensureDbReady(),
          await this.requireLocalActorUserId(),
        ),
    );
  }

  markNotificationRead(notificationId: string): Promise<NotificationItem> {
    return this.http.markNotificationRead(notificationId);
  }

  markAllNotificationsRead(): Promise<{ updatedCount: number }> {
    return this.http.markAllNotificationsRead();
  }

  deleteNotification(notificationId: string): Promise<void> {
    return this.http.deleteNotification(notificationId);
  }

  clearAllNotifications(): Promise<{ deletedCount: number }> {
    return this.http.clearAllNotifications();
  }

  getBroadcastRecipients(
    group: BroadcastRecipientGroup,
  ): Promise<BroadcastRecipient[]> {
    return this.readWithOfflineFallback(
      () => this.http.getBroadcastRecipients(group),
      async () => dbListBroadcastRecipients(await ensureDbReady(), group),
    );
  }

  getBroadcastMessages(): Promise<BroadcastMessageItem[]> {
    return this.readWithOfflineFallback(
      () => this.http.getBroadcastMessages(),
      async () => dbListBroadcastMessages(await ensureDbReady()),
    );
  }

  sendBroadcastMessage(
    input: SendBroadcastInput,
  ): Promise<BroadcastMessageItem> {
    return this.http.sendBroadcastMessage(input);
  }

  getUserSessions(): Promise<UserSessionItem[]> {
    return this.http.getUserSessions();
  }

  revokeUserSession(sessionId: string): Promise<void> {
    return this.http.revokeUserSession(sessionId);
  }

  revokeOtherUserSessions(): Promise<{ revokedCount: number }> {
    return this.http.revokeOtherUserSessions();
  }

  updateMyProfile(input: UpdateMyProfileInput): Promise<SessionUser> {
    return this.http.updateMyProfile(input);
  }

  changeMyPassword(input: ChangePasswordInput): Promise<void> {
    return this.http.changeMyPassword(input);
  }

  async updateStockAlertThreshold(threshold: number): Promise<StoreProfile> {
    const updated = await this.http.updateStockAlertThreshold(threshold);
    try {
      const db = await ensureDbReady();
      updateStoreStockThreshold(db, {
        userId: await this.requireLocalActorUserId(),
        threshold,
      });
    } catch {
      // ignore local cache update errors
    }
    this.onLocalDataChanged?.();
    return updated;
  }

  async updateBusinessSettings(
    input: UpdateBusinessSettingsInput,
  ): Promise<StoreProfile> {
    const updated = await this.http.updateBusinessSettings(input);
    try {
      const db = await ensureDbReady();
      updateStoreBusinessProfile(db, {
        ...input,
        userId: await this.requireLocalActorUserId(),
      });
    } catch {
      // ignore local cache update errors
    }
    this.onLocalDataChanged?.();
    return updated;
  }
}
