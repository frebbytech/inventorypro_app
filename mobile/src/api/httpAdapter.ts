import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  logDevError,
  normalizeError,
  type MobileErrorCategory,
} from "../utils/errorHandler";
import { inferProductImageUploadMeta } from "../utils/productImage";
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
  SyncBootstrapResponse,
  SyncDeltaResponse,
  SyncMergePayload,
  SyncMergeResponse,
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

export interface PlatformServerConfigResponse {
  ok: boolean;
  serverUrl: string;
  configuredBySuperAdmin: boolean;
  updatedAt: string | null;
}

function normalizeHostUriToBackendUrl(hostUri: string): string {
  const cleaned = hostUri.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
  if (!cleaned) return "";

  const colonIdx = cleaned.lastIndexOf(":");
  if (colonIdx > 0) {
    const host = cleaned.slice(0, colonIdx);
    const port = cleaned.slice(colonIdx + 1);
    if (["8081", "19000", "19001", "19006"].includes(port)) {
      return `http://${host}:3000`;
    }
    return `http://${cleaned}`;
  }

  return `http://${cleaned}`;
}

export function resolveApiBaseUrl(): string {
  const envConfigured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envConfigured) {
    return envConfigured.replace(/\/+$/, "");
  }

  const extraConfig = (
    Constants.expoConfig?.extra as { apiBaseUrl?: unknown } | undefined
  )?.apiBaseUrl;
  if (typeof extraConfig === "string" && extraConfig.trim()) {
    return extraConfig.trim().replace(/\/+$/, "");
  }

  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    const port = window.location.port;
    if (port === "8081" || port === "19006") {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return "";
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost;

  if (hostUri) {
    const normalized = normalizeHostUriToBackendUrl(hostUri);
    if (normalized) return normalized;
  }

  return Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";
}

export class ApiError extends Error {
  readonly category: MobileErrorCategory;
  readonly code?: string;
  readonly retryable: boolean;
  readonly requiresSignIn: boolean;

  constructor(
    message: string,
    public readonly status: number,
    options?: {
      category?: MobileErrorCategory;
      code?: string;
      retryable?: boolean;
      requiresSignIn?: boolean;
    },
  ) {
    super(message);
    this.name = "ApiError";
    const normalized = normalizeError(message, {
      status,
      code: options?.code,
      silent: true,
    });
    this.category = options?.category ?? normalized.category;
    this.code = options?.code ?? normalized.code;
    this.retryable = options?.retryable ?? normalized.retryable;
    this.requiresSignIn = options?.requiresSignIn ?? normalized.requiresSignIn;
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
      baseUrlOverride?: string;
      tokenOverride?: string | null;
      timeoutMs?: number;
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
      baseUrlOverride?: string;
      tokenOverride?: string | null;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const {
      allowNotFound,
      skipAuthCheck,
      clientMutationId,
      baseUrlOverride,
      tokenOverride,
      timeoutMs = 25000,
      signal: externalSignal,
      ...fetchInit
    } = init ?? {};
    const token =
      tokenOverride !== undefined
        ? tokenOverride
        : this.config.getAccessToken();

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

    const resolvedBase =
      baseUrlOverride !== undefined
        ? baseUrlOverride.trim().replace(/\/+$/, "")
        : this.getResolvedBaseUrl();

    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : null;

    let res: Response;
    try {
      res = await fetch(`${resolvedBase}${path}`, {
        ...fetchInit,
        headers,
        signal: controller.signal,
      });
    } catch (err: any) {
      if (timedOut || (err?.name === "AbortError" && !externalSignal?.aborted)) {
        logDevError(`HttpApiClient.timeout:${path}`, err);
        throw new ApiError(
          "The server took too long to respond. Check your connection and try again.",
          408,
          { category: "timeout", code: "TIMEOUT", retryable: true },
        );
      }
      if (externalSignal?.aborted || err?.name === "AbortError") {
        throw new ApiError("Request cancelled.", 499, {
          category: "unknown",
          retryable: false,
        });
      }
      logDevError(`HttpApiClient.network:${path}`, err);
      throw new ApiError(
        "Couldn't reach the store server. Check your internet connection and try again.",
        0,
        { category: "network", code: "NETWORK_ERROR", retryable: true },
      );
    } finally {
      if (timer) clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }

    if (allowNotFound && res.status === 404) {
      return null as T;
    }

    if (res.status === 401 && !skipAuthCheck) {
      this.config.onUnauthorized?.();
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const rawText = await res.text().catch(() => "");
    let payload: unknown = null;
    let parsedJson = false;
    if (rawText.trim()) {
      try {
        payload = JSON.parse(rawText);
        parsedJson = true;
      } catch {
        payload = null;
      }
    }

    if (!res.ok) {
      const serverErrorText =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : undefined;
      const serverCode =
        payload &&
        typeof payload === "object" &&
        "code" in payload &&
        typeof (payload as { code?: unknown }).code === "string"
          ? (payload as { code: string }).code
          : undefined;

      if (res.status >= 500 || (!parsedJson && rawText.trim().length > 0)) {
        logDevError(`HttpApiClient.http:${res.status}:${path}`, {
          status: res.status,
          code: serverCode,
          body: serverErrorText ?? rawText.slice(0, 240),
        });
      }

      const normalized = normalizeError(
        serverErrorText ?? `HTTP ${res.status}`,
        {
          status: res.status,
          code: serverCode,
          silent: true,
        },
      );
      throw new ApiError(normalized.userMessage, res.status, {
        category: normalized.category,
        code: normalized.code,
        retryable: normalized.retryable,
        requiresSignIn:
          res.status === 401 && !skipAuthCheck
            ? true
            : normalized.requiresSignIn,
      });
    }

    if (rawText.trim() && !parsedJson) {
      logDevError(`HttpApiClient.invalidJson:${path}`, rawText.slice(0, 240));
      throw new ApiError(
        "Received an unexpected response from the server. Check your connection and try again.",
        res.status || 502,
        { category: "server", code: "SERVICE_UNAVAILABLE", retryable: true },
      );
    }

    return payload as T;
  }

  async checkHealth(baseUrlOverride?: string): Promise<boolean> {
    try {
      const res = await this.request<{ ok?: boolean }>(
        "/api/mobile/v1/health",
        {
          method: "GET",
          skipAuthCheck: true,
          baseUrlOverride,
          timeoutMs: 5000,
        },
      );
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }

  getPlatformConfig(
    baseUrlOverride?: string,
  ): Promise<PlatformServerConfigResponse> {
    return this.request<PlatformServerConfigResponse>(
      "/api/mobile/v1/platform/config",
      {
        method: "GET",
        skipAuthCheck: true,
        baseUrlOverride,
        timeoutMs: 8000,
      },
    );
  }

  async login(payload: AuthLoginPayload): Promise<AuthLoginResult> {
    const res = await this.request<AuthLoginResult>("/api/mobile/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuthCheck: true,
      timeoutMs: 25000,
    });

    if (!res || typeof res !== "object") {
      throw new ApiError(
        "Unable to sign in right now. Please try again in a moment.",
        502,
        { category: "server", retryable: true },
      );
    }

    if ("twoFactorRequired" in res && res.twoFactorRequired) {
      if (typeof res.challengeToken !== "string" || !res.challengeToken.trim()) {
        throw new ApiError(
          "Could not start two-factor verification. Please try signing in again.",
          502,
          { category: "server", retryable: true },
        );
      }
      return res;
    }

    if (
      !("token" in res) ||
      typeof res.token !== "string" ||
      !res.token.trim() ||
      !res.user
    ) {
      throw new ApiError(
        "Could not start your store session. Please try signing in again.",
        502,
        { category: "server", retryable: true },
      );
    }

    return res;
  }

  async verifyTwoFactor(payload: {
    challengeToken: string;
    code: string;
    deviceName?: string;
    deviceType?: string;
    operatingSystem?: string;
  }): Promise<AuthLoginResponse> {
    const res = await this.request<AuthLoginResponse>(
      "/api/mobile/v1/auth/2fa/verify",
      {
        method: "POST",
        body: JSON.stringify(payload),
        skipAuthCheck: true,
        timeoutMs: 25000,
      },
    );

    if (
      !res ||
      typeof res !== "object" ||
      typeof res.token !== "string" ||
      !res.token.trim() ||
      !res.user
    ) {
      throw new ApiError(
        "Verification succeeded, but your session could not be started. Please try again.",
        502,
        { category: "server", retryable: true },
      );
    }

    return res;
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
      timeoutMs: 20000,
    });
  }

  getMe(): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>("/api/mobile/v1/auth/me", {
      timeoutMs: 15000,
    });
  }

  async logout(): Promise<void> {
    await this.request<{ ok: boolean }>("/api/mobile/v1/auth/logout", {
      method: "POST",
      skipAuthCheck: true,
      timeoutMs: 10000,
    });
  }

  syncBootstrap(tokenOverride?: string): Promise<SyncBootstrapResponse> {
    return this.request<SyncBootstrapResponse>("/api/mobile/v1/sync/bootstrap", {
      tokenOverride,
      timeoutMs: 45000,
    });
  }

  syncDelta(cursor: number, tokenOverride?: string): Promise<SyncDeltaResponse> {
    return this.request<SyncDeltaResponse>(
      `/api/mobile/v1/sync/delta?cursor=${Math.max(0, Math.trunc(cursor || 0))}`,
      { tokenOverride, timeoutMs: 20000 },
    );
  }

  syncMerge(
    payload: SyncMergePayload,
    clientMutationId?: string,
    tokenOverride?: string,
  ): Promise<SyncMergeResponse> {
    return this.request<SyncMergeResponse>("/api/mobile/v1/sync/merge", {
      method: "POST",
      body: JSON.stringify(payload),
      clientMutationId,
      tokenOverride,
      timeoutMs: 45000,
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
      throw new ApiError(
        "No photo was selected. Please choose an image and try again.",
        400,
        { category: "validation", retryable: false },
      );
    }

    const meta = inferProductImageUploadMeta(trimmed, opts);
    const formData = new FormData();
    formData.append("folder", "products");

    if (Platform.OS === "web") {
      let blob: Blob;
      try {
        blob = opts?.webFile ?? (await (await fetch(trimmed)).blob());
      } catch (err) {
        logDevError("HttpApiClient.uploadWebBlob", err);
        throw new ApiError(
          "Could not read the selected image file. Please choose another photo.",
          400,
          { category: "validation", retryable: false },
        );
      }
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
      throw new ApiError(
        "Photo upload did not complete. Please try again.",
        502,
        { category: "server", retryable: true },
      );
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

  async getUnreadNotificationCount(tokenOverride?: string): Promise<number> {
    const res = await this.request<{ count: number }>(
      "/api/mobile/v1/notifications/unread-count",
      { tokenOverride },
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

  registerPushToken(payload: {
    token: string;
    platform: string;
    deviceName?: string;
  }): Promise<{ ok: boolean; registered: boolean; id: string; platform: string }> {
    return this.request<{
      ok: boolean;
      registered: boolean;
      id: string;
      platform: string;
    }>("/api/mobile/v1/notifications/push-token", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  unregisterPushToken(token?: string): Promise<{
    ok: boolean;
    unregistered: boolean;
    deactivatedCount: number;
  }> {
    return this.request<{
      ok: boolean;
      unregistered: boolean;
      deactivatedCount: number;
    }>("/api/mobile/v1/notifications/push-token", {
      method: "DELETE",
      body: JSON.stringify(token ? { token } : {}),
      skipAuthCheck: true,
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

  getTwoFactorOverview(): Promise<TwoFactorOverviewResponse> {
    return this.request<TwoFactorOverviewResponse>(
      "/api/mobile/v1/security/two-factor",
    );
  }

  updateUserTwoFactor(
    input: UpdateTwoFactorInput,
  ): Promise<StaffTwoFactorAccount> {
    return this.request<StaffTwoFactorAccount>(
      "/api/mobile/v1/security/two-factor",
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  bulkUpdateStaffTwoFactor(
    input: BulkUpdateTwoFactorInput,
  ): Promise<{ updatedCount: number; skippedUsernames: string[] }> {
    return this.request<{ updatedCount: number; skippedUsernames: string[] }>(
      "/api/mobile/v1/security/two-factor/bulk",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  getStoreSettings(): Promise<StoreProfile> {
    return this.request<StoreProfile>("/api/mobile/v1/settings");
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

  updateNotificationSettings(
    input: UpdateNotificationSettingsInput,
  ): Promise<StoreProfile> {
    return this.request<StoreProfile>(
      "/api/mobile/v1/settings/notifications",
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  updateBusinessHours(input: UpdateBusinessHoursInput): Promise<StoreProfile> {
    return this.request<StoreProfile>("/api/mobile/v1/settings/hours", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  sendDailyReportNow(dateStr?: string): Promise<SendDailyReportResult> {
    return this.request<SendDailyReportResult>(
      "/api/mobile/v1/reports/daily/send",
      {
        method: "POST",
        body: JSON.stringify(dateStr ? { dateStr } : {}),
      },
    );
  }
}
