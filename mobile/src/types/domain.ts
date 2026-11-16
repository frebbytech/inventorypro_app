/**
 * Domain models mapped directly from the InventoryPro Next.js POS repository:
 * - src/types/globals.ts (ProductCatalogView, SaleSummaryView, SaleItemsDetailView)
 * - src/actions/dashboard.ts (AdminKpiMetrics, AdminDetailedStockAlert, AdminDetailedTransaction)
 * - src/types/receipt.ts (ReceiptOrder, ReceiptItem)
 * - src/lib/auth.ts (SessionUser, StoreProfile)
 */

export type PaymentMode = "cash" | "momo" | "bank" | "cheque";
export type SaleStatus = "completed" | "pending" | "failed" | "refunded";
export type StockStatusFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export const LOW_STOCK_THRESHOLD = 5;

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  role: "admin" | "member";
  lastLoginAt?: string | null;
}

export interface StoreProfile {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  currency: string;
  taxRate: number;
  stockAlertThreshold: number;
}

export interface UpdateBusinessSettingsInput {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  currency?: string;
  taxRate: number;
}

export interface AuthLoginPayload {
  identifier: string;
  password: string;
  deviceName?: string;
}

export interface AuthLoginResponse {
  token: string;
  expiresAt: string;
  user: SessionUser;
  store: StoreProfile;
}

export interface AuthSessionResponse {
  user: SessionUser;
  store: StoreProfile;
}

export interface AdjustStockInput {
  delta?: number;
  setQuantity?: number;
  reason?: string;
}

export interface CreateSaleItemInput {
  productId: string;
  quantity: number;
}

export interface CreateSaleInput {
  customerName?: string;
  customerPhone?: string;
  paymentMode: PaymentMode;
  discountAmount?: number;
  applyTax?: boolean;
  notes?: string;
  items: CreateSaleItemInput[];
}

export interface CreateProductInput {
  name: string;
  categoryName: string;
  barcode?: string;
  description?: string;
  costPrice: number;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold?: number;
  active?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  categoryName?: string;
  barcode?: string;
  description?: string;
  costPrice?: number;
  unitPrice?: number;
  lowStockThreshold?: number;
  active?: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  productCount: number;
  totalUnits: number;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface RestockLogItem {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  quantity: number;
  restockDate: string;
  notes: string;
  userName: string;
  createdAt: string;
}

export interface RestockQueryParams {
  query?: string;
  productId?: string;
  limit?: number;
}

export interface CreateRestockInput {
  productId: string;
  quantity: number;
  restockDate?: string;
  notes?: string;
}

export interface BulkImportProductsResult {
  createdCount: number;
  newCategoriesCount: number;
  products: ProductItem[];
}

export interface ProductItem {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  barcode: string;
  costPrice: number;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockValue: number;
  active: boolean;
  updatedAt: string;
}

export interface ProductSaleRecord {
  id: string;
  saleId: string;
  receiptNo: string;
  customerName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  saleDate: string;
  paymentMode: PaymentMode;
}

export interface ProductDetailResponse {
  product: ProductItem;
  recentSales: ProductSaleRecord[];
}

export interface StockAlertItem {
  id: string;
  name: string;
  categoryName: string;
  barcode: string;
  stock: number;
  threshold: number;
  costPrice: number;
  sellingPrice: number;
  severity: "critical" | "warning" | "healthy";
}

export interface TodayKpiSummary {
  todayRevenue: number;
  todayOrders: number;
  todayAov: number;
  yesterdayRevenue: number;
  todayVsYesterdayRevenueDelta: number;
  totalInventoryValuation: number;
  totalProductsCount: number;
  totalStockUnits: number;
  outOfStockCount: number;
  lowStockCount: number;
  lastSyncedAt: string;
}

export interface TodayDashboardData {
  kpis: TodayKpiSummary;
  lowStockAlerts: StockAlertItem[];
}

export interface SaleTransactionSummary {
  id: string;
  receiptNo: string;
  customerName: string;
  customerPhone?: string;
  cashierName: string;
  saleDate: string;
  totalAmount: number;
  amountPaid: number;
  discount: number;
  tax: number;
  paymentMode: PaymentMode;
  status: SaleStatus;
  itemCount: number;
}

export interface ReceiptLineItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SaleReceiptDetail {
  id: string;
  receiptNo: string;
  customerName: string;
  customerPhone?: string;
  saleDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  paymentMode: PaymentMode;
  status: SaleStatus;
  attendantName: string;
  notes?: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  currency: string;
  items: ReceiptLineItem[];
}

export interface RefundSaleInput {
  reason?: string;
  restockItems?: boolean;
}

export type SalesDateRange = "today" | "7d" | "30d" | "all";

export interface PaymentBreakdownItem {
  paymentMode: PaymentMode;
  count: number;
  amount: number;
  sharePercent: number;
}

export interface TopSellingProductItem {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}

export interface SalesReportData {
  dateRange: SalesDateRange;
  currency: string;
  completedCount: number;
  refundedCount: number;
  grossRevenue: number;
  refundedAmount: number;
  totalDiscount: number;
  totalTax: number;
  estimatedCost: number;
  grossProfit: number;
  profitMarginPercent: number;
  averageOrderValue: number;
  totalUnitsSold: number;
  paymentBreakdown: PaymentBreakdownItem[];
  topProducts: TopSellingProductItem[];
}

export interface ProductQueryParams {
  query?: string;
  category?: string;
  stockStatus?: StockStatusFilter;
  threshold?: number;
}

export interface SalesQueryParams {
  query?: string;
  paymentMode?: "all" | PaymentMode;
  status?: "all" | SaleStatus;
  dateRange?: SalesDateRange;
}

export interface AuditLogItem {
  id: string;
  userId?: string | null;
  username: string;
  userFullName: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: string | null;
  newValues?: string | null;
  createdAt: string;
}

export interface AuditLogsQueryParams {
  query?: string;
  action?: string;
  limit?: number;
}

export interface CustomerItem {
  id: string;
  name: string;
  email?: string;
  phonenumber?: string;
  address?: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetailResponse {
  customer: CustomerItem;
  recentSales: SaleTransactionSummary[];
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phonenumber?: string;
  address?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phonenumber?: string;
  address?: string;
}

export interface SupplierItem {
  id: string;
  name: string;
  companyName: string;
  email?: string;
  phonenumber?: string;
  address?: string;
  isActive: boolean;
  orderCount: number;
  totalPurchases: number;
  outstandingBalance: number;
  lastOrderAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTransactionSummary {
  id: string;
  transactionNo: string;
  supplierId: string;
  deliveredBy?: string;
  transactionDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  paymentMode: PaymentMode;
  status: "completed" | "pending" | "cancelled";
  notes?: string;
}

export interface SupplierDetailResponse {
  supplier: SupplierItem;
  transactions: SupplierTransactionSummary[];
}

export interface CreateSupplierInput {
  name: string;
  companyName: string;
  email?: string;
  phonenumber?: string;
  address?: string;
  isActive?: boolean;
}

export interface UpdateSupplierInput {
  name?: string;
  companyName?: string;
  email?: string;
  phonenumber?: string;
  address?: string;
  isActive?: boolean;
}

export interface CreateSupplierTransactionInput {
  supplierId: string;
  deliveredBy?: string;
  transactionDate?: string;
  totalAmount: number;
  amountPaid?: number;
  paymentMode: PaymentMode;
  notes?: string;
}

export interface PaySupplierBalanceInput {
  transactionId: string;
  paymentAmount: number;
  paymentMode?: PaymentMode;
  notes?: string;
}

export interface EmployeeItem {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullName: string;
  phonenumber?: string;
  role: "admin" | "member";
  isLocked: boolean;
  lastLoginAt?: string | null;
  completedSalesCount: number;
  refundedSalesCount: number;
  totalRevenue: number;
  averageTicket: number;
  createdAt: string;
}

export interface EmployeeDetailResponse {
  employee: EmployeeItem;
  paymentBreakdown: PaymentBreakdownItem[];
  recentSales: SaleTransactionSummary[];
}

export interface CreateEmployeeInput {
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  role: "admin" | "member";
  password: string;
}

export interface UpdateEmployeeInput {
  firstname?: string;
  lastname?: string;
  email?: string;
  phonenumber?: string;
  role?: "admin" | "member";
  password?: string;
}

export interface DailyCashierBreakdown {
  userId: string;
  cashierName: string;
  salesCount: number;
  revenue: number;
}

export interface DailyReportData {
  date: string;
  currency: string;
  storeName: string;
  totalTransactions: number;
  completedCount: number;
  refundedCount: number;
  grossRevenue: number;
  refundedAmount: number;
  totalDiscount: number;
  totalTax: number;
  estimatedCost: number;
  grossProfit: number;
  profitMarginPercent: number;
  averageOrderValue: number;
  totalUnitsSold: number;
  paymentBreakdown: PaymentBreakdownItem[];
  topProducts: TopSellingProductItem[];
  cashierBreakdown: DailyCashierBreakdown[];
}

