import { Platform } from "react-native";
import type { InventoryProApiClient } from "./client";
import { ensureDbReady } from "../db/client";
import {
  adjustProductStock as dbAdjustProductStock,
  authenticateWithCredentials,
  bulkCreateProducts as dbBulkCreateProducts,
  bulkUpdateStaffTwoFactorLocal,
  changeOwnPassword as dbChangeOwnPassword,
  clearAllNotifications as dbClearAllNotifications,
  createCategory as dbCreateCategory,
  createCustomer as dbCreateCustomer,
  createEmployee as dbCreateEmployee,
  createProduct as dbCreateProduct,
  createSale as dbCreateSale,
  createSupplier as dbCreateSupplier,
  deleteNotificationById as dbDeleteNotificationById,
  findProductByBarcode as dbFindProductByBarcode,
  getCustomerDetail as dbGetCustomerDetail,
  getDailyReport as dbGetDailyReport,
  getEmployeeDetail as dbGetEmployeeDetail,
  getProductDetail as dbGetProductDetail,
  getSaleReceipt as dbGetSaleReceipt,
  getSalesReport as dbGetSalesReport,
  getStoreProfile,
  getSupplierDetail as dbGetSupplierDetail,
  getTodayDashboard as dbGetTodayDashboard,
  getTwoFactorOverviewLocal,
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
  listUserSessions as dbListUserSessions,
  markAllNotificationsRead as dbMarkAllNotificationsRead,
  markNotificationRead as dbMarkNotificationRead,
  paySupplierTransactionBalance as dbPaySupplierTransactionBalance,
  recordRestock as dbRecordRestock,
  recordSupplierTransaction as dbRecordSupplierTransaction,
  refundSale as dbRefundSale,
  restoreSessionByToken,
  revokeOtherUserSessions as dbRevokeOtherUserSessions,
  revokeSessionByToken,
  revokeUserSession as dbRevokeUserSession,
  sendBroadcastMessage as dbSendBroadcastMessage,
  updateCategory as dbUpdateCategory,
  updateCustomer as dbUpdateCustomer,
  updateEmployee as dbUpdateEmployee,
  updateOwnProfile as dbUpdateOwnProfile,
  updateProduct as dbUpdateProduct,
  updateStoreBusinessHours,
  updateStoreBusinessProfile,
  updateStoreNotificationSettings,
  updateStoreStockThreshold,
  updateSupplier as dbUpdateSupplier,
  updateUserTwoFactorLocal,
} from "../db/queries";
import type {
  AdjustStockInput,
  AuditLogItem,
  AuditLogsQueryParams,
  AuthLoginPayload,
  AuthLoginResponse,
  AuthLoginResult,
  AuthSessionResponse,
  BroadcastMessageItem,
  BroadcastRecipient,
  BroadcastRecipientGroup,
  BulkImportProductsResult,
  BulkUpdateTwoFactorInput,
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
  SendDailyReportResult,
  SessionUser,
  StaffTwoFactorAccount,
  StoreProfile,
  SupplierDetailResponse,
  SupplierItem,
  SupplierTransactionSummary,
  TodayDashboardData,
  TwoFactorOverviewResponse,
  UpdateBusinessHoursInput,
  UpdateBusinessSettingsInput,
  UpdateCategoryInput,
  UpdateCustomerInput,
  UpdateEmployeeInput,
  UpdateMyProfileInput,
  UpdateNotificationSettingsInput,
  UpdateProductInput,
  UpdateSupplierInput,
  UpdateTwoFactorInput,
  UserSessionItem,
} from "../types/domain";

export interface AuthenticatedApiClient extends InventoryProApiClient {
  login(payload: AuthLoginPayload): Promise<AuthLoginResult>;
  getMe(): Promise<AuthSessionResponse>;
  logout(): Promise<void>;
}

export interface ExpoSqliteClientConfig {
  getAccessToken: () => string | null;
  onUnauthorized?: () => void;
}

/**
 * On-device Expo SQLite + Drizzle ORM adapter implementing `InventoryProApiClient`.
 * Runs directly on Android, iOS, and Web without requiring `better-sqlite3` or a Node API server.
 */
export class ExpoSqliteDrizzleClient implements AuthenticatedApiClient {
  readonly adapterName = "Expo SQLite · Drizzle ORM";
  readonly isDemo = false;

  constructor(private readonly config: ExpoSqliteClientConfig) {}

  private async requireSession() {
    const db = await ensureDbReady();
    const token = this.config.getAccessToken();
    if (!token) {
      this.config.onUnauthorized?.();
      throw new Error("Authentication required or session expired.");
    }
    const session = restoreSessionByToken(db, token);
    if (!session) {
      this.config.onUnauthorized?.();
      throw new Error("Authentication required or session expired.");
    }
    return { db, session };
  }

  async login(payload: AuthLoginPayload): Promise<AuthLoginResponse> {
    const db = await ensureDbReady();
    return authenticateWithCredentials(db, {
      identifier: payload.identifier,
      password: payload.password,
      deviceName: payload.deviceName,
      platform: Platform.OS,
    });
  }

  async getMe(): Promise<AuthSessionResponse> {
    const { session } = await this.requireSession();
    return {
      user: session.user,
      store: session.store,
    };
  }

  async logout(): Promise<void> {
    const token = this.config.getAccessToken();
    if (!token) return;
    const db = await ensureDbReady();
    revokeSessionByToken(db, token);
  }

  async getTodayDashboard(): Promise<TodayDashboardData> {
    const { db } = await this.requireSession();
    return dbGetTodayDashboard(db);
  }

  async getCategories(): Promise<string[]> {
    const { db } = await this.requireSession();
    return dbListCategories(db);
  }

  async getCategoryDetails(query?: string): Promise<CategoryItem[]> {
    const { db } = await this.requireSession();
    return dbListCategoryDetails(db, query);
  }

  async createCategory(input: CreateCategoryInput): Promise<CategoryItem> {
    const { db, session } = await this.requireSession();
    return dbCreateCategory(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async updateCategory(
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryItem> {
    const { db, session } = await this.requireSession();
    return dbUpdateCategory(db, {
      ...input,
      categoryId,
      userId: session.user.id,
    });
  }

  async getProducts(params?: ProductQueryParams): Promise<ProductItem[]> {
    const { db } = await this.requireSession();
    return dbListProducts(db, params);
  }

  async getProductById(productId: string): Promise<ProductDetailResponse | null> {
    const { db } = await this.requireSession();
    return dbGetProductDetail(db, productId);
  }

  async createProduct(input: CreateProductInput): Promise<ProductItem> {
    const { db, session } = await this.requireSession();
    return dbCreateProduct(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async updateProduct(
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductItem> {
    const { db, session } = await this.requireSession();
    return dbUpdateProduct(db, {
      ...input,
      productId,
      userId: session.user.id,
    });
  }

  async bulkCreateProducts(
    items: CreateProductInput[],
  ): Promise<BulkImportProductsResult> {
    const { db, session } = await this.requireSession();
    return dbBulkCreateProducts(db, {
      items,
      userId: session.user.id,
    });
  }

  async adjustProductStock(
    productId: string,
    input: AdjustStockInput,
  ): Promise<ProductItem> {
    const { db, session } = await this.requireSession();
    return dbAdjustProductStock(db, {
      ...input,
      productId,
      userId: session.user.id,
    });
  }

  async lookupProductByBarcode(barcode: string): Promise<ProductItem | null> {
    const { db } = await this.requireSession();
    return dbFindProductByBarcode(db, barcode);
  }

  async getRestockLogs(params?: RestockQueryParams): Promise<RestockLogItem[]> {
    const { db } = await this.requireSession();
    return dbListRestockLogs(db, params);
  }

  async recordRestock(input: CreateRestockInput): Promise<RestockLogItem> {
    const { db, session } = await this.requireSession();
    return dbRecordRestock(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async getRecentSales(params?: SalesQueryParams): Promise<SaleTransactionSummary[]> {
    const { db } = await this.requireSession();
    return dbListSales(db, params);
  }

  async getSaleReceiptById(saleId: string): Promise<SaleReceiptDetail | null> {
    const { db } = await this.requireSession();
    return dbGetSaleReceipt(db, saleId);
  }

  async createSale(input: CreateSaleInput): Promise<SaleReceiptDetail> {
    const { db, session } = await this.requireSession();
    return dbCreateSale(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async refundSale(
    saleId: string,
    input?: RefundSaleInput,
  ): Promise<SaleReceiptDetail> {
    const { db, session } = await this.requireSession();
    return dbRefundSale(db, {
      ...input,
      saleId,
      userId: session.user.id,
    });
  }

  async getSalesReport(dateRange: SalesDateRange = "30d"): Promise<SalesReportData> {
    const { db } = await this.requireSession();
    return dbGetSalesReport(db, dateRange);
  }

  async getCustomers(query?: string): Promise<CustomerItem[]> {
    const { db } = await this.requireSession();
    return dbListCustomers(db, query);
  }

  async getCustomerById(customerId: string): Promise<CustomerDetailResponse | null> {
    const { db } = await this.requireSession();
    return dbGetCustomerDetail(db, customerId);
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerItem> {
    const { db, session } = await this.requireSession();
    return dbCreateCustomer(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async updateCustomer(
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerItem> {
    const { db, session } = await this.requireSession();
    return dbUpdateCustomer(db, {
      ...input,
      customerId,
      userId: session.user.id,
    });
  }

  async getSuppliers(query?: string): Promise<SupplierItem[]> {
    const { db } = await this.requireSession();
    return dbListSuppliers(db, query);
  }

  async getSupplierById(supplierId: string): Promise<SupplierDetailResponse | null> {
    const { db } = await this.requireSession();
    return dbGetSupplierDetail(db, supplierId);
  }

  async createSupplier(input: CreateSupplierInput): Promise<SupplierItem> {
    const { db, session } = await this.requireSession();
    return dbCreateSupplier(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async updateSupplier(
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierItem> {
    const { db, session } = await this.requireSession();
    return dbUpdateSupplier(db, {
      ...input,
      supplierId,
      userId: session.user.id,
    });
  }

  async recordSupplierTransaction(
    input: CreateSupplierTransactionInput,
  ): Promise<SupplierTransactionSummary> {
    const { db, session } = await this.requireSession();
    return dbRecordSupplierTransaction(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async paySupplierTransactionBalance(
    input: PaySupplierBalanceInput,
  ): Promise<SupplierTransactionSummary> {
    const { db, session } = await this.requireSession();
    return dbPaySupplierTransactionBalance(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async getEmployees(query?: string): Promise<EmployeeItem[]> {
    const { db } = await this.requireSession();
    return dbListEmployees(db, query);
  }

  async getEmployeeById(
    employeeId: string,
  ): Promise<EmployeeDetailResponse | null> {
    const { db } = await this.requireSession();
    return dbGetEmployeeDetail(db, employeeId);
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeItem> {
    const { db, session } = await this.requireSession();
    return dbCreateEmployee(db, {
      ...input,
      actorUserId: session.user.id,
    });
  }

  async updateEmployee(
    employeeId: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeItem> {
    const { db, session } = await this.requireSession();
    return dbUpdateEmployee(db, {
      ...input,
      employeeId,
      actorUserId: session.user.id,
    });
  }

  async getDailyReport(date?: string): Promise<DailyReportData> {
    const { db } = await this.requireSession();
    return dbGetDailyReport(db, date);
  }

  async getAuditLogs(params?: AuditLogsQueryParams): Promise<AuditLogItem[]> {
    const { db } = await this.requireSession();
    return dbListAuditLogs(db, params);
  }

  async getNotifications(
    params?: NotificationsQueryParams,
  ): Promise<NotificationItem[]> {
    const { db, session } = await this.requireSession();
    return dbListNotifications(db, {
      ...params,
      userId: session.user.id,
    });
  }

  async getUnreadNotificationCount(): Promise<number> {
    const { db, session } = await this.requireSession();
    return dbGetUnreadNotificationCount(db, session.user.id);
  }

  async markNotificationRead(notificationId: string): Promise<NotificationItem> {
    const { db, session } = await this.requireSession();
    return dbMarkNotificationRead(db, {
      id: notificationId,
      userId: session.user.id,
    });
  }

  async markAllNotificationsRead(): Promise<{ updatedCount: number }> {
    const { db, session } = await this.requireSession();
    return dbMarkAllNotificationsRead(db, session.user.id);
  }

  async deleteNotification(notificationId: string): Promise<void> {
    const { db, session } = await this.requireSession();
    dbDeleteNotificationById(db, {
      id: notificationId,
      userId: session.user.id,
    });
  }

  async clearAllNotifications(): Promise<{ deletedCount: number }> {
    const { db, session } = await this.requireSession();
    return dbClearAllNotifications(db, session.user.id);
  }

  async getBroadcastRecipients(
    group: BroadcastRecipientGroup,
  ): Promise<BroadcastRecipient[]> {
    const { db } = await this.requireSession();
    return dbListBroadcastRecipients(db, group);
  }

  async getBroadcastMessages(): Promise<BroadcastMessageItem[]> {
    const { db } = await this.requireSession();
    return dbListBroadcastMessages(db);
  }

  async sendBroadcastMessage(
    input: SendBroadcastInput,
  ): Promise<BroadcastMessageItem> {
    const { db, session } = await this.requireSession();
    return dbSendBroadcastMessage(db, {
      ...input,
      senderId: session.user.id,
    });
  }

  async getUserSessions(): Promise<UserSessionItem[]> {
    const { db, session } = await this.requireSession();
    return dbListUserSessions(db, {
      userId: session.user.id,
      currentToken: this.config.getAccessToken(),
    });
  }

  async revokeUserSession(sessionId: string): Promise<void> {
    const { db, session } = await this.requireSession();
    dbRevokeUserSession(db, {
      sessionId,
      userId: session.user.id,
      currentToken: this.config.getAccessToken(),
    });
  }

  async revokeOtherUserSessions(): Promise<{ revokedCount: number }> {
    const { db, session } = await this.requireSession();
    const currentToken = this.config.getAccessToken() || "";
    return dbRevokeOtherUserSessions(db, {
      userId: session.user.id,
      currentToken,
    });
  }

  async updateMyProfile(input: UpdateMyProfileInput): Promise<SessionUser> {
    const { db, session } = await this.requireSession();
    return dbUpdateOwnProfile(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async changeMyPassword(input: ChangePasswordInput): Promise<void> {
    const { db, session } = await this.requireSession();
    await dbChangeOwnPassword(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async getTwoFactorOverview(): Promise<TwoFactorOverviewResponse> {
    const { db, session } = await this.requireSession();
    return getTwoFactorOverviewLocal(db, session.user.id);
  }

  async updateUserTwoFactor(
    input: UpdateTwoFactorInput,
  ): Promise<StaffTwoFactorAccount> {
    const { db, session } = await this.requireSession();
    return updateUserTwoFactorLocal(db, {
      ...input,
      actorUserId: session.user.id,
    });
  }

  async bulkUpdateStaffTwoFactor(
    input: BulkUpdateTwoFactorInput,
  ): Promise<{ updatedCount: number; skippedUsernames: string[] }> {
    const { db, session } = await this.requireSession();
    return bulkUpdateStaffTwoFactorLocal(db, {
      ...input,
      actorUserId: session.user.id,
    });
  }

  async getStoreSettings(): Promise<StoreProfile> {
    const { db } = await this.requireSession();
    return getStoreProfile(db);
  }

  async updateStockAlertThreshold(threshold: number): Promise<StoreProfile> {
    const { db, session } = await this.requireSession();
    return updateStoreStockThreshold(db, {
      userId: session.user.id,
      threshold,
    });
  }

  async updateBusinessSettings(
    input: UpdateBusinessSettingsInput,
  ): Promise<StoreProfile> {
    const { db, session } = await this.requireSession();
    return updateStoreBusinessProfile(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async updateNotificationSettings(
    input: UpdateNotificationSettingsInput,
  ): Promise<StoreProfile> {
    const { db, session } = await this.requireSession();
    return updateStoreNotificationSettings(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async updateBusinessHours(
    input: UpdateBusinessHoursInput,
  ): Promise<StoreProfile> {
    const { db, session } = await this.requireSession();
    return updateStoreBusinessHours(db, {
      ...input,
      userId: session.user.id,
    });
  }

  async sendDailyReportNow(_dateStr?: string): Promise<SendDailyReportResult> {
    throw new Error(
      "Sending daily EOD reports requires a synced Cloud Workspace connection.",
    );
  }
}
