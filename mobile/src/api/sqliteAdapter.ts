import { Platform } from "react-native";
import type { InventoryProApiClient } from "./client";
import { ensureDbReady } from "@/db/client";
import {
  adjustProductStock as dbAdjustProductStock,
  authenticateWithCredentials,
  bulkCreateProducts as dbBulkCreateProducts,
  createProduct as dbCreateProduct,
  createSale as dbCreateSale,
  findProductByBarcode as dbFindProductByBarcode,
  getProductDetail as dbGetProductDetail,
  getSaleReceipt as dbGetSaleReceipt,
  getTodayDashboard as dbGetTodayDashboard,
  listCategories as dbListCategories,
  listProducts as dbListProducts,
  listSales as dbListSales,
  restoreSessionByToken,
  revokeSessionByToken,
} from "@/db/queries";
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

export interface AuthenticatedApiClient extends InventoryProApiClient {
  login(payload: AuthLoginPayload): Promise<AuthLoginResponse>;
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
}
