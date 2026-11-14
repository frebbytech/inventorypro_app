import { Metadata } from "next";

type RouteMetadata = {
  title: string;
  description: string;
};

// Map your href paths to specific SEO/tab metadata
const routeMetadataMap: Record<string, RouteMetadata> = {
  "/": {
    title: "Dashboard",
    description:
      "Overview of your business metrics, recent activities, and performance.",
  },
  "/admin": {
    title: "Dashboard",
    description:
      "Overview of your business metrics, recent activities, and performance.",
  },
  "/sales": {
    title: "Sales Management",
    description: "Track sales orders, view transactions, and manage revenue.",
  },
  "/admin/supplier": {
    title: "Suppliers",
    description:
      "Manage vendor relationships, supply chains, and contact details.",
  },
  "/admin/product-category": {
    title: "Product Categories",
    description:
      "Organize and classify your inventory items into distinct categories.",
  },
  "/admin/product": {
    title: "Stocks & Products",
    description:
      "Monitor real-time inventory levels, stock updates, and item details.",
  },
  "/admin/customer": {
    title: "Customers",
    description:
      "View customer profiles, purchase history, and engagement data.",
  },
  "/admin/employee": {
    title: "Employees",
    description:
      "Manage team member roles, permissions, and staff directories.",
  },
  "/summary": {
    title: "Sales Summary",
    description:
      "Deep dive analytical reports and breakdowns of seasonal sales data.",
  },
  "/admin/summary": {
    title: "Sales Summary",
    description:
      "Deep dive analytical reports and breakdowns of seasonal sales data.",
  },
  "/profile": {
    title: "My Profile",
    description: "View and edit your personal account profile information.",
  },
  "/admin/settings": {
    title: "System Settings",
    description:
      "Configure portal configurations, preferences, and security options.",
  },
  "/logs": {
    title: "System Logs",
    description: "Review audit trails, security logs, and operational history.",
  },
  "/auth/sign-in": {
    title: "Sign In",
    description: "Access your account securely with your credentials.",
  },
};

/**
 * Generates metadata dynamically for a given path
 */
export function getPageMetadata(pathname: string): Metadata {
  const matchedRoute = routeMetadataMap[pathname];

  // Fallback defaults if the path isn't perfectly matched
  const baseTitle = matchedRoute ? matchedRoute.title : "Admin Portal";
  const description = matchedRoute
    ? matchedRoute.description
    : "Internal management system.";

  return {
    title: {
      template: `%s | InventoryPro`,
      default: `${baseTitle} | InventoryPro`,
    },
    description: description,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}

// (Keep your routeMetadataMap configuration from the previous step here)

type NextJsParams = Promise<{ slug?: string[] }> | { slug?: string[] };

/**
 * Reusable utility to parse Next.js slug params and return the matching metadata object.
 * Works perfectly inside any Next.js generateMetadata() function.
 */
export async function createDynamicMetadata(
  params: NextJsParams,
): Promise<Metadata> {
  // Await the params in case they are passed as a Promise (Next.js 15+ standard)
  const resolvedParams = await params;

  // Convert ['admin', 'supplier'] into '/admin/supplier'
  const pathname = resolvedParams.slug
    ? `/${resolvedParams.slug.join("/")}`
    : "/admin"; // Your default fallback root route

  const matchedRoute = routeMetadataMap[pathname];

  const baseTitle = matchedRoute ? matchedRoute.title : "Management Portal";
  const description = matchedRoute
    ? matchedRoute.description
    : "Secure internal administration dashboard.";

  return {
    title: `${baseTitle} | InventoryPro`,
    description: description,
    openGraph: {
      title: baseTitle,
      description: description,
      type: "website",
    },
  };
}
