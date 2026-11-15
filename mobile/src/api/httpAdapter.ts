import Constants from "expo-constants";
import { Platform } from "react-native";
import type { AuthenticatedApiClient } from "./sqliteAdapter";
import type {
  AdjustStockInput,
  AuthLoginPayload,
  AuthLoginResponse,
  AuthSessionResponse,
  BulkImportProductsResult,
  CreateProductInput,
  CreateSaleInput,
  ProductDetailResponse,
  ProductItem,
  ProductQueryParams,
  SaleReceiptDetail,
  SalesQueryParams,
  SaleTransactionSummary,
  TodayDashboardData,
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
  getAccessToken: () => string | null;
  onUnauthorized?: () => void;
}

/**
 * Optional external HTTP client for connecting to a remote InventoryPro backend
 * when `EXPO_PUBLIC_API_BASE_URL` is configured.
 */
export class HttpApiClient implements AuthenticatedApiClient {
  readonly adapterName = "Remote HTTP API";
  readonly isDemo = false;

  private readonly baseUrl: string;

  constructor(private readonly config: HttpApiClientConfig) {
    this.baseUrl = (config.baseUrl ?? resolveApiBaseUrl()).replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { allowNotFound?: boolean; skipAuthCheck?: boolean },
  ): Promise<T> {
    const token = this.config.getAccessToken();
    const { allowNotFound, skipAuthCheck, ...fetchInit } = init ?? {};

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(fetchInit.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((fetchInit.headers as Record<string, string> | undefined) ?? {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
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

  login(payload: AuthLoginPayload): Promise<AuthLoginResponse> {
    return this.request<AuthLoginResponse>("/api/mobile/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
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

  getTodayDashboard(): Promise<TodayDashboardData> {
    return this.request<TodayDashboardData>("/api/mobile/v1/dashboard/today");
  }

  getCategories(): Promise<string[]> {
    return this.request<string[]>("/api/mobile/v1/categories");
  }

  getProducts(params?: ProductQueryParams): Promise<ProductItem[]> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set("q", params.query);
    if (params?.category && params.category !== "All") qs.set("category", params.category);
    if (params?.stockStatus && params.stockStatus !== "all") {
      qs.set("stock", params.stockStatus);
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

  createProduct(input: CreateProductInput): Promise<ProductItem> {
    return this.request<ProductItem>("/api/mobile/v1/products", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  bulkCreateProducts(
    items: CreateProductInput[],
  ): Promise<BulkImportProductsResult> {
    return this.request<BulkImportProductsResult>("/api/mobile/v1/products/bulk", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  }

  adjustProductStock(
    productId: string,
    input: AdjustStockInput,
  ): Promise<ProductItem> {
    return this.request<ProductItem>(
      `/api/mobile/v1/products/${encodeURIComponent(productId)}/stock`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  lookupProductByBarcode(barcode: string): Promise<ProductItem | null> {
    return this.request<ProductItem | null>(
      `/api/mobile/v1/products/barcode/${encodeURIComponent(barcode.trim())}`,
      { allowNotFound: true },
    );
  }

  getRecentSales(params?: SalesQueryParams): Promise<SaleTransactionSummary[]> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set("q", params.query);
    if (params?.paymentMode && params.paymentMode !== "all") {
      qs.set("paymentMode", params.paymentMode);
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

  createSale(input: CreateSaleInput): Promise<SaleReceiptDetail> {
    return this.request<SaleReceiptDetail>("/api/mobile/v1/sales", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
