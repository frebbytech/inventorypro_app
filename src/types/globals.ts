export {};

// Create a type for the roles
export type Roles = "admin" | "member";

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Roles;
    };
  }
}

//User
// export type User = {
//   id: string;
//   firstName: string;
//   lastName: string;
//   name?: string;
//   emailAddress: string;
//   username: string;
//   phoneNumber: string;
//   role: string;
//   created_at: date | string;
//   lastSignedIn?: string;
//   error?: boolean;
//   message?: string;
// };

export type InsertUser = {
  id?: string | undefined;
  firstname: string;
  lastname: string;
  email: string;
  username: string;
  phonenumber: string;
  password?: string;
  role?: "admin" | "member";
};

//Products
// export type Product = {
//   id?: number;
//   user_id?: string | null;
//   name: string;
//   category: string;
//   description?: string;
//   cost_price: string;
//   unit_price: string;
//   stock: string;
//   active?: number;
//   created_at?: Date;
//   updated_at?: Date;
//   error?: boolean;
//   message?: string;
// };

export type CustomerOrderView = {
  id: number; // Order ID
  orderDate: Date | string;
  status: string;
  paymentMode: string;
  totalAmount: number;
  customerId: number;
  customerName: string;
  phoneNumber: string;
  issuerId: string;
  issuerName: string;
  error?: boolean;
  message?: string;
};

export type CustomerSaleView = {
  id: number; // Sale ID
  saleDate: Date | string;
  status: string;
  paymentMode: string;
  totalAmount: number;
  customerId: number;
  customerName: string;
  phoneNumber: string;
  issuerId: string;
  issuerName: string;
  error?: boolean;
  message?: string;
};

// export type SaleSummaryView = {
//   id: number; // Sale ID
//   saleDate: Date | string;
//   purchaseDate: Date | string;
//   status: string;
//   paymentMode: string;
//   totalCost: number;
//   totalAmount: number;
//   amountPaid: number;
//   balance: number;
//   customerId: number;
//   customerName: string;
//   phoneNumber: string;
//   issuerId: string;
//   issuerName: string;
//   error?: boolean;
//   message?: string;
// };

export type OrderProductView = {
  orderId: number;
  orderDate: Date | string;
  totalAmount: number;
  status: string;
  productId: number;
  productName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  error?: boolean;
  message?: string;
};

export type SaleProductView = {
  saleId: number;
  saleDate: Date | string;
  totalAmount: number;
  status: string;
  productId: number;
  productName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  error?: boolean;
  message?: string;
};
export type PaymentMode = "cash" | "cheque" | "momo" | "bank";

export type InsertSalesCustomer = {
  name: string;
  phonenumber?: string;
};
// export type InsertSales = {
//   customer: InsertSalesCustomer;
//   user_id: string;
//   transaction_id: string;
//   sale_date?: Date | string;
//   total_cost: number;
//   total_amount: number;
//   amount_paid: number;
//   balance: number;
//   payment_mode: string;
//   error?: boolean;
//   message?: string;
// };

// export type SalesItem = {
//   unit_price: number;
//   quantity: number;
//   error?: boolean;
//   message?: string;
// };

export interface SaleItem {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  sale_date: Date | string;
  user_name: string;
  user_id: string;
}

export interface EmployeeSale {
  sale_id: string;
  customer_id: string;
  user_id: string;
  receipt_number: string;
  customer_name: string;
  phonenumber: string;
  user_name: string;
  total_amount: number;
  payment_mode: "cash" | "cheque" | "momo" | string; // Adjust string literals as needed
  status: "completed" | "pending" | "cancelled" | string;
  details: string;
  // [key: string]: unknown;
  sale_date: string | Date;
  created_at: string | Date;
}

export interface LowStockAlertItem {
  id: string;
  name: string;
  remainingStock: number;
  threshold: number;
}

export type PaymentInfo = {
  transactionId: string;
  customer: InsertSalesCustomer;
  receipt_number: string;
  date: Date | string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  products: CartItem[];
  paymentMode: string;
  qrcode?: string;
  lowStockAlerts?: LowStockAlertItem[];
  attendantName?: string;
};

export type ErrorType = {
  error: boolean;
  message: string;
};
export type CustomerTransactionItem = {
  id: number;
  unitPrice: string;
  quantity: string;
  subtotal: string;
  prouductId: number;
  productName: string;
  category: string;
  saleId: number;
  saleDate: string; // ISO date string
  totalAmount: string;
  status: "completed" | "pending" | "failed"; // Assuming other possible statuses
};

export type TopProducts = {
  id: string;
  name: string;
  revenue: number;
  quantity: number;
};

// export type TotalCounts = {
//   products?: number;
//   suppliers?: number;
//   users?: number;
//   topFiveRecentSales: CustomerSaleView[];
//   topFiveSoldProducts: TopProducts[];
//   todaySales: number;
//   thisMonthSales: number;
//   totalSalesAmount: number;
//   totalMonthlySales: {
//     month: string;
//     value: number;
//   }[];
// };

export type Log = {
  userId?: string;
  actionType: string;
  description: string;
  resourceName?: string | null;
  resourceId?: number | string | null;
};

export type UserLog = {
  id: number;
  issuerId: number;
  issuerName: string;
  actionType: string;
  description: string;
  resourceName?: string | null;
  resourceId?: number | null;
  logDate: Date;
  active?: number;
};

export type DeleteDataProps = {
  ids: number[] | string[];
  table: string;
};

// ==============================
// ENUMS (shared)
// ==============================
type UserRole = "admin" | "member";
type OrderStatus = "pending" | "delivered" | "failed";
type PaymentModeOrder = "cash" | "credit" | "momo" | "bank";
type SaleStatus = "pending" | "completed" | "failed";
type PaymentModeSale = "cash" | "momo" | "bank";
type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "approve"
  | "cancel"
  | "login"
  | "logout";
type NotificationType =
  | "system"
  | "product"
  | "inventory"
  | "order"
  | "sale"
  | "payment"
  | "customer";

// ==============================
// Main Tables
// ==============================

export type TwoFactorMethod = "email" | "sms";

export interface User {
  id: string; // CHAR(36)
  clerk_id?: string | null;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullname: string;
  phonenumber: string;
  role: UserRole;
  failed_login_attempts?: number;
  locked_until?: string | Date | null;
  two_factor_enabled?: boolean;
  two_factor_method?: TwoFactorMethod;
  two_factor_updated_at?: string | Date | null;
  created_at: Date;
  updated_at: Date;
  lastSignedIn: Date;
}

export interface StaffTwoFactorAccount {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullname: string;
  phonenumber: string;
  role: UserRole;
  two_factor_enabled: boolean;
  two_factor_method: TwoFactorMethod;
  two_factor_updated_at: string | null;
  last_login_at: string | null;
  isCurrentUser: boolean;
}

export interface ProductCategory {
  id: string;
  user_id: string;
  name: string;
  description?: string | null; // TEXT, nullable
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// export interface Product {
//   id: string;
//   user_id: string;
//   category_id: string;
//   name: string;
//   description: string;
//   cost_price: number; // DECIMAL(10,2)
//   unit_price: number; // DECIMAL(10,2)
//   stock_quantity: number; // INT
//   active: boolean;
//   created_at: Date;
//   updated_at: Date;
// }

// export interface Supplier {
//   id: string;
//   user_id: string;
//   name: string;
//   address?: string | null;
//   phonenumber?: string | null;
//   created_at: Date;
//   updated_at: Date;
// }

export interface InsertProduct {
  id?: string;
  user_id?: string;
  name: string;
  category_id: string;
  description: string;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  barcode?: string | null;
  photo_url: string | null;
  image: string | null;
  active: boolean | undefined;
}

export interface Product {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  description: string;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  barcode?: string | null;
  user_id: string;
  created_at: Date;
  updated_at: Date;
  photo_url: string | null;
  image: string | null;
  active: number;
}
export interface ReStockProduct {
  id: string;
  stock_quantity: number;
}

export type InsertInventory = {
  id?: string;
  user_id: string | null;
  product_category_id: string;
  supplier_id: string;
  product_id: string;
  quantity: number;
  restock_date: string | Date; // ISO date or Date object
  created_at?: Date;
  updated_at?: Date;
  error?: boolean;
  message?: string;
};

// export type Inventory = {
//   id: number;
//   product_id: string;
//   product_name: string;
//   category: string;
//   unit_price: string;
//   restocked_quantity: number;
//   total: number;
//   restock_date: Date;
//   supplier_name: string;
//   address: string;
//   phonenumber: string;
//   error?: boolean;
//   message?: string;
// };

export interface Inventory extends InsertInventory {
  id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerInfoView {
  id: string;
  name: string;
  address: string | null;
  phonenumber: string | null;
  user_id: string;
  user_name: string;
  created_at: Date;
  updated_at: Date;
}

//Customer
export type InsertCustomer = {
  id?: string;
  user_id: string;
  name: string;
  address?: string | null;
  phonenumber?: string | null;
};

export interface Customer extends InsertCustomer {
  id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

//Supplier
export type InsertSupplier = {
  id?: string;
  user_id: string;
  name: string;
  email: string;
  company_name: string;
  address?: string | null;
  phonenumber?: string | null;
  is_active: boolean | undefined;
};

//Supplier
// export type Supplier = {
//   id?: string;
//   user_id: string;
//   name: string;
//   address: string;
//   phonenumber: string;
//   created_at?: string;
// };

export interface Supplier extends InsertSupplier {
  id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: string;
  customer_id: string;
  user_id: string;
  order_date: Date; // DATE
  order_details?: string; // TEXT, defaults to ""
  total_amount: number; // DECIMAL(10,2)
  status: OrderStatus;
  payment_mode: PaymentModeOrder; // defaults to 'cash'
  created_at: Date;
  updated_at: Date;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number; // INT
  unit_price: number; // DECIMAL(10,2)
  created_at: Date;
  updated_at: Date;
}

export interface Inventory {
  id: string;
  user_id: string;
  supplier_id: string;
  product_category_id: string;
  product_id: string; // added after fix
  quantity: number; // INT
  restock_date: Date; // DATE
  created_at: Date;
  updated_at: Date;
}

export interface Sale {
  id: string;
  customer_id: string;
  user_id: string;
  date: Date; // DATE
  details?: string; // TEXT, defaults to ""
  total_amount: number; // DECIMAL(10,2)
  payment_mode: PaymentModeSale; // defaults to 'cash'
  status: SaleStatus; // defaults to 'completed'
  created_at: Date;
  updated_at: Date;
}

export interface SaleItem {
  id: string;
  sales_id: string;
  product_id: string;
  quantity: number; // INT
  unit_price: number; // DECIMAL(10,2)
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  user_id?: string | null; // nullable (SET NULL on delete)
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  old_values?: any; // JSON, could be Record<string, any> | null
  new_values?: any; // JSON
  ip_address?: string | null; // VARCHAR(45)
  user_agent?: string | null; // TEXT
  created_at: Date;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: string;
  title: string;
  description?: string | null;
  metadata: Record<string, any> | null;
  created_at: Date;
}

export interface UserSession {
  id: string;
  user_id: string;
  refresh_token?: string | null; // VARCHAR(500)
  device_name?: string | null;
  device_type?: string | null;
  browser?: string | null;
  operating_system?: string | null;
  ip_address?: string | null;
  is_active: boolean;
  last_activity_at?: Date | null;
  expires_at: Date;
  created_at: Date;
}

// export interface Notification {
//   id: string;
//   user_id: string;
//   type: NotificationType;
//   title: string;
//   message: string;
//   reference_type?: string | null;
//   reference_id?: string | null;
//   is_read: boolean;
//   read_at?: Date | null;
//   created_at: Date;
// }

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: string;
  title: string;
  description?: string | null;
  metadata: Record<string, any> | null;
  created_at: Date;
}

// View type (includes user details)
export interface ActivityLogView extends ActivityLog {
  user_username: string;
  user_name: string;
}

/** v_users – extended user info with full name */
export interface UserView {
  id: string;
  clerk_id: string | null;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  full_name: string; // generated
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type InsertCategory = Pick<Category, "name"> &
  Partial<Pick<Category, "description">>;

/** v_product_catalog – product with category and user details */
export interface ProductCatalogView {
  id: string;
  name: string;
  description: string;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  stock_value: number;
  category_name: string;
  category_id: string;
  barcode?: string | null;
  user_id: string;
  created_by: string; // from users
  active: number;
  photo_url?: string | null;
  image?: string | null;
  created_at: Date;
  updated_at: Date;
}
export interface ProductSalesView {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  subtotal: number;
  sale_date: Date;
  photo_url?: string | null;
  image?: string | null;
  customer_name: string;
  user_id: string;
  created_by: string; // from users
}

/** v_customer_info – customer with user details */

/** v_supplier_info – supplier with user details */
export interface SupplierInfoView {
  id: string;
  name: string;
  email?: string | null;
  company_name?: string | null;
  address?: string | null;
  phonenumber?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  is_active?: boolean;
}

// export interface InsertSupplier {
//   id?: string;
//   name: string;
//   email?: string;
//   company_name?: string;
//   address?: string;
//   phonenumber?: string;
//   user_id?: string;
//   is_active?: boolean;
// }

export interface SupplierTransaction {
  id: string;
  transaction_no?: string | null;
  supplier_id: string;
  delivered_by?: string | null;
  transaction_date: string | Date;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_mode: string;
  status: string;
  notes?: string | null;
  user_id: string;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface SupplierTransactionItem {
  id: string;
  supplier_transaction_id: string;
  product_id?: string | null;
  product_name: string;
  category_name?: string | null;
  product_type:
    | "boxes"
    | "sachets"
    | "packs"
    | "cartons"
    | "pieces"
    | "units"
    | "bottles"
    | "bags"
    | string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at?: string | Date;
}

export interface InsertSupplierTransactionItem {
  product_id?: string | null;
  product_name: string;
  category_name?: string | null;
  product_type: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
}

export interface InsertSupplierTransaction {
  supplier_id: string;
  delivered_by?: string;
  transaction_date?: string;
  total_amount: number;
  amount_paid?: number;
  balance?: number;
  payment_mode?: string;
  status?: string;
  notes?: string;
  items: InsertSupplierTransactionItem[];
}

export interface SupplierTransactionView extends SupplierTransaction {
  supplier_name: string;
  company_name: string;
  user_name: string;
  total_items_count: number;
}

export interface SupplierTransactionDetailView extends SupplierTransactionView {
  items: SupplierTransactionItem[];
}

/** v_order_summary – order header with customer, user, and item count */
export interface OrderSummaryView {
  order_id: string;
  customer_name: string;
  user_username: string;
  user_name: string;
  order_date: Date;
  total_amount: number;
  status: OrderStatus;
  payment_mode: PaymentModeOrder;
  order_details: string; // default is ''
  item_count: number; // computed
  created_at: Date;
  updated_at: Date;
}

/** v_order_items_detail – line items with product and subtotal */
export interface OrderItemsDetailView {
  order_item_id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number; // computed: quantity * unit_price
  order_date: Date;
  customer_name: string;
  user_name: string;
  user_id: string;
}

/** v_sale_summary – sale header with customer, user, and item count */
export interface SaleSummaryView {
  sale_id: string;
  customer_name: string;
  phonenumber: string;
  user_name: string;
  user_email: string;
  sale_date: Date;
  total_amount: number;
  payment_mode: PaymentModeSale;
  status: SaleStatus;
  details: string; // default ''
  item_count: number; // computed
  created_at: Date;
  updated_at: Date;
}

/** v_sale_items_detail – line items for sales */
export interface SaleItemsDetailView {
  sale_item_id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number; // quantity * unit_price
  sale_date: Date;
  customer_name: string;
  user_name: string;
  user_id: string;
}

/** v_inventory_product_details – inventory with product, supplier, category, and user */
export interface InventoryInfoView {
  inventory_id: string;
  restock_quantity: number;
  restock_date: Date;
  user_username: string;
  user_email: string;
  product_name: string;
  unit_price: number;
  current_stock: number; // from products.stock_quantity
  category_name: string;
  supplier_name: string;
  created_at: Date;
  updated_at: Date;
}

/** v_product_stock_status – current product stock */
export interface ProductStockStatusView {
  product_id: string;
  product_name: string;
  stock_quantity: number;
  category_name: string;
  user_name: string;
  unit_price: number;
  cost_price: number;
  created_at: Date;
  updated_at: Date;
}

/** v_unified_transactions – combined orders (delivered) and sales (completed) */
export interface UnifiedTransactionView {
  transaction_type: "order" | "sale";
  transaction_id: string;
  customer_id: string;
  customer_name: string;
  user_id: string;
  username: string;
  user_name: string;
  transaction_date: Date;
  total_amount: number;
  status: OrderStatus | SaleStatus; // depends on type, but union works
  payment_mode: PaymentModeOrder | PaymentModeSale;
  created_at: Date;
  updated_at: Date;
}

/** v_monthly_revenue – aggregated monthly revenue per user */
export interface MonthlyRevenueView {
  user_id: string;
  user_name: string;
  month: string; // format 'YYYY-MM'
  total_revenue: number;
  transaction_count: number;
}

/** v_product_sales_performance – sales/order volume per product */
export interface ProductSalesPerformanceView {
  product_id: string;
  product_name: string;
  user_id: string;
  total_ordered_qty: number;
  total_order_revenue: number;
  total_sold_qty: number;
  total_sale_revenue: number;
  total_movement: number; // sum of ordered + sold
}

/** v_audit_logs – audit trail with user name */
export interface AuditLogView {
  id: string;
  user_username: string | null; // left join, can be null
  user_name: string | null;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  old_values: any; // JSON
  new_values: any; // JSON
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

/** v_activity_logs – activity logs with user name */
export interface ActivityLogView {
  id: string;
  user_username: string;
  user_name: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: any; // JSON
  created_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
  updated_at: string;
}

export type InsertNotification = Omit<
  Notification,
  "id" | "created_at" | "updated_at" | "is_read"
> & {
  is_read?: boolean;
};

/** v_notifications – notifications with user name */
export interface NotificationView {
  id: string;
  user_username: string;
  user_name: string;
  type: NotificationType;
  title: string;
  message: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

/** v_user_sessions – sessions with user and device info */
export interface UserSessionView {
  id: string;
  user_username: string;
  user_name: string;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  ip_address: string | null;
  is_active: boolean;
  last_activity_at: Date | null;
  expires_at: Date;
  created_at: Date;
}

/** v_customer_order_history – customer lifetime value summary */
export interface CustomerOrderHistoryView {
  customer_id: string;
  customer_name: string;
  order_count: number;
  total_order_value: number;
  sale_count: number;
  total_sale_value: number;
  lifetime_value: number; // order + sale values
}

export interface TotalCounts {
  products?: number;
  suppliers?: number;
  users?: number;
  topFiveRecentSales: any[]; // adjust type
  todaySales: number;
  thisMonthSales: number;
  totalSalesAmount: number;
  salesForLastSevenDays?: { date: string; revenue: number; orders: number }[];
  topFiveSoldProducts: TopProducts[];
  totalMonthlySales: { month: string; value: number }[];
  stockAlerts?: { id: string; name: string; stock: number }[];
  lowStockCount?: number;
  unreadNotifications?: number;
}

export interface InsertSales {
  receipt_number: string;
  customer: { name: string; phonenumber?: string };
  total_amount: number;
  payment_mode?: PaymentMode;
  details?: string;
}

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  cost_price?: number;
  stock_quantity?: number | null;
  stock_value?: number | null;
}

// Strict, reusable Result type declaration
export type Result<T, E = string> =
  | { success: true; data: T; message: null }
  | { success: false; data: null; message: E };

// Helper constructors for clean syntax
export const Result = {
  ok: <T>(data: T): Result<T, never> => ({
    success: true,
    data,
    message: null,
  }),
  fail: <E>(message: E): Result<never, E> => ({
    success: false,
    data: null,
    message,
  }),
};

export interface UserEntity {
  username: string;
  email?: string;
  role?: string;
  firstname?: string;
  lastname: string;
}
export interface CustomerEntity {
  name: string;
  phonenumber?: string;
  address?: string;
  user_id?: string;
}
export interface NotificationEntity {
  type: string;
  title?: string;
}
export interface ProductCategoryEntity {
  name: string;
  description: string;
}

export interface ProductEntity {
  name: string;
  description?: string;
  category_id: string;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  is_active: boolean;
}

export interface SaleEntity {
  customer_id: string;
  total_amount: string;
  payment_mode: string;
  item_count?: string;
  date?: string;
  status?: string;
}
export interface EmployeeEntity {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  salary: number;
  hire_date: string;
}

export interface SupplierEntity {
  name: string;
  address: string;
  phonenumber: string;
  company_name?: string;
  email?: string;
  user_id?: string;
}

export interface InventoryEntity {
  product_id?: string;
  quantity: string;
  restock_date: string;
  supplier_id: string;
  product_category_id: string;
}

// Create a union mapping type for the switcher helper function
export type AuditEntityMap = {
  user: UserEntity;
  customer: CustomerEntity;
  notification: NotificationEntity;
  product_category: ProductCategoryEntity;
  product: ProductEntity;
  sale: SaleEntity;
  employee: EmployeeEntity;
  supplier: SupplierEntity;
  inventory: InventoryEntity;
};

// Valid string literal type for our switcher
export type AuditEntityType = keyof AuditEntityMap;

export interface Settings {
  id: string;
  user_id: string;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  logo?: string | null;
  business_opening_time?: string | null;
  business_closing_time?: string | null;
  business_hours_schedule?: string | null;
  business_hours_notes?: string | null;
  business_24_7?: boolean;
  eod_report_enabled?: boolean;
  eod_business_closing_time?: string | null;
  eod_channels?: string | null; // JSON string e.g. ["in_app", "email", "sms"]
  eod_admin_email?: string | null;
  eod_admin_phone?: string | null;
  currency: string;
  tax_rate: number | null;
  language: string;
  theme: "light" | "dark" | "system";
  accent_color: string;
  notification_email: boolean;
  notification_push: boolean;
  notification_sms: boolean;
  member_sale_alert_enabled?: boolean;
  member_sale_alert_channels?: string | null;
  stock_audio_alert?: boolean;
  stock_audio_volume?: number;
  stock_audio_tone?: "chime" | "bell" | "marimba" | "ping";
  stock_alert_threshold?: number;
  created_at: string;
  updated_at: string;
  print_after_sale: boolean;
  printer_device_name: string | null;
  paper_size: string; // e.g., 'a4', 'a3', 'thermal_80mm'
  old_business_name?: string | null;
}

export type UpdateSettingsInput = Partial<
  Omit<Settings, "id" | "user_id" | "created_at" | "updated_at">
>;


// Safe (masked) version returned to the client
export interface ApiSettings {
  id: string;
  user_id: string;

  // SMS
  arkessel_api_key: string;        // masked
  arkessel_sender_id: string;
  arkessel_base_url: string;
  has_arkessel_api_key: boolean;   // true if a key is stored

  // Email
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;           // masked
  smtp_from_name: string;
  smtp_from_email: string;
  has_smtp_password: boolean;      // true if a password is stored

  created_at: string;
  updated_at: string;
}

export interface UpdateApiSettingsInput {
  arkessel_api_key?: string;
  arkessel_sender_id?: string;
  arkessel_base_url?: string;

  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from_name?: string;
  smtp_from_email?: string;
}


export interface DaySchedule {
  day: string;
  label: string;
  closed: boolean;
  openTime: string;
  closeTime: string;
  is24Hours?: boolean;
}

export const DEFAULT_WEEKLY_SCHEDULE: DaySchedule[] = [
  {
    day: "monday",
    label: "Monday",
    closed: false,
    openTime: "08:00",
    closeTime: "18:00",
  },
  {
    day: "tuesday",
    label: "Tuesday",
    closed: false,
    openTime: "08:00",
    closeTime: "18:00",
  },
  {
    day: "wednesday",
    label: "Wednesday",
    closed: false,
    openTime: "08:00",
    closeTime: "18:00",
  },
  {
    day: "thursday",
    label: "Thursday",
    closed: false,
    openTime: "08:00",
    closeTime: "18:00",
  },
  {
    day: "friday",
    label: "Friday",
    closed: false,
    openTime: "08:00",
    closeTime: "18:00",
  },
  {
    day: "saturday",
    label: "Saturday",
    closed: false,
    openTime: "09:00",
    closeTime: "16:00",
  },
  {
    day: "sunday",
    label: "Sunday",
    closed: true,
    openTime: "09:00",
    closeTime: "16:00",
  },
];

export type BroadcastChannel = "sms" | "email" | "in_app";
export type RecipientGroup = "suppliers" | "customers" | "employees";

export interface BroadcastMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_group: RecipientGroup;
  channel: BroadcastChannel;
  subject: string | null;
  content: string;
  recipient_count: number;
  status: "sent" | "failed" | "partially_sent";
  created_at: string;
}

export interface BroadcastRecipient {
  id: string;
  name: string;
  email?: string | null;
  phonenumber?: string | null;
  role?: string | null;
  company_name?: string | null;
  hasValidEmail: boolean;
  hasValidPhone: boolean;
  canReceiveInApp: boolean;
}

export interface SendBroadcastInput {
  recipientGroup: RecipientGroup;
  channel: BroadcastChannel;
  subject?: string;
  content: string;
  recipientIds?: string[];
}

export interface DailySalesReport {
  id: string;
  report_date: string; // "YYYY-MM-DD"
  generated_at: string | Date;
  total_sales_amount: number;
  total_transactions: number;
  completed_transactions: number;
  cancelled_transactions: number;
  total_items_sold: number;
  total_cost: number;
  gross_profit: number;
  payment_breakdown: string; // JSON string
  top_products: string; // JSON string
  cashier_summary?: string | null; // JSON string
  status: "generated" | "dispatched" | "failed";
  dispatch_logs?: string | null; // JSON string
  created_by?: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
}
