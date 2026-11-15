import type { InventoryProApiClient } from "./client";
import {
  DEMO_PRODUCTS,
  DEMO_SALES,
  DEMO_STORE_PROFILE,
  DEMO_YESTERDAY_REVENUE,
  type DemoSaleSeed,
} from "./demoData";
import {
  LOW_STOCK_THRESHOLD,
  type BulkImportProductsResult,
  type CreateProductInput,
  type ProductDetailResponse,
  type ProductItem,
  type ProductQueryParams,
  type ProductSaleRecord,
  type SaleReceiptDetail,
  type SalesQueryParams,
  type SaleTransactionSummary,
  type StockAlertItem,
  type TodayDashboardData,
} from "@/types/domain";

function computeSaleTotals(seed: DemoSaleSeed) {
  const subtotal = seed.items.reduce((sum, item) => sum + item.subtotal, 0);
  const taxableBase = Math.max(0, subtotal - seed.discountAmount);
  const taxAmount = Number((taxableBase * seed.taxRate).toFixed(2));
  const totalAmount = Number((taxableBase + taxAmount).toFixed(2));
  return { subtotal, taxAmount, totalAmount };
}

function toTransactionSummary(seed: DemoSaleSeed): SaleTransactionSummary {
  const { taxAmount, totalAmount } = computeSaleTotals(seed);
  return {
    id: seed.id,
    receiptNo: seed.receiptNo,
    customerName: seed.customerName,
    customerPhone: seed.customerPhone,
    cashierName: seed.cashierName,
    saleDate: seed.saleDate,
    totalAmount,
    amountPaid: seed.status === "refunded" ? 0 : totalAmount,
    discount: seed.discountAmount,
    tax: taxAmount,
    paymentMode: seed.paymentMode,
    status: seed.status,
    itemCount: seed.items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

/**
 * Explicit read-only Phase 1 demo adapter.
 * Mimics async network behavior while returning curated sample POS data.
 */
export class DemoDataAdapter implements InventoryProApiClient {
  readonly adapterName = "DemoDataAdapter (Phase 1 Sample Data)";
  readonly isDemo = true;

  private async simulateLatency(ms = 120): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getTodayDashboard(): Promise<TodayDashboardData> {
    await this.simulateLatency();

    const completedSales = DEMO_SALES.filter((s) => s.status === "completed");
    const todayRevenue = completedSales.reduce(
      (sum, sale) => sum + computeSaleTotals(sale).totalAmount,
      0,
    );
    const todayOrders = completedSales.length;
    const todayAov = todayOrders > 0 ? todayRevenue / todayOrders : 0;

    const todayVsYesterdayRevenueDelta =
      DEMO_YESTERDAY_REVENUE > 0
        ? ((todayRevenue - DEMO_YESTERDAY_REVENUE) / DEMO_YESTERDAY_REVENUE) * 100
        : 0;

    const totalInventoryValuation = DEMO_PRODUCTS.reduce(
      (sum, p) => sum + p.stockQuantity * p.unitPrice,
      0,
    );
    const totalStockUnits = DEMO_PRODUCTS.reduce((sum, p) => sum + p.stockQuantity, 0);

    const lowOrOutProducts = DEMO_PRODUCTS.filter(
      (p) => p.active && p.stockQuantity < LOW_STOCK_THRESHOLD,
    ).sort((a, b) => a.stockQuantity - b.stockQuantity || a.name.localeCompare(b.name));

    const outOfStockCount = lowOrOutProducts.filter((p) => p.stockQuantity <= 0).length;
    const lowStockCount = lowOrOutProducts.length - outOfStockCount;

    const lowStockAlerts: StockAlertItem[] = lowOrOutProducts.map((p) => ({
      id: p.id,
      name: p.name,
      categoryName: p.categoryName,
      barcode: p.barcode,
      stock: p.stockQuantity,
      threshold: p.lowStockThreshold,
      costPrice: p.costPrice,
      sellingPrice: p.unitPrice,
      severity: p.stockQuantity <= 0 ? "critical" : "warning",
    }));

    return {
      kpis: {
        todayRevenue: Number(todayRevenue.toFixed(2)),
        todayOrders,
        todayAov: Number(todayAov.toFixed(2)),
        yesterdayRevenue: DEMO_YESTERDAY_REVENUE,
        todayVsYesterdayRevenueDelta: Number(todayVsYesterdayRevenueDelta.toFixed(1)),
        totalInventoryValuation: Number(totalInventoryValuation.toFixed(2)),
        totalProductsCount: DEMO_PRODUCTS.length,
        totalStockUnits,
        outOfStockCount,
        lowStockCount,
        lastSyncedAt: new Date().toISOString(),
      },
      lowStockAlerts,
    };
  }

  async getCategories(): Promise<string[]> {
    await this.simulateLatency(40);
    const unique = new Set(DEMO_PRODUCTS.map((p) => p.categoryName));
    return ["All", ...Array.from(unique).sort()];
  }

  async getProducts(params?: ProductQueryParams): Promise<ProductItem[]> {
    await this.simulateLatency(80);
    const q = params?.query?.trim().toLowerCase() ?? "";
    const category = params?.category;
    const stockStatus = params?.stockStatus ?? "all";

    return DEMO_PRODUCTS.filter((product) => {
      const matchesQuery =
        q === "" ||
        product.name.toLowerCase().includes(q) ||
        product.categoryName.toLowerCase().includes(q) ||
        product.barcode.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q);

      const matchesCategory =
        !category || category === "All" || product.categoryName === category;

      let matchesStock = true;
      if (stockStatus === "out_of_stock") {
        matchesStock = product.stockQuantity <= 0;
      } else if (stockStatus === "low_stock") {
        matchesStock =
          product.stockQuantity > 0 && product.stockQuantity < LOW_STOCK_THRESHOLD;
      } else if (stockStatus === "in_stock") {
        matchesStock = product.stockQuantity >= LOW_STOCK_THRESHOLD;
      }

      return matchesQuery && matchesCategory && matchesStock;
    });
  }

  async getProductById(productId: string): Promise<ProductDetailResponse | null> {
    await this.simulateLatency(70);
    const product = DEMO_PRODUCTS.find((p) => p.id === productId);
    if (!product) return null;

    const recentSales: ProductSaleRecord[] = [];
    for (const sale of DEMO_SALES) {
      for (const item of sale.items) {
        if (item.productId === productId) {
          recentSales.push({
            id: item.id,
            saleId: sale.id,
            receiptNo: sale.receiptNo,
            customerName: sale.customerName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            saleDate: sale.saleDate,
            paymentMode: sale.paymentMode,
          });
        }
      }
    }

    return { product, recentSales };
  }

  async lookupProductByBarcode(barcode: string): Promise<ProductItem | null> {
    await this.simulateLatency(90);
    const normalized = barcode.trim().toLowerCase();
    if (!normalized) return null;
    return (
      DEMO_PRODUCTS.find((p) => p.barcode.trim().toLowerCase() === normalized) ?? null
    );
  }

  async getRecentSales(params?: SalesQueryParams): Promise<SaleTransactionSummary[]> {
    await this.simulateLatency(80);
    const q = params?.query?.trim().toLowerCase() ?? "";
    const paymentMode = params?.paymentMode ?? "all";

    return DEMO_SALES.map(toTransactionSummary).filter((tx) => {
      const matchesQuery =
        q === "" ||
        tx.receiptNo.toLowerCase().includes(q) ||
        tx.customerName.toLowerCase().includes(q) ||
        tx.cashierName.toLowerCase().includes(q);

      const matchesPayment =
        paymentMode === "all" || tx.paymentMode === paymentMode;

      return matchesQuery && matchesPayment;
    });
  }

  async getSaleReceiptById(saleId: string): Promise<SaleReceiptDetail | null> {
    await this.simulateLatency(70);
    const seed = DEMO_SALES.find((s) => s.id === saleId);
    if (!seed) return null;

    const { subtotal, taxAmount, totalAmount } = computeSaleTotals(seed);

    return {
      id: seed.id,
      receiptNo: seed.receiptNo,
      customerName: seed.customerName,
      customerPhone: seed.customerPhone,
      saleDate: seed.saleDate,
      subtotal,
      taxRate: seed.taxRate,
      taxAmount,
      discountAmount: seed.discountAmount,
      totalAmount,
      amountPaid: seed.status === "refunded" ? 0 : totalAmount,
      paymentMode: seed.paymentMode,
      status: seed.status,
      attendantName: seed.cashierName,
      storeName: DEMO_STORE_PROFILE.storeName,
      storeAddress: DEMO_STORE_PROFILE.storeAddress,
      storePhone: DEMO_STORE_PROFILE.storePhone,
      storeEmail: DEMO_STORE_PROFILE.storeEmail,
      currency: DEMO_STORE_PROFILE.currency,
      items: seed.items,
    };
  }

  async createProduct(_input: CreateProductInput): Promise<ProductItem> {
    throw new Error("Adding products requires the on-device SQLite backend.");
  }

  async bulkCreateProducts(
    _items: CreateProductInput[],
  ): Promise<BulkImportProductsResult> {
    throw new Error("Importing products requires the on-device SQLite backend.");
  }

  async adjustProductStock(): Promise<ProductItem> {
    throw new Error("Stock adjustments require the live SQLite Expo API backend.");
  }

  async createSale(): Promise<SaleReceiptDetail> {
    throw new Error("Recording sales requires the live SQLite Expo API backend.");
  }
}

export const demoDataAdapter = new DemoDataAdapter();
