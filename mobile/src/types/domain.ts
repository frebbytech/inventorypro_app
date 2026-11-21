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

export type WorkspaceMode = "mobile_only" | "synced";

export type SyncStatus =
  | "local_only"
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline"
  | "syncing"
  | "conflict";

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

export type TwoFactorMethod = "email" | "sms";
export type StockAudioTone = "chime" | "bell" | "marimba" | "ping";
export type PaperSize = "thermal_80mm" | "a4";

export interface DaySchedule {
  day: string;
  label: string;
  closed: boolean;
  openTime: string;
  closeTime: string;
  is24Hours?: boolean;
}

export const DEFAULT_WEEKLY_SCHEDULE: DaySchedule[] = [
  { day: "monday", label: "Monday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "tuesday", label: "Tuesday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "wednesday", label: "Wednesday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "thursday", label: "Thursday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "friday", label: "Friday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "saturday", label: "Saturday", closed: false, openTime: "09:00", closeTime: "16:00" },
  { day: "sunday", label: "Sunday", closed: true, openTime: "09:00", closeTime: "16:00" },
];

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  role: "admin" | "member";
  lastLoginAt?: string | null;
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: TwoFactorMethod;
}

export interface StaffTwoFactorAccount {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullname: string;
  phonenumber: string;
  role: "admin" | "member";
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod;
  twoFactorUpdatedAt: string | null;
  lastLoginAt: string | null;
  isCurrentUser: boolean;
}

export interface TwoFactorOverviewResponse {
  currentUserAccount: StaffTwoFactorAccount;
  accounts: StaffTwoFactorAccount[];
  emailConfigured: boolean;
  smsConfigured: boolean;
}

export interface UpdateTwoFactorInput {
  userId?: string;
  enabled?: boolean;
  method?: TwoFactorMethod;
}

export interface BulkUpdateTwoFactorInput {
  userIds: string[];
  enabled: boolean;
}

export interface StoreProfile {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  currency: string;
  taxRate: number;
  stockAlertThreshold: number;
  language?: string;
  notificationEmail?: boolean;
  notificationPush?: boolean;
  notificationSms?: boolean;
  stockAudioAlert?: boolean;
  stockAudioTone?: StockAudioTone;
  stockAudioVolume?: number;
  eodReportEnabled?: boolean;
  eodBusinessClosingTime?: string;
  eodAdminEmail?: string;
  eodAdminPhone?: string;
  business247?: boolean;
  businessOpeningTime?: string;
  businessClosingTime?: string;
  businessHoursSchedule?: DaySchedule[];
  businessHoursNotes?: string;
  printAfterSale?: boolean;
  paperSize?: PaperSize;
}

export interface UpdateBusinessSettingsInput {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  currency?: string;
  taxRate: number;
  stockAlertThreshold?: number;
  language?: string;
  printAfterSale?: boolean;
  paperSize?: PaperSize;
}

export interface UpdateNotificationSettingsInput {
  notificationEmail?: boolean;
  notificationPush?: boolean;
  notificationSms?: boolean;
  stockAlertThreshold?: number;
  stockAudioAlert?: boolean;
  stockAudioTone?: StockAudioTone;
  stockAudioVolume?: number;
  eodReportEnabled?: boolean;
  eodBusinessClosingTime?: string;
  eodAdminEmail?: string;
  eodAdminPhone?: string;
}

export interface UpdateBusinessHoursInput {
  business247: boolean;
  businessOpeningTime: string;
  businessClosingTime: string;
  businessHoursSchedule: DaySchedule[];
  businessHoursNotes: string;
}

export interface SendDailyReportResult {
  ok: boolean;
  sentAt: string;
  reportDate: string;
  dispatchSummary?: Record<string, unknown>;
}

export interface AuthLoginPayload {
  identifier: string;
  password: string;
  workspaceSlug?: string;
  deviceName?: string;
  deviceType?: string;
  operatingSystem?: string;
}

export interface RegisterWorkspacePayload {
  storeName: string;
  username: string;
  email: string;
  password: string;
  firstname?: string;
  lastname?: string;
  phonenumber?: string;
  currency?: string;
  deviceName?: string;
  deviceType?: string;
  operatingSystem?: string;
}

export interface AuthLoginResponse {
  token: string;
  expiresAt: string;
  user: SessionUser;
  store: StoreProfile;
  tenant?: TenantInfo;
  twoFactorRequired?: false;
}

export interface AuthTwoFactorChallengeResponse {
  twoFactorRequired: true;
  challengeToken: string;
  method: string;
  maskedTarget: string;
}

export type AuthLoginResult = AuthLoginResponse | AuthTwoFactorChallengeResponse;

export interface AuthSessionResponse {
  user: SessionUser;
  store: StoreProfile;
  tenant?: TenantInfo;
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
  photoUrl?: string;
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
  photoUrl?: string;
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
  photoUrl?: string;
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

export type NotificationType =
  | "low_stock"
  | "sale"
  | "refund"
  | "employee"
  | "system"
  | "security";

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType | string;
  title: string;
  message?: string | null;
  isRead: boolean;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsQueryParams {
  unreadOnly?: boolean;
  limit?: number;
}

export type BroadcastRecipientGroup = "employees" | "customers" | "suppliers";
export type BroadcastChannel = "in_app" | "sms" | "email";
export type BroadcastStatus = "sent" | "queued" | "partial" | "failed";

export interface BroadcastRecipient {
  id: string;
  name: string;
  email?: string | null;
  phonenumber?: string | null;
  subtitle?: string | null;
  hasValidEmail: boolean;
  hasValidPhone: boolean;
  canReceiveInApp: boolean;
}

export interface BroadcastMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  recipientGroup: BroadcastRecipientGroup;
  channel: BroadcastChannel;
  subject?: string | null;
  content: string;
  recipientCount: number;
  status: BroadcastStatus;
  createdAt: string;
}

export interface SendBroadcastInput {
  recipientGroup: BroadcastRecipientGroup;
  channel: BroadcastChannel;
  subject?: string;
  content: string;
  recipientIds?: string[];
}

export interface UserSessionItem {
  id: string;
  deviceName: string;
  deviceType: string;
  operatingSystem: string;
  isActive: boolean;
  isCurrent: boolean;
  lastActivityAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface UpdateMyProfileInput {
  firstname: string;
  lastname: string;
  email: string;
  phonenumber?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export type SyncEntityType =
  | "product"
  | "category"
  | "sale"
  | "inventory"
  | "customer"
  | "supplier"
  | "supplier_transaction"
  | "supplier_tx"
  | "employee"
  | "settings"
  | "notification"
  | "message";

export type SyncActionType = "upsert" | "delete" | "stock_delta" | "refresh";

export interface SyncEventDto {
  cursor: number;
  tenantId: string;
  entityType: SyncEntityType | string;
  entityId: string;
  action: SyncActionType | string;
  payload: Record<string, unknown> | null;
  actorUserId?: string | null;
  createdAt: string;
}

export interface SyncBootstrapCategory {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  updatedAt: string;
}

export interface SyncBootstrapCustomer {
  id: string;
  name: string;
  email?: string;
  phonenumber?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncBootstrapSupplier {
  id: string;
  name: string;
  companyName: string;
  email?: string;
  phonenumber?: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncBootstrapSale {
  id: string;
  userId?: string;
  receiptNo: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  cashierName: string;
  saleDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  paymentMode: PaymentMode;
  status: SaleStatus;
  notes?: string;
}

export interface SyncBootstrapSaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SyncBootstrapEmployee {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  role: "admin" | "member";
  twoFactorEnabled?: boolean;
  twoFactorMethod?: TwoFactorMethod;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncBootstrapSupplierTransaction {
  id: string;
  transactionNo: string;
  supplierId: string;
  userId?: string;
  deliveredBy?: string;
  transactionDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  paymentMode: PaymentMode;
  status: "completed" | "pending" | "cancelled";
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SyncBootstrapAuditLog {
  id: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: string | null;
  newValues?: string | null;
  createdAt: string;
}

export interface SyncBootstrapResponse {
  latestCursor: number;
  syncedAt: string;
  tenant: TenantInfo;
  user: SessionUser;
  store: StoreProfile;
  categories: SyncBootstrapCategory[];
  products: ProductItem[];
  customers: SyncBootstrapCustomer[];
  suppliers: SyncBootstrapSupplier[];
  restocks: RestockLogItem[];
  sales: SyncBootstrapSale[];
  saleItems: SyncBootstrapSaleItem[];
  employees?: SyncBootstrapEmployee[];
  supplierTransactions?: SyncBootstrapSupplierTransaction[];
  notifications?: NotificationItem[];
  broadcastMessages?: BroadcastMessageItem[];
  auditLogs?: SyncBootstrapAuditLog[];
}

export interface SyncDeltaResponse {
  events: SyncEventDto[];
  latestCursor: number;
  oldestAvailableCursor: number;
  resetRequired: boolean;
}

export interface SyncMergeSalePayload {
  id?: string;
  receiptNo: string;
  customerId?: string;
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
  notes?: string;
  items: Array<{
    productId: string;
    productName?: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export interface SyncMergePayload {
  categories: Array<{
    id?: string;
    name: string;
    description?: string;
    isActive?: boolean;
  }>;
  customers: Array<{
    id?: string;
    name: string;
    email?: string;
    phonenumber?: string;
    address?: string;
  }>;
  suppliers: Array<{
    id?: string;
    name: string;
    companyName?: string;
    email?: string;
    phonenumber?: string;
    address?: string;
    isActive?: boolean;
  }>;
  products: Array<{
    id?: string;
    categoryId?: string;
    categoryName?: string;
    name: string;
    description?: string;
    barcode?: string;
    photoUrl?: string;
    costPrice: number;
    unitPrice: number;
    stockQuantity: number;
    lowStockThreshold?: number;
    active?: boolean;
  }>;
  restocks: Array<{
    id?: string;
    productId: string;
    productName?: string;
    quantity: number;
    restockDate?: string;
    createdAt?: string;
  }>;
  sales: SyncMergeSalePayload[];
}

export interface SyncMergeResponse {
  ok: boolean;
  merged: {
    categories: number;
    customers: number;
    suppliers: number;
    products: number;
    restocks: number;
    sales: number;
  };
  latestCursor: number;
}

export interface SyncOutboxItem {
  id: string;
  clientMutationId: string;
  entityType: string;
  operation: string;
  endpoint: string;
  method: string;
  payloadJson: string;
  status: "pending" | "processing" | "conflict" | "failed";
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}


