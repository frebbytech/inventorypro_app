import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, ShoppingCart } from "lucide-react";

import { getEntityLogs } from "@/actions/audit-logs";
import { getProduct, getProductSales } from "@/actions/products";
import DeleteProduct from "@/components/admin/products/DeleteProduct";
import EditProduct from "@/components/admin/products/EditProduct";
import PageContainer from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currencyFormatter } from "@/config/formatter";
import { SalesTable } from "@/components/admin/products/SalesTable";
import { LogsTable } from "@/components/admin/products/LogsTable";

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

const countFormat = new Intl.NumberFormat("en-GH");
const percentFormat = new Intl.NumberFormat("en-GH", {
  maximumFractionDigits: 1,
});

function formatDate(value: unknown, pattern = "PPP") {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}

function initialsOf(name?: string | null) {
  const initials = (name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return initials || "P";
}

function marginPercent(unitPrice: unknown, costPrice: unknown): number | null {
  const unit = Number(unitPrice);
  const cost = Number(costPrice);
  if (!Number.isFinite(unit) || !Number.isFinite(cost) || cost <= 0)
    return null;
  return ((unit - cost) / cost) * 100;
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function KpiCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col bg-card p-5 sm:p-6">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
        {children}
      </dd>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function Empty({
  icon: Icon,
  children,
}: {
  icon?: typeof ShoppingCart;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      {Icon && <Icon aria-hidden className="size-8 opacity-40" />}
      <p className="text-sm">{children}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id?: string }>;
}) {
  const { id } = await params;
  if (!id) redirect("/admin/product");

  const [productResult, salesResult, logsResult] = await Promise.all([
    getProduct(id),
    getProductSales(id),
    getEntityLogs(id),
  ]);

  if (!productResult.success || !productResult.data) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div>
            <h2 className="text-xl font-semibold">Product not found</h2>
            <p className="text-sm text-muted-foreground">
              {productResult.message || "This product may have been removed."}
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/product">Back to products</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const product = productResult.data;
  const sales = salesResult.success ? (salesResult.data ?? []) : [];
  const logs = logsResult.success ? (logsResult.data ?? []) : [];

  const isActive = Boolean(product.active);
  const stockQuantity = Number(product.stock_quantity) || 0;
  const stockValue = stockQuantity * (Number(product.cost_price) || 0);

  const totalSales = sales.length;
  const totalRevenue = sales.reduce(
    (sum, sale) => sum + (Number(sale.subtotal) || 0),
    0,
  );
  const totalUnitsSold = sales.reduce(
    (sum, sale) => sum + (Number(sale.quantity) || 0),
    0,
  );
  const lastSaleDate = sales[0]?.sale_date ?? null;

  const margin = marginPercent(product.unit_price, product.cost_price);

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/product">
                <ArrowLeft aria-hidden className="size-4" />
                <span className="sr-only">Back to products</span>
              </Link>
            </Button>
            <Heading
              title="Product details"
              description="View and manage this product."
            />
          </div>
          <div className="flex items-center gap-2">
            <EditProduct
              product={{
                id: product.id,
                user_id: product.user_id,
                name: product.name,
                category_id: product.category_id,
                unit_price: product.unit_price,
                cost_price: product.cost_price,
                barcode: product.barcode,
                active: isActive,
                description: product.description,
                stock_quantity: product.stock_quantity,
                photo_url: product.photo_url || null,
                image: product.photo_url || null,
              }}
            />
            <DeleteProduct id={product.id} />
          </div>
        </header>

        {/* Product summary */}
        <section className="rounded-xl border bg-card">
          <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {product.photo_url || product?.image ? (
                <img
                  src={product.photo_url || product?.image || ""}
                  alt={product.name || "Product photo"}
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
                  {initialsOf(product.name)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">
                  {product.name}
                </h1>
                <Badge variant={isActive ? "secondary" : "destructive"}>
                  {isActive ? "Active" : "Disabled"}
                </Badge>
                {product.category_name && (
                  <Badge variant="outline">{product.category_name}</Badge>
                )}
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono">{product.id}</span>
                {formatDate(product.created_at) && (
                  <span>Added {formatDate(product.created_at)}</span>
                )}
                {product.created_by && <span>By {product.created_by}</span>}
              </p>
            </div>
          </div>

          {/* Key figures */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border lg:grid-cols-5">
            <KpiCell label="Cost price">
              {currencyFormatter(product.cost_price)}
            </KpiCell>
            <KpiCell label="Selling price">
              {currencyFormatter(product.unit_price)}
            </KpiCell>
            <KpiCell label="In stock">
              {countFormat.format(stockQuantity)}
            </KpiCell>
            <KpiCell label="Stock value">
              {currencyFormatter(stockValue)}
            </KpiCell>
            <KpiCell label="Units sold">
              {countFormat.format(totalUnitsSold)}
            </KpiCell>
          </dl>
        </section>

     <dl className="grid grid-cols-1 sm:grid-cols-2 overflow-hidden rounded-b-xl  ">

         
        {product.description && (
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <h2 className="text-sm font-medium text-muted-foreground">
              Description
            </h2>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
              {product.description}
            </p>
          </section>
        )}

        {product.barcode && (
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <h2 className="text-sm font-medium text-muted-foreground">
              Barcode
            </h2>
            <p className="mt-2 font-mono text-base tracking-wider">
              {product.barcode}
            </p>
          </section>
        )}   </dl>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sales">Sales history</TabsTrigger>
            <TabsTrigger value="logs">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-4">
            <Panel title="Insights">
              <dl className="divide-y">
                <Detail label="Profit margin">
                  {margin === null ? (
                    <span className="text-muted-foreground">Unknown</span>
                  ) : (
                    `${percentFormat.format(margin)}%`
                  )}
                </Detail>
                <Detail label="Total sales">
                  {countFormat.format(totalSales)}
                </Detail>
                <Detail label="Revenue generated">
                  {currencyFormatter(totalRevenue)}
                </Detail>
                <Detail label="Last sale">
                  {formatDate(lastSaleDate) ?? (
                    <span className="text-muted-foreground">No sales yet</span>
                  )}
                </Detail>
                <Detail label="Last updated">
                  {formatDate(product.updated_at) ?? (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </Detail>
              </dl>
            </Panel>
          </TabsContent>

          <TabsContent value="sales" className="pt-4">
            <Panel
              title="Sales history"
              description="Every sale that included this product."
            >
              {sales.length === 0 ? (
                <Empty icon={ShoppingCart}>
                  No sales recorded for this product yet.
                </Empty>
              ) : (
                <SalesTable sales={sales} />
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="logs" className="pt-4">
            <Panel
              title="Audit log"
              description="Every change made to this product."
            >
              {logs.length === 0 ? (
                <Empty>No audit log entries for this product.</Empty>
              ) : (
                <LogsTable logs={logs} />
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}

// import type { ReactNode } from "react";
// import Image from "next/image";
// import Link from "next/link";
// import { redirect } from "next/navigation";
// import { format } from "date-fns";
// import { ArrowLeft, ShoppingCart } from "lucide-react";

// import { getEntityLogs } from "@/actions/audit-logs";
// import { getProduct, getProductSales } from "@/actions/products";
// import DeleteProduct from "@/components/admin/products/DeleteProduct";
// import EditProduct from "@/components/admin/products/EditProduct";
// import { ProductHover } from "@/components/admin/products/ProductHover";
// import PageContainer from "@/components/layout/page-container";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Heading } from "@/components/ui/heading";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table";
// import { currencyFormatter } from "@/config/formatter";
// import { cn } from "@/lib/utils";

// /* -------------------------------------------------------------------------- */
// /*  Helpers (module scope)                                                    */
// /* -------------------------------------------------------------------------- */

// // Fixed locale avoids server/client hydration mismatches.
// const countFormat = new Intl.NumberFormat("en-GH");
// const percentFormat = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 1 });

// function formatDate(value: unknown, pattern = "PPP") {
//   if (!value) return null;
//   const date = new Date(value as string);
//   return Number.isNaN(date.getTime()) ? null : format(date, pattern);
// }

// function initialsOf(name?: string | null) {
//   const initials = (name ?? "")
//     .split(" ")
//     .filter(Boolean)
//     .map((word) => word[0])
//     .join("")
//     .toUpperCase()
//     .slice(0, 2);
//   return initials || "P";
// }

// /** Undefined until both prices are known and cost isn't zero, rather than "N/A" or Infinity. */
// function marginPercent(unitPrice: unknown, costPrice: unknown): number | null {
//   const unit = Number(unitPrice);
//   const cost = Number(costPrice);
//   if (!Number.isFinite(unit) || !Number.isFinite(cost) || cost <= 0) return null;
//   return ((unit - cost) / cost) * 100;
// }

// /* -------------------------------------------------------------------------- */
// /*  Building blocks (server components: no state, no hooks)                   */
// /* -------------------------------------------------------------------------- */

// function KpiCell({ label, children }: { label: string; children: ReactNode }) {
//   return (
//     <div className="flex flex-col bg-card p-5 sm:p-6">
//       <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
//       <dd className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
//         {children}
//       </dd>
//     </div>
//   );
// }

// function Panel({
//   title,
//   description,
//   children,
// }: {
//   title: string;
//   description?: string;
//   children: ReactNode;
// }) {
//   return (
//     <section className="rounded-xl border bg-card">
//       <header className="border-b px-5 py-4">
//         <h2 className="text-base font-semibold tracking-tight">{title}</h2>
//         {description && <p className="text-sm text-muted-foreground">{description}</p>}
//       </header>
//       <div className="p-5">{children}</div>
//     </section>
//   );
// }

// function Detail({ label, children }: { label: string; children: ReactNode }) {
//   return (
//     <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
//       <dt className="text-muted-foreground">{label}</dt>
//       <dd className="min-w-0 text-right font-medium">{children}</dd>
//     </div>
//   );
// }

// function Empty({ icon: Icon, children }: { icon?: typeof ShoppingCart; children: ReactNode }) {
//   return (
//     <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
//       {Icon && <Icon aria-hidden className="size-8 opacity-40" />}
//       <p className="text-sm">{children}</p>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /*  Page                                                                      */
// /* -------------------------------------------------------------------------- */

// export default async function ProductPage({ params }: { params: Promise<{ id?: string }> }) {
//   const { id } = await params;
//   if (!id) redirect("/admin/product");

//   const [productResult, salesResult, logsResult] = await Promise.all([
//     getProduct(id),
//     getProductSales(id),
//     getEntityLogs(id),
//   ]);

//   if (!productResult.success || !productResult.data) {
//     return (
//       <PageContainer>
//         <div className="flex flex-col items-center gap-4 py-16 text-center">
//           <div>
//             <h2 className="text-xl font-semibold">Product not found</h2>
//             <p className="text-sm text-muted-foreground">
//               {productResult.message || "This product may have been removed."}
//             </p>
//           </div>
//           <Button asChild>
//             <Link href="/admin/product">Back to products</Link>
//           </Button>
//         </div>
//       </PageContainer>
//     );
//   }

//   const product = productResult.data;
//   const sales = salesResult.success ? (salesResult.data ?? []) : [];
//   const logs = logsResult.success ? (logsResult.data ?? []) : [];

//   // Boolean-friendly: `active` may come back as a boolean or as 1/0.
//   const isActive = Boolean(product.active);
//   const stockQuantity = Number(product.stock_quantity) || 0;
//   const stockValue = stockQuantity * (Number(product.cost_price) || 0);

//   const totalSales = sales.length;
//   const totalRevenue = sales.reduce((sum, sale) => sum + (Number(sale.subtotal) || 0), 0);
//   const totalUnitsSold = sales.reduce((sum, sale) => sum + (Number(sale.quantity) || 0), 0);
//   // Assumes `sales` is sorted most-recent-first, as the original page did.
//   const lastSaleDate = sales[0]?.sale_date ?? null;

//   const margin = marginPercent(product.unit_price, product.cost_price);

//   return (
//     <PageContainer>
//       <div className="space-y-6">
//         <header className="flex flex-wrap items-center justify-between gap-4">
//           <div className="flex items-center gap-3">
//             <Button variant="ghost" size="icon" asChild>
//               <Link href="/admin/product">
//                 <ArrowLeft aria-hidden className="size-4" />
//                 <span className="sr-only">Back to products</span>
//               </Link>
//             </Button>
//             <Heading title="Product details" description="View and manage this product." />
//           </div>
//           <div className="flex items-center gap-2">
//             <EditProduct
//               product={{
//                 id: product.id,
//                 user_id: product.user_id,
//                 name: product.name,
//                 category_id: product.category_id,
//                 unit_price: product.unit_price,
//                 cost_price: product.cost_price,
//                 active: isActive,
//                 description: product.description,
//                 stock_quantity: product.stock_quantity,
//                 photo_url: product.photo_url || null,
//                 image: product.photo_url || null,
//               }}
//             />
//             <DeleteProduct id={product.id} />
//           </div>
//         </header>

//         {/* Product summary */}
//         <section className="rounded-xl border bg-card">
//           <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6">
//             <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
//               {product.photo_url ? (
//                 <Image
//                   src={product.photo_url}
//                   alt={product.name || "Product photo"}
//                   fill
//                   sizes="64px"
//                   className="object-cover"
//                 />
//               ) : (
//                 <span className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
//                   {initialsOf(product.name)}
//                 </span>
//               )}
//             </div>

//             <div className="min-w-0 flex-1 space-y-1.5">
//               <div className="flex flex-wrap items-center gap-2">
//                 <h1 className="truncate text-xl font-semibold tracking-tight">{product.name}</h1>
//                 <Badge variant={isActive ? "secondary" : "destructive"}>
//                   {isActive ? "Active" : "Disabled"}
//                 </Badge>
//                 {product.category_name && <Badge variant="outline">{product.category_name}</Badge>}
//               </div>
//               <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
//                 <span className="font-mono">{product.id}</span>
//                 {formatDate(product.created_at) && <span>Added {formatDate(product.created_at)}</span>}
//                 {product.created_by && <span>By {product.created_by}</span>}
//               </p>
//             </div>
//           </div>

//           {/* Key figures */}
//           <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border lg:grid-cols-5">
//             <KpiCell label="Cost price">{currencyFormatter(product.cost_price)}</KpiCell>
//             <KpiCell label="Selling price">{currencyFormatter(product.unit_price)}</KpiCell>
//             <KpiCell label="In stock">{countFormat.format(stockQuantity)}</KpiCell>
//             <KpiCell label="Stock value">{currencyFormatter(stockValue)}</KpiCell>
//             <KpiCell label="Units sold">{countFormat.format(totalUnitsSold)}</KpiCell>
//           </dl>
//         </section>

//         {product.description && (
//           <section className="rounded-xl border bg-card p-5 sm:p-6">
//             <h2 className="text-sm font-medium text-muted-foreground">Description</h2>
//             <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{product.description}</p>
//           </section>
//         )}

//         <Tabs defaultValue="overview">
//           <TabsList>
//             <TabsTrigger value="overview">Overview</TabsTrigger>
//             <TabsTrigger value="sales">Sales history</TabsTrigger>
//             <TabsTrigger value="logs">Audit log</TabsTrigger>
//           </TabsList>

//           <TabsContent value="overview" className="pt-4">
//             <Panel title="Insights">
//               <dl className="divide-y">
//                 <Detail label="Profit margin">
//                   {margin === null ? (
//                     <span className="text-muted-foreground">Unknown</span>
//                   ) : (
//                     `${percentFormat.format(margin)}%`
//                   )}
//                 </Detail>
//                 <Detail label="Total sales">{countFormat.format(totalSales)}</Detail>
//                 <Detail label="Revenue generated">{currencyFormatter(totalRevenue)}</Detail>
//                 <Detail label="Last sale">
//                   {formatDate(lastSaleDate) ?? <span className="text-muted-foreground">No sales yet</span>}
//                 </Detail>
//                 <Detail label="Last updated">
//                   {formatDate(product.updated_at) ?? <span className="text-muted-foreground">Unknown</span>}
//                 </Detail>
//               </dl>
//             </Panel>
//           </TabsContent>

//           <TabsContent value="sales" className="pt-4">
//             <Panel title="Sales history" description="Every sale that included this product.">
//               {sales.length === 0 ? (
//                 <Empty icon={ShoppingCart}>No sales recorded for this product yet.</Empty>
//               ) : (
//                 <div className="-mx-5 overflow-x-auto sm:-mx-6">
//                   <Table>
//                     <TableHeader>
//                       <TableRow>
//                         <TableHead className="pl-5 sm:pl-6">Date</TableHead>
//                         <TableHead>Customer</TableHead>
//                         <TableHead className="text-right">Quantity</TableHead>
//                         <TableHead className="text-right">Unit price</TableHead>
//                         <TableHead className="text-right">Subtotal</TableHead>
//                         <TableHead className="pr-5 sm:pr-6">Sold by</TableHead>
//                       </TableRow>
//                     </TableHeader>
//                     <TableBody>
//                       {sales.map((sale) => (
//                         <TableRow key={sale.id}>
//                           <TableCell className="pl-5 whitespace-nowrap sm:pl-6">
//                             {formatDate(sale.sale_date) ?? "Unknown"}
//                           </TableCell>
//                           <TableCell>{sale.customer_name || "Guest"}</TableCell>
//                           <TableCell className="text-right tabular-nums">
//                             {countFormat.format(Number(sale.quantity) || 0)}
//                           </TableCell>
//                           <TableCell className="text-right tabular-nums">
//                             {currencyFormatter(sale.unit_price)}
//                           </TableCell>
//                           <TableCell className="text-right font-medium tabular-nums">
//                             {currencyFormatter(sale.subtotal)}
//                           </TableCell>
//                           <TableCell className="pr-5 text-muted-foreground sm:pr-6">
//                             {sale.created_by || "System"}
//                           </TableCell>
//                         </TableRow>
//                       ))}
//                     </TableBody>
//                   </Table>
//                 </div>
//               )}
//             </Panel>
//           </TabsContent>

//           <TabsContent value="logs" className="pt-4">
//             <Panel title="Audit log" description="Every change made to this product.">
//               {logs.length === 0 ? (
//                 <Empty>No audit log entries for this product.</Empty>
//               ) : (
//                 <div className="-mx-5 overflow-x-auto sm:-mx-6">
//                   <Table>
//                     <TableHeader>
//                       <TableRow>
//                         <TableHead className="pl-5 sm:pl-6">Action</TableHead>
//                         <TableHead>Date</TableHead>
//                         <TableHead>Before</TableHead>
//                         <TableHead>After</TableHead>
//                         <TableHead>IP address</TableHead>
//                         <TableHead className="pr-5 sm:pr-6">By</TableHead>
//                       </TableRow>
//                     </TableHeader>
//                     <TableBody>
//                       {logs.map((log) => (
//                         <TableRow key={log.id}>
//                           <TableCell className="pl-5 sm:pl-6">
//                             <Badge variant="outline" className="capitalize">
//                               {log.action}
//                             </Badge>
//                           </TableCell>
//                           <TableCell className="whitespace-nowrap text-muted-foreground">
//                             {formatDate(log.created_at, "PPP p") ?? "Unknown"}
//                           </TableCell>
//                           <TableCell className="max-w-40 truncate">
//                             <ProductHover values={log.old_values} />
//                           </TableCell>
//                           <TableCell className="max-w-40 truncate">
//                             <ProductHover values={log.new_values} />
//                           </TableCell>
//                           <TableCell className="text-sm text-muted-foreground">
//                             {log.ip_address || "—"}
//                           </TableCell>
//                           <TableCell className="max-w-32 truncate pr-5 sm:pr-6">
//                             {log.user_name || "—"}
//                           </TableCell>
//                         </TableRow>
//                       ))}
//                     </TableBody>
//                   </Table>
//                 </div>
//               )}
//             </Panel>
//           </TabsContent>
//         </Tabs>
//       </div>
//     </PageContainer>
//   );
// }
