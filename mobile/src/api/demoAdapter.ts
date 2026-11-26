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
  type AuditLogItem,
  type AuditLogsQueryParams,
  type BroadcastMessageItem,
  type BroadcastRecipient,
  type BroadcastRecipientGroup,
  type BulkImportProductsResult,
  type BulkUpdateTwoFactorInput,
  type CategoryItem,
  type ChangePasswordInput,
  type CreateCategoryInput,
  type CreateCustomerInput,
  type CreateEmployeeInput,
  type CreateProductInput,
  type CreateRestockInput,
  type CreateSupplierInput,
  type CreateSupplierTransactionInput,
  type CustomerDetailResponse,
  type CustomerItem,
  type DailyReportData,
  type EmployeeDetailResponse,
  type EmployeeItem,
  type NotificationItem,
  type NotificationsQueryParams,
  type PaySupplierBalanceInput,
  type PaymentBreakdownItem,
  type PaymentMode,
  type ProductDetailResponse,
  type ProductItem,
  type ProductQueryParams,
  type ProductSaleRecord,
  type RefundSaleInput,
  type RestockLogItem,
  type RestockQueryParams,
  type SaleReceiptDetail,
  type SalesDateRange,
  type SalesQueryParams,
  type SalesReportData,
  type SaleTransactionSummary,
  type SendBroadcastInput,
  type SendDailyReportResult,
  type SessionUser,
  type StaffTwoFactorAccount,
  type StockAlertItem,
  type StoreProfile,
  type SupplierDetailResponse,
  type SupplierItem,
  type SupplierTransactionSummary,
  type TodayDashboardData,
  type TopSellingProductItem,
  type TwoFactorOverviewResponse,
  type UpdateBusinessHoursInput,
  type UpdateBusinessSettingsInput,
  type UpdateCategoryInput,
  type UpdateCustomerInput,
  type UpdateEmployeeInput,
  type UpdateMyProfileInput,
  type UpdateNotificationSettingsInput,
  type UpdateProductInput,
  type UpdateSupplierInput,
  type UpdateTwoFactorInput,
  type UserSessionItem,
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

  async getCategoryDetails(query?: string): Promise<CategoryItem[]> {
    await this.simulateLatency(60);
    const q = query?.trim().toLowerCase() ?? "";
    const map = new Map<string, CategoryItem>();
    for (const p of DEMO_PRODUCTS) {
      const existing = map.get(p.categoryId);
      if (existing) {
        existing.productCount += 1;
        existing.totalUnits += p.stockQuantity;
      } else {
        map.set(p.categoryId, {
          id: p.categoryId,
          name: p.categoryName,
          description: "Sample category",
          isActive: true,
          productCount: 1,
          totalUnits: p.stockQuantity,
          updatedAt: p.updatedAt,
        });
      }
    }
    return Array.from(map.values())
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCategory(_input: CreateCategoryInput): Promise<CategoryItem> {
    throw new Error("Creating categories requires the on-device SQLite backend.");
  }

  async updateCategory(
    _categoryId: string,
    _input: UpdateCategoryInput,
  ): Promise<CategoryItem> {
    throw new Error("Updating categories requires the on-device SQLite backend.");
  }

  async getProducts(params?: ProductQueryParams): Promise<ProductItem[]> {
    await this.simulateLatency(80);
    const q = params?.query?.trim().toLowerCase() ?? "";
    const category = params?.category;
    const stockStatus = params?.stockStatus ?? "all";
    const threshold =
      typeof params?.threshold === "number" && params.threshold >= 1
        ? Math.trunc(params.threshold)
        : LOW_STOCK_THRESHOLD;

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
          product.stockQuantity > 0 && product.stockQuantity < threshold;
      } else if (stockStatus === "in_stock") {
        matchesStock = product.stockQuantity >= threshold;
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
    const status = params?.status ?? "all";

    return DEMO_SALES.map(toTransactionSummary).filter((tx) => {
      const matchesQuery =
        q === "" ||
        tx.receiptNo.toLowerCase().includes(q) ||
        tx.customerName.toLowerCase().includes(q) ||
        tx.cashierName.toLowerCase().includes(q);

      const matchesPayment =
        paymentMode === "all" || tx.paymentMode === paymentMode;

      const matchesStatus = status === "all" || tx.status === status;

      return matchesQuery && matchesPayment && matchesStatus;
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

  async updateProduct(
    _productId: string,
    _input: UpdateProductInput,
  ): Promise<ProductItem> {
    throw new Error("Editing products requires the on-device SQLite backend.");
  }

  async bulkCreateProducts(
    _items: CreateProductInput[],
  ): Promise<BulkImportProductsResult> {
    throw new Error("Importing products requires the on-device SQLite backend.");
  }

  async adjustProductStock(): Promise<ProductItem> {
    throw new Error("Stock adjustments require the live SQLite Expo API backend.");
  }

  async getRestockLogs(_params?: RestockQueryParams): Promise<RestockLogItem[]> {
    await this.simulateLatency(60);
    return [];
  }

  async recordRestock(_input: CreateRestockInput): Promise<RestockLogItem> {
    throw new Error("Recording restocks requires the on-device SQLite backend.");
  }

  async createSale(): Promise<SaleReceiptDetail> {
    throw new Error("Recording sales requires the live SQLite Expo API backend.");
  }

  async refundSale(
    _saleId: string,
    _input?: RefundSaleInput,
  ): Promise<SaleReceiptDetail> {
    throw new Error("Processing refunds requires the on-device SQLite backend.");
  }

  async getSalesReport(dateRange: SalesDateRange = "30d"): Promise<SalesReportData> {
    await this.simulateLatency(80);
    const completed = DEMO_SALES.filter((s) => s.status === "completed");
    const refunded = DEMO_SALES.filter((s) => s.status === "refunded");

    const grossRevenue = completed.reduce(
      (sum, s) => sum + computeSaleTotals(s).totalAmount,
      0,
    );
    const refundedAmount = refunded.reduce(
      (sum, s) => sum + computeSaleTotals(s).totalAmount,
      0,
    );
    const totalDiscount = completed.reduce((sum, s) => sum + s.discountAmount, 0);
    const totalTax = completed.reduce(
      (sum, s) => sum + computeSaleTotals(s).taxAmount,
      0,
    );
    const modes: PaymentMode[] = ["cash", "momo", "bank", "cheque"];
    const paymentBreakdown: PaymentBreakdownItem[] = modes.map((mode) => {
      const matching = completed.filter((s) => s.paymentMode === mode);
      const amount = matching.reduce(
        (sum, s) => sum + computeSaleTotals(s).totalAmount,
        0,
      );
      return {
        paymentMode: mode,
        count: matching.length,
        amount: Number(amount.toFixed(2)),
        sharePercent:
          grossRevenue > 0 ? Number(((amount / grossRevenue) * 100).toFixed(1)) : 0,
      };
    });

    const productMap = new Map<string, TopSellingProductItem>();
    let totalUnitsSold = 0;
    let estimatedCost = 0;
    for (const s of completed) {
      for (const item of s.items) {
        totalUnitsSold += item.quantity;
        const catalogProduct = DEMO_PRODUCTS.find((p) => p.id === item.productId);
        estimatedCost += item.quantity * (catalogProduct?.costPrice ?? item.unitPrice * 0.7);
        const cur = productMap.get(item.productId);
        if (cur) {
          cur.unitsSold += item.quantity;
          cur.revenue = Number((cur.revenue + item.subtotal).toFixed(2));
        } else {
          productMap.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            unitsSold: item.quantity,
            revenue: Number(item.subtotal.toFixed(2)),
          });
        }
      }
    }

    const netBeforeTax = Math.max(0, grossRevenue - totalTax);
    const grossProfit = netBeforeTax - estimatedCost;

    return {
      dateRange,
      currency: DEMO_STORE_PROFILE.currency,
      completedCount: completed.length,
      refundedCount: refunded.length,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      refundedAmount: Number(refundedAmount.toFixed(2)),
      totalDiscount: Number(totalDiscount.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      estimatedCost: Number(estimatedCost.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      profitMarginPercent:
        netBeforeTax > 0 ? Number(((grossProfit / netBeforeTax) * 100).toFixed(1)) : 0,
      averageOrderValue:
        completed.length > 0
          ? Number((grossRevenue / completed.length).toFixed(2))
          : 0,
      totalUnitsSold,
      paymentBreakdown,
      topProducts: Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    };
  }

  async getCustomers(query?: string): Promise<CustomerItem[]> {
    await this.simulateLatency(60);
    const q = query?.trim().toLowerCase() ?? "";
    const byName = new Map<string, CustomerItem>();
    for (const s of DEMO_SALES) {
      const { totalAmount } = computeSaleTotals(s);
      const existing = byName.get(s.customerName);
      if (existing) {
        if (s.status === "completed") {
          existing.orderCount += 1;
          existing.totalSpent = Number((existing.totalSpent + totalAmount).toFixed(2));
        }
      } else {
        byName.set(s.customerName, {
          id: `demo-cust-${byName.size + 1}`,
          name: s.customerName,
          phonenumber: s.customerPhone,
          orderCount: s.status === "completed" ? 1 : 0,
          totalSpent: s.status === "completed" ? Number(totalAmount.toFixed(2)) : 0,
          lastOrderAt: s.saleDate,
          createdAt: s.saleDate,
          updatedAt: s.saleDate,
        });
      }
    }
    return Array.from(byName.values()).filter(
      (c) => !q || c.name.toLowerCase().includes(q),
    );
  }

  async getCustomerById(customerId: string): Promise<CustomerDetailResponse | null> {
    const list = await this.getCustomers();
    const customer = list.find((c) => c.id === customerId);
    if (!customer) return null;
    const recentSales = DEMO_SALES.filter(
      (s) => s.customerName === customer.name,
    ).map(toTransactionSummary);
    return { customer, recentSales };
  }

  async createCustomer(_input: CreateCustomerInput): Promise<CustomerItem> {
    throw new Error("Managing customers requires the on-device SQLite backend.");
  }

  async updateCustomer(
    _customerId: string,
    _input: UpdateCustomerInput,
  ): Promise<CustomerItem> {
    throw new Error("Managing customers requires the on-device SQLite backend.");
  }

  async getSuppliers(_query?: string): Promise<SupplierItem[]> {
    await this.simulateLatency(60);
    return [];
  }

  async getSupplierById(_supplierId: string): Promise<SupplierDetailResponse | null> {
    await this.simulateLatency(60);
    return null;
  }

  async createSupplier(_input: CreateSupplierInput): Promise<SupplierItem> {
    throw new Error("Managing suppliers requires the on-device SQLite backend.");
  }

  async updateSupplier(
    _supplierId: string,
    _input: UpdateSupplierInput,
  ): Promise<SupplierItem> {
    throw new Error("Managing suppliers requires the on-device SQLite backend.");
  }

  async recordSupplierTransaction(
    _input: CreateSupplierTransactionInput,
  ): Promise<SupplierTransactionSummary> {
    throw new Error(
      "Recording supplier deliveries requires the on-device SQLite backend.",
    );
  }

  async paySupplierTransactionBalance(
    _input: PaySupplierBalanceInput,
  ): Promise<SupplierTransactionSummary> {
    throw new Error(
      "Recording supplier payments requires the on-device SQLite backend.",
    );
  }

  async getEmployees(_query?: string): Promise<EmployeeItem[]> {
    await this.simulateLatency(60);
    return [];
  }

  async getEmployeeById(
    _employeeId: string,
  ): Promise<EmployeeDetailResponse | null> {
    await this.simulateLatency(60);
    return null;
  }

  async createEmployee(_input: CreateEmployeeInput): Promise<EmployeeItem> {
    throw new Error("Managing employees requires the on-device SQLite backend.");
  }

  async updateEmployee(
    _employeeId: string,
    _input: UpdateEmployeeInput,
  ): Promise<EmployeeItem> {
    throw new Error("Managing employees requires the on-device SQLite backend.");
  }

  async getDailyReport(date?: string): Promise<DailyReportData> {
    const report = await this.getSalesReport("today");
    return {
      date: date || new Date().toISOString().slice(0, 10),
      currency: report.currency,
      storeName: DEMO_STORE_PROFILE.storeName,
      totalTransactions: report.completedCount + report.refundedCount,
      completedCount: report.completedCount,
      refundedCount: report.refundedCount,
      grossRevenue: report.grossRevenue,
      refundedAmount: report.refundedAmount,
      totalDiscount: report.totalDiscount,
      totalTax: report.totalTax,
      estimatedCost: report.estimatedCost,
      grossProfit: report.grossProfit,
      profitMarginPercent: report.profitMarginPercent,
      averageOrderValue: report.averageOrderValue,
      totalUnitsSold: report.totalUnitsSold,
      paymentBreakdown: report.paymentBreakdown,
      topProducts: report.topProducts,
      cashierBreakdown: [],
    };
  }

  async getAuditLogs(_params?: AuditLogsQueryParams): Promise<AuditLogItem[]> {
    await this.simulateLatency(60);
    return [];
  }

  async getNotifications(
    _params?: NotificationsQueryParams,
  ): Promise<NotificationItem[]> {
    await this.simulateLatency(40);
    return [];
  }

  async getUnreadNotificationCount(): Promise<number> {
    await this.simulateLatency(20);
    return 0;
  }

  async markNotificationRead(_notificationId: string): Promise<NotificationItem> {
    throw new Error("Managing notifications requires the on-device SQLite backend.");
  }

  async markAllNotificationsRead(): Promise<{ updatedCount: number }> {
    return { updatedCount: 0 };
  }

  async deleteNotification(_notificationId: string): Promise<void> {
    throw new Error("Managing notifications requires the on-device SQLite backend.");
  }

  async clearAllNotifications(): Promise<{ deletedCount: number }> {
    return { deletedCount: 0 };
  }

  async getBroadcastRecipients(
    _group: BroadcastRecipientGroup,
  ): Promise<BroadcastRecipient[]> {
    await this.simulateLatency(40);
    return [];
  }

  async getBroadcastMessages(): Promise<BroadcastMessageItem[]> {
    await this.simulateLatency(40);
    return [];
  }

  async sendBroadcastMessage(
    _input: SendBroadcastInput,
  ): Promise<BroadcastMessageItem> {
    throw new Error("Sending broadcasts requires the on-device SQLite backend.");
  }

  async getUserSessions(): Promise<UserSessionItem[]> {
    await this.simulateLatency(40);
    return [];
  }

  async revokeUserSession(_sessionId: string): Promise<void> {
    throw new Error("Managing sessions requires the on-device SQLite backend.");
  }

  async revokeOtherUserSessions(): Promise<{ revokedCount: number }> {
    return { revokedCount: 0 };
  }

  async updateMyProfile(_input: UpdateMyProfileInput): Promise<SessionUser> {
    throw new Error("Updating your profile requires the on-device SQLite backend.");
  }

  async changeMyPassword(_input: ChangePasswordInput): Promise<void> {
    throw new Error("Changing password requires the on-device SQLite backend.");
  }

  async getTwoFactorOverview(): Promise<TwoFactorOverviewResponse> {
    await this.simulateLatency(40);
    const demoSelf: StaffTwoFactorAccount = {
      id: "demo-admin",
      username: "admin",
      email: DEMO_STORE_PROFILE.storeEmail,
      firstname: "Demo",
      lastname: "Admin",
      fullname: "Demo Admin",
      phonenumber: DEMO_STORE_PROFILE.storePhone,
      role: "admin",
      twoFactorEnabled: false,
      twoFactorMethod: "email",
      twoFactorUpdatedAt: null,
      lastLoginAt: null,
      isCurrentUser: true,
    };
    return {
      currentUserAccount: demoSelf,
      accounts: [demoSelf],
      emailConfigured: false,
      smsConfigured: false,
    };
  }

  async updateUserTwoFactor(
    _input: UpdateTwoFactorInput,
  ): Promise<StaffTwoFactorAccount> {
    throw new Error("Managing 2FA requires a local SQLite or Cloud Synced workspace.");
  }

  async bulkUpdateStaffTwoFactor(
    _input: BulkUpdateTwoFactorInput,
  ): Promise<{ updatedCount: number; skippedUsernames: string[] }> {
    throw new Error("Managing 2FA requires a local SQLite or Cloud Synced workspace.");
  }

  async getStoreSettings(): Promise<StoreProfile> {
    await this.simulateLatency(40);
    return { ...DEMO_STORE_PROFILE };
  }

  async updateStockAlertThreshold(threshold: number): Promise<StoreProfile> {
    return {
      ...DEMO_STORE_PROFILE,
      stockAlertThreshold: Math.max(1, Math.trunc(threshold)),
    };
  }

  async updateBusinessSettings(
    input: UpdateBusinessSettingsInput,
  ): Promise<StoreProfile> {
    return {
      ...DEMO_STORE_PROFILE,
      storeName: input.storeName.trim() || DEMO_STORE_PROFILE.storeName,
      storeAddress: input.storeAddress.trim() || DEMO_STORE_PROFILE.storeAddress,
      storePhone: input.storePhone.trim(),
      storeEmail: input.storeEmail.trim(),
      currency: input.currency?.trim() || DEMO_STORE_PROFILE.currency,
      taxRate: Number(input.taxRate) || 0,
      stockAlertThreshold:
        input.stockAlertThreshold !== undefined
          ? Math.max(1, Math.trunc(input.stockAlertThreshold))
          : DEMO_STORE_PROFILE.stockAlertThreshold,
      printAfterSale: input.printAfterSale ?? DEMO_STORE_PROFILE.printAfterSale,
      paperSize: input.paperSize ?? DEMO_STORE_PROFILE.paperSize,
    };
  }

  async updateNotificationSettings(
    input: UpdateNotificationSettingsInput,
  ): Promise<StoreProfile> {
    const enabled =
      input.memberSaleAlertEnabled ?? DEMO_STORE_PROFILE.memberSaleAlertEnabled;
    const channels =
      input.memberSaleAlertChannels ??
      DEMO_STORE_PROFILE.memberSaleAlertChannels ??
      ["in_app"];
    if (enabled && channels.length === 0) {
      throw new Error(
        "Select at least one channel (In-App, Email, or SMS) for member sale alerts.",
      );
    }
    return {
      ...DEMO_STORE_PROFILE,
      ...input,
      memberSaleAlertEnabled: enabled,
      memberSaleAlertChannels:
        channels.length > 0 ? Array.from(new Set(channels)) : ["in_app"],
    };
  }

  async updateBusinessHours(
    input: UpdateBusinessHoursInput,
  ): Promise<StoreProfile> {
    return {
      ...DEMO_STORE_PROFILE,
      ...input,
    };
  }

  async sendDailyReportNow(_dateStr?: string): Promise<SendDailyReportResult> {
    throw new Error("Sending daily EOD reports requires a synced Cloud Workspace connection.");
  }
}

export const demoDataAdapter = new DemoDataAdapter();
