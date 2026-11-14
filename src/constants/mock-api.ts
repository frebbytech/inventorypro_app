import _ from "lodash";
import { getUsers } from "@/actions/_actions";
import { getCustomers } from "@/actions/customers";
import { getProducts } from "@/actions/products";
import { getCustomerSaleByCustomerID, getSalesSummary } from "@/actions/sales";
import { getSuppliers } from "@/actions/suppliers";
import {
  AuditLogView,
  CustomerInfoView,
  CustomerSaleView,
  InventoryInfoView,
  ProductCatalogView,
  SaleSummaryView,
  SupplierInfoView,
  User,
} from "@/types/globals";

import { getLogs } from "@/actions/audit-logs";
import { getInventories } from "@/actions/inventory";
import { createDataCatalog } from "@/config/dataFetcher";

export const LOG_CATEGORIES = [
  { label: "Product", value: "product" },
  { label: "Inventory", value: "inventory" },
  { label: "Customer", value: "customer" },
  { label: "Supplier", value: "supplier" },
  { label: "Sale", value: "sale" },
  { label: "Payment", value: "payment" },
  { label: "Product Category", value: "product_category" },
  { label: "User", value: "user" },
];

// Mock user data store

export const getAllUsers = createDataCatalog<User, typeof getUsers>({
  fetchData: getUsers,
  categoryKey: "role",
  searchKeys: ["name", "role", "username"],
});

export const getAllProducts = createDataCatalog<
  ProductCatalogView,
  typeof getProducts
>({
  fetchData: getProducts,
  categoryKey: "category_name",
  searchKeys: ["name", "description", "category_name", "barcode"],

  customFilters: {
    stock: (item, value) => {
      const qty = Number((item as any).stock_quantity) || 0;
      if (value === "in_stock") return qty > 0;
      if (value === "low_stock") return qty >= 0 && qty <= 5;
      return true;
    },
  },
});

export const getAllInventories = createDataCatalog<
  InventoryInfoView,
  typeof getInventories
>({
  fetchData: getInventories,
  categoryKey: "category_name",
  searchKeys: ["name", "description", "category_name"],
});

export const getAllCustomers = createDataCatalog<
  CustomerInfoView,
  typeof getCustomers
>({
  fetchData: getCustomers,
  categoryKey: "name",
  searchKeys: ["name", "user_name", "phonenumber", "email"],
});

export const getAllSuppliers = createDataCatalog<
  SupplierInfoView,
  typeof getSuppliers
>({
  fetchData: getSuppliers,
  categoryKey: "name",
  searchKeys: ["name", "company_name", "phonenumber", "email"],
});

// Mock log data store
export const getAllLogs = createDataCatalog<AuditLogView, typeof getLogs>({
  fetchData: getLogs,
  categoryKey: "entity_type",
  searchKeys: ["entity_type", "action", "user_name"],
});

export const getAllMainCustomerSales = createDataCatalog<
  CustomerSaleView,
  typeof getCustomerSaleByCustomerID
>({
  fetchData: getCustomerSaleByCustomerID,
  categoryKey: "customerName",
  searchKeys: ["customerName", "phoneNumber", "issuerName"],
});

// Mock customer data store

export const getAllSalesSummary = createDataCatalog<
  SaleSummaryView,
  typeof getSalesSummary
>({
  fetchData: getSalesSummary,
  categoryKey: "customer_name",
  searchKeys: ["customer_name", "phonenumber", "user_name"],
  dateKey: "sale_date",
});
