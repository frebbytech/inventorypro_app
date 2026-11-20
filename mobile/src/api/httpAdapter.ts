import Constants from "expo-constants";
import { Platform } from "react-native";
import { inferProductImageUploadMeta } from "@/utils/productImage";
import type { AuthenticatedApiClient } from "./sqliteAdapter";
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
  SyncBootstrapResponse,
  SyncDeltaResponse,
  SyncMergePayload,
  SyncMergeResponse,
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

export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return "";
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost;

  if (hostUri) {
    const cleaned = hostUri.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    return `http://${cleaned}`;
  }

  return Platform.OS === "android"
    ? "http://10.0.2.2:8081"
    : "http://localhost:8081";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface HttpApiClientConfig {
  baseUrl?: string;
  getBaseUrl?: () => string;
  getAccessToken: () => string | null;
  onUnauthorized?: () => void;
}

/**
 * HTTP client for connecting to the InventoryPro multi-tenant Next.js backend.
 */
export class HttpApiClient implements AuthenticatedApiClient {
  readonly adapterName = "Synced Cloud API";
  readonly isDemo = false;

  constructor(private readonly config: HttpApiClientConfig) {}

  getResolvedBaseUrl(): string {
    const raw =
      this.config.getBaseUrl?.() ?? this.config.baseUrl ?? resolveApiBaseUrl();
    return raw.trim().replace(/\/+$/, "");
  }

  async rawRequest<T>(
    path: string,
    init?: RequestInit & {
      allowNotFound?: boolean;
      skipAuthCheck?: boolean;
      clientMutationId?: string;
    },
  ): Promise<T> {
    return this.request<T>(path, init);
  }

  private async request<T>(
    path: string,
    init?: RequestInit & {
      allowNotFound?: boolean;
      skipAuthCheck?: boolean;
      clientMutationId?: string;
    },
  ): Promise<T> {
    const token = this.config.getAccessToken();
    const { allowNotFound, skipAuthCheck, clientMutationId, ...fetchInit } =
      init ?? {};

    const isFormDataBody =
      typeof FormData !== "undefined" && fetchInit.body instanceof FormData;

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(fetchInit.body && !isFormDataBody
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clientMutationId ? { "X-Client-Mutation-Id": clientMutationId } : {}),
      ...((fetchInit.headers as Record<string, string> | undefined) ?? {}),
    };

    const res = await fetch(`${this.getResolvedBaseUrl()}${path}`, {
      ...fetchInit,
      headers,
    });

    if (allowNotFound && res.status === 404) {
      return null as T;
    }

    if (res.status === 401 && !skipAuthCheck) {
      this.config.onUnauthorized?.();
    }

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const errorMsg =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Request failed (HTTP ${res.status})`;
      throw new ApiError(errorMsg, res.status);
    }

    return payload as T;
  }

  login(payload: AuthLoginPayload): Promise<AuthLoginResult> {
    return this.request<AuthLoginResult>("/api/mobile/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuthCheck: true,
    });
  }

  verifyTwoFactor(payload: {
    challengeToken: string;
    code: string;
    deviceName?: string;
    deviceType?: string;
    operatingSystem?: string;
  }): Promise<AuthLoginResponse> {
    return this.request<AuthLoginResponse>("/api/mobile/v1/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuthCheck: true,
    });
  }

  resendTwoFactor(challengeToken: string): Promise<{
    challengeToken: string;
    method: string;
    maskedTarget: string;
  }> {
    return this.request("/api/mobile/v1/auth/2fa/resend", {
      method: "POST",
      body: JSON.stringify({ challengeToken }),
      skipAuthCheck: true,
    });
  }

  getMe(): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>("/api/mobile/v1/auth/me");
  }

  async logout(): Promise<void> {
    await this.request<{ ok: boolean }>("/api/mobile/v1/auth/logout", {
      method: "POST",
      skipAuthCheck: true,
    });
  }

  syncBootstrap(): Promise<SyncBootstrapResponse> {
    return this.request<SyncBootstrapResponse>("/api/mobile/v1/sync/bootstrap");
  }

  syncDelta(cursor: number): Promise<SyncDeltaResponse> {
    return this.request<SyncDeltaResponse>(
      `/api/mobile/v1/sync/delta?cursor=${Math.max(0, Math.trunc(cursor || 0))}`,
    );
  }

  syncMerge(
    payload: SyncMergePayload,
    clientMutationId?: string,
  ): Promise<SyncMergeResponse> {
    return this.request<SyncMergeResponse>("/api/mobile/v1/sync/merge", {
      method: "POST",
      body: JSON.stringify(payload),
      clientMutationId,
    });
  }

  getTodayDashboard(): Promise<TodayDashboardData> {
    return this.request<TodayDashboardData>("/api/mobile/v1/dashboard/today");
  }

  getCategories(): Promise<string[]> {
    return this.request<string[]>("/api/mobile/v1/categories");
  }

  getCategoryDetails(query?: string): Promise<CategoryItem[]> {
    const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return this.request<CategoryItem[]>(`/api/mobile/v1/categories/manage${suffix}`);
  }

  createCategory(
    input: CreateCategoryInput,
    clientMutationId?: string,
  ): Promise<CategoryItem> {
    return this.request<CategoryItem>("/api/mobile/v1/categories", {
      method: "POST",
      body: JSON.stringify(input),
      clientMutationId,
    });
  }

  updateCategory(
    categoryId: string,
    input: UpdateCategoryInput,
    clientMutationId?: string,
  ): Promise<CategoryItem> {
    return this.request<CategoryItem>(
      `/api/mobile/v1/categories/${encodeURIComponent(categoryId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        clientMutationId,
      },
    );
  }

  getProducts(params?: ProductQueryParams): Promise<ProductItem[]> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set("q", params.query);
    if (params?.category && params.category !== "All") qs.set("category", params.category);
    if (params?.stockStatus && params.stockStatus !== "all") {
      qs.set("stock", params.stockStatus);
    }
    if (typeof params?.threshold === "number" && params.threshold >= 1) {
      qs.set("threshold", String(Math.trunc(params.threshold)));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ProductItem[]>(`/api/mobile/v1/products${suffix}`);
  }

  getProductById(productId: string): Promise<ProductDetailResponse | null> {
    return this.request<ProductDetailResponse | null>(
      `/api/mobile/v1/products/${encodeURIComponent(productId)}`,
      { allowNotFound: true },
    );
  }

  createProduct(
    input: CreateProductInput,
    clientMutationId?: string,
  ): Promise<ProductItem> {
    return this.request<ProductItem>("/api/mobile/v1/products", {
      method: "POST",
      body: JSON.stringify(input),
      clientMutationId,
    });
  }

  updateProduct(
    productId: string,
    input: UpdateProductInput,
    clientMutationId?: string,
  ): Promise<ProductItem> {
    return this.request<ProductItem>(
      `/api/mobile/v1/products/${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        clientMutationId,
      },
    );
  }

  async uploadProductImage(
    localUri: string,
    opts?: { mimeType?: string; fileName?: string; webFile?: Blob },
  ): Promise<string> {
    const trimmed = localUri.trim();
    if (!trimmed) {
      throw new Error("No image URI was provided for upload.");
    }

    const meta = inferProductImageUploadMeta(trimmed, opts);
    const formData = new FormData();
    formData.append("folder", "products");

    if (Platform.OS === "web") {
      const blob =
        opts?.webFile ?? (await (await fetch(trimmed)).blob());
      const resolvedType =
        blob.type === "image/png" || blob.type === "image/webp" || blob.type === "image/jpeg"
          ? blob.type
          : meta.mimeType;
      const webFile =
        typeof File !== "undefined"
          ? new File([blob], meta.fileName, { type: resolvedType })
          : blob;
      formData.append("file", webFile);
    } else {
      formData.append("file", {
        uri: trimmed,
        name: meta.fileName,
        type: meta.mimeType,
      } as unknown as Blob);
    }

    const res = await this.request<{
      success?: boolean;
      downloadURL?: string;
    }>("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res?.downloadURL) {
      throw new Error("Server did not return an uploaded image URL.");
    }
    return res.downloadURL;
  }

  bulkCreateProducts(
    items: CreateProductInput[],
    clientMutationId?: string,
  ): Promise<BulkImportProductsResult> {
    return this.request<BulkImportProductsResult>("/api/mobile/v1/products/bulk", {
      method: "POST",
      body: JSON.stringify({ items }),
      clientMutationId,
    });
  }

  adjustProductStock(
    productId: string,
    input: AdjustStockInput,
    clientMutationId?: string,
  ): Promise<ProductItem> {
    return this.request<ProductItem>(
      `/api/mobile/v1/products/${encodeURIComponent(productId)}/stock`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        clientMutationId,
      },
    );
  }

  lookupProductByBarcode(barcode: string): Promise<ProductItem | null> {
    return this.request<ProductItem | null>(
      `/api/mobile/v1/products/barcode/${encodeURIComponent(barcode.trim())}`,
      { allowNotFound: true },
    );
  }

  getRestockLogs(params?: RestockQueryParams): Promise<RestockLogItem[]> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set("q", params.query);
    if (params?.productId) qs.set("productId", params.productId);
    if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<RestockLogItem[]>(
      `/api/mobile/v1/inventory/restocks${suffix}`,
    );
  }

  recordRestock(
    input: CreateRestockInput,
    clientMutationId?: string,
  ): Promise<RestockLogItem> {
    return this.request<RestockLogItem>("/api/mobile/v1/inventory/restocks", {
      method: "POST",
      body: JSON.stringify(input),
      clientMutationId,
    });
  }

  getRecentSales(params?: SalesQueryParams): Promise<SaleTransactionSummary[]> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set("q", params.query);
    if (params?.paymentMode && params.paymentMode !== "all") {
      qs.set("paymentMode", params.paymentMode);
    }
    if (params?.status && params.status !== "all") {
      qs.set("status", params.status);
    }
    if (params?.dateRange && params.dateRange !== "all") {
      qs.set("dateRange", params.dateRange);
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<SaleTransactionSummary[]>(`/api/mobile/v1/sales${suffix}`);
  }

  getSaleReceiptById(saleId: string): Promise<SaleReceiptDetail | null> {
    return this.request<SaleReceiptDetail | null>(
      `/api/mobile/v1/sales/${encodeURIComponent(saleId)}/receipt`,
      { allowNotFound: true },
    );
  }

  createSale(
    input: CreateSaleInput,
    clientMutationId?: string,
  ): Promise<SaleReceiptDetail> {
    return this.request<SaleReceiptDetail>("/api/mobile/v1/sales", {
      method: "POST",
      body: JSON.stringify(input),
      clientMutationId,
    });
  }

  refundSale(
    saleId: string,
    input?: RefundSaleInput,
    clientMutationId?: string,
  ): Promise<SaleReceiptDetail> {
    return this.request<SaleReceiptDetail>(
      `/api/mobile/v1/sales/${encodeURIComponent(saleId)}/refund`,
      {
        method: "POST",
        body: JSON.stringify(input ?? {}),
        clientMutationId,
      },
    );
  }

  getSalesReport(dateRange: SalesDateRange = "30d"): Promise<SalesReportData> {
    return this.request<SalesReportData>(
      `/api/mobile/v1/sales/report?range=${encodeURIComponent(dateRange)}`,
    );
  }

  getCustomers(query?: string): Promise<CustomerItem[]> {
    const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return this.request<CustomerItem[]>(`/api/mobile/v1/customers${suffix}`);
  }

  getCustomerById(customerId: string): Promise<CustomerDetailResponse | null> {
    return this.request<CustomerDetailResponse | null>(
      `/api/mobile/v1/customers/${encodeURIComponent(customerId)}`,
      { allowNotFound: true },
    );
  }

  createCustomer(
    input: CreateCustomerInput,
    clientMutationId?: string,
  ): Promise<CustomerItem> {
    return this.request<CustomerItem>("/api/mobile/v1/customers", {
      method: "POST",
      body: JSON.stringify(input),
      clientMutationId,
    });
  }

  updateCustomer(
    customerId: string,
    input: UpdateCustomerInput,
    clientMutationId?: string,
  ): Promise<CustomerItem> {
    return this.request<CustomerItem>(
      `/api/mobile/v1/customers/${encodeURIComponent(customerId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        clientMutationId,
      },
    );
  }

  getSuppliers(query?: string): Promise<SupplierItem[]> {
    const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return this.request<SupplierItem[]>(`/api/mobile/v1/suppliers${suffix}`);
  }

  getSupplierById(supplierId: string): Promise<SupplierDetailResponse | null> {
    return this.request<SupplierDetailResponse | null>(
      `/api/mobile/v1/suppliers/${encodeURIComponent(supplierId)}`,
      { allowNotFound: true },
    );
  }

  createSupplier(
    input: CreateSupplierInput,
    clientMutationId?: string,
  ): Promise<SupplierItem> {
    return this.request<SupplierItem>("/api/mobile/v1/suppliers", {
      method: "POST",
      body: JSON.stringify(input),
      clientMutationId,
    });
  }

  updateSupplier(
    supplierId: string,
    input: UpdateSupplierInput,
    clientMutationId?: string,
  ): Promise<SupplierItem> {
    return this.request<SupplierItem>(
      `/api/mobile/v1/suppliers/${encodeURIComponent(supplierId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        clientMutationId,
      },
    );
  }

  recordSupplierTransaction(
    input: CreateSupplierTransactionInput,
    clientMutationId?: string,
  ): Promise<SupplierTransactionSummary> {
    return this.request<SupplierTransactionSummary>(
      `/api/mobile/v1/suppliers/${encodeURIComponent(input.supplierId)}/transactions`,
      {
        method: "POST",
        body: JSON.stringify(input),
        clientMutationId,
      },
    );
  }

  paySupplierTransactionBalance(
    input: PaySupplierBalanceInput,
    clientMutationId?: string,
  ): Promise<SupplierTransactionSummary> {
    return this.request<SupplierTransactionSummary>(
      `/api/mobile/v1/suppliers/transactions/${encodeURIComponent(input.transactionId)}/pay`,
      {
        method: "POST",
        body: JSON.stringify(input),
        clientMutationId,
      },
    );
  }

  getEmployees(query?: string): Promise<EmployeeItem[]> {
    const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return this.request<EmployeeItem[]>(`/api/mobile/v1/employees${suffix}`);
  }

  getEmployeeById(employeeId: string): Promise<EmployeeDetailResponse | null> {
    return this.request<EmployeeDetailResponse | null>(
      `/api/mobile/v1/employees/${encodeURIComponent(employeeId)}`,
      { allowNotFound: true },
    );
  }

  createEmployee(input: CreateEmployeeInput): Promise<EmployeeItem> {
    return this.request<EmployeeItem>("/api/mobile/v1/employees", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateEmployee(
    employeeId: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeItem> {
    return this.request<EmployeeItem>(
      `/api/mobile/v1/employees/${encodeURIComponent(employeeId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  getDailyReport(date?: string): Promise<DailyReportData> {
    const suffix = date?.trim() ? `?date=${encodeURIComponent(date.trim())}` : "";
    return this.request<DailyReportData>(`/api/mobile/v1/reports/daily${suffix}`);
  }

  getAuditLogs(params?: AuditLogsQueryParams): Promise<AuditLogItem[]> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set("q", params.query);
    if (params?.action && params.action !== "all") qs.set("action", params.action);
    if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<AuditLogItem[]>(`/api/mobile/v1/audit-logs${suffix}`);
  }

  getNotifications(params?: NotificationsQueryParams): Promise<NotificationItem[]> {
    const qs = new URLSearchParams();
    if (params?.unreadOnly) qs.set("unreadOnly", "true");
    if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<NotificationItem[]>(`/api/mobile/v1/notifications${suffix}`);
  }

  async getUnreadNotificationCount(): Promise<number> {
    const res = await this.request<{ count: number }>(
      "/api/mobile/v1/notifications/unread-count",
    );
    return Number(res?.count ?? 0);
  }

  markNotificationRead(
    notificationId: string,
    clientMutationId?: string,
  ): Promise<NotificationItem> {
    return this.request<NotificationItem>(
      `/api/mobile/v1/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "PATCH", clientMutationId },
    );
  }

  markAllNotificationsRead(
    clientMutationId?: string,
  ): Promise<{ updatedCount: number }> {
    return this.request<{ updatedCount: number }>(
      "/api/mobile/v1/notifications/read-all",
      { method: "POST", clientMutationId },
    );
  }

  async deleteNotification(
    notificationId: string,
    clientMutationId?: string,
  ): Promise<void> {
    await this.request<void>(
      `/api/mobile/v1/notifications/${encodeURIComponent(notificationId)}`,
      { method: "DELETE", clientMutationId },
    );
  }

  clearAllNotifications(
    clientMutationId?: string,
  ): Promise<{ deletedCount: number }> {
    return this.request<{ deletedCount: number }>("/api/mobile/v1/notifications", {
      method: "DELETE",
      clientMutationId,
    });
  }

  getBroadcastRecipients(
    group: BroadcastRecipientGroup,
  ): Promise<BroadcastRecipient[]> {
    return this.request<BroadcastRecipient[]>(
      `/api/mobile/v1/messages/recipients?group=${encodeURIComponent(group)}`,
    );
  }

  getBroadcastMessages(): Promise<BroadcastMessageItem[]> {
    return this.request<BroadcastMessageItem[]>("/api/mobile/v1/messages");
  }

  sendBroadcastMessage(
    input: SendBroadcastInput,
    clientMutationId?: string,
  ): Promise<BroadcastMessageItem> {
    return this.request<BroadcastMessageItem>("/api/mobile/v1/messages", {
      method: "POST",
      body: JSON.stringify(input),
      clientMutationId,
    });
  }

  getUserSessions(): Promise<UserSessionItem[]> {
    return this.request<UserSessionItem[]>("/api/mobile/v1/security/sessions");
  }

  async revokeUserSession(sessionId: string): Promise<void> {
    await this.request<void>(
      `/api/mobile/v1/security/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    );
  }

  revokeOtherUserSessions(): Promise<{ revokedCount: number }> {
    return this.request<{ revokedCount: number }>(
      "/api/mobile/v1/security/sessions/revoke-others",
      { method: "POST" },
    );
  }

  updateMyProfile(input: UpdateMyProfileInput): Promise<SessionUser> {
    return this.request<SessionUser>("/api/mobile/v1/security/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async changeMyPassword(input: ChangePasswordInput): Promise<void> {
    await this.request<void>("/api/mobile/v1/security/password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateStockAlertThreshold(threshold: number): Promise<StoreProfile> {
    return this.request<StoreProfile>("/api/mobile/v1/settings/stock-threshold", {
      method: "PATCH",
      body: JSON.stringify({ threshold: Math.trunc(threshold) }),
    });
  }

  updateBusinessSettings(input: UpdateBusinessSettingsInput): Promise<StoreProfile> {
    return this.request<StoreProfile>("/api/mobile/v1/settings/business", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
}
