import { NavItem } from "@/types";

export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: "dashboard",
    label: "Dashboard",
  },
  {
    title: "Sales",
    href: "/sales",
    icon: "sales",
    label: "sales",
  },
  {
    title: "Suppliers",
    // href: "/admin/supplier",
    icon: "suppliers",
    label: "supplier",
    children: [
      {
        title: "All Suppliers",
        href: "/admin/supplier",
        icon: "bus",
        label: "supplier",
      },
      {
        title: "Transactions",
        href: "/admin/supplier/transactions",
        icon: "supplier_transaction",
        label: "supplier",
      },
    ],
  },
  {
    title: "Products",
    icon: "product",
    label: "product",
    children: [
      {
        title: "Categories",
        href: "/admin/product-category",
        icon: "category",
        label: "category",
      },
      {
        title: "Stocks",
        href: "/admin/product",
        icon: "stocks",
        label: "product",
      },
      // {
      //   title: "Inventories",
      //   href: "/admin/inventory",
      //   icon: "stocks",
      //   label: "product",
      // },
    ],
  },
  {
    title: "Customers",
    href: "/admin/customer",
    icon: "customers",
    label: "customer",
  },
  {
    title: "Employees",
    href: "/admin/employee",
    icon: "employees",
    label: "employee",
  },
  {
    title: "Sales Report",
    icon: "sales_report",
    label: "Sales Report",
    children: [
      {
        title: "Summary",
        href: "/admin/summary",
        icon: "summary",
        label: "summary",
      },
      {
        title: "Employees",
        href: "/admin/summary/employees",
        icon: "employee_report",
      },
      {
        title: "Daily Reports",
        href: "/admin/reports/daily",
        icon: "daily_report",
      },
    ],
  },
  {
    title: "Messages",
    href: "/admin/messages",
    icon: "messages",
    label: "messages",
  },
  {
    title: "Account",
    icon: "account",
    label: "account",
    children: [
      {
        title: "Profile",
        href: "/profile",
        icon: "userPen",
        label: "profile",
      },
      {
        title: "Settings",
        href: "/admin/settings",
        icon: "settings",
      },
    ],
  },
  {
    title: "Logs",
    href: "/logs",
    icon: "logs",
    label: "logs",
  },
];
export const userNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: "dashboard",
    label: "Dashboard",
  },
  {
    title: "Sales",
    href: "/sales",
    icon: "sales",
    label: "sales",
  },

  {
    title: "Sales Report",
    href: "/summary",
    icon: "summary",
    label: "summary",
  },
  {
    title: "Account",
    icon: "account",
    label: "account",
    children: [
      {
        title: "Profile",
        href: "/profile",
        icon: "userPen",
        label: "profile",
      },
    ],
  },
  // {
  //   title: "Logs",
  //   href: "/logs",
  //   icon: "logs",
  //   label: "logs",
  // },
];
