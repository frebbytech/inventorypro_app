import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

import { getCustomerSaleByCustomerID } from "@/actions/sales";
import { getCustomer } from "@/actions/customers";
import EditCustomer from "@/components/admin/customers/EditCustomer";
import PageContainer from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { currencyFormatter } from "@/config/formatter";
import CustomerPurchaseHistory from "./customer-purchase-history";

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

// Fixed locale avoids server/client hydration mismatches.
const countFormat = new Intl.NumberFormat("en-GH");

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
  return initials || "C";
}

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

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default async function ViewCustomer({
  params,
}: {
  params: { id?: string };
}) {
  const { id } = params;
  if (!id) redirect("/admin/customer");

  const [customerResult, salesResult] = await Promise.all([
    getCustomer(id),
    getCustomerSaleByCustomerID(id),
  ]);

  if (!customerResult.success || !customerResult.data) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div>
            <h2 className="text-xl font-semibold">Customer not found</h2>
            <p className="text-sm text-muted-foreground">
              {customerResult.message || "This customer may have been removed."}
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/customer">Back to customers</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const customer = customerResult.data;
  const sales = salesResult.success ? (salesResult.data ?? []) : [];

  const totalOrders = sales.length;
  const totalSpent = sales.reduce(
    (sum, sale) => sum + (Number(sale.total_amount) || 0),
    0,
  );
  const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
  // Assumes `sales` is sorted most-recent-first, as the original page did.
  const lastPurchaseDate = sales[0]?.sale_date ?? null;

  const joined = formatDate(customer.created_at);
  const updated = formatDate(customer.updated_at);

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/customer">
              <ArrowLeft aria-hidden className="size-4" />
              <span className="sr-only">Back to customers</span>
            </Link>
          </Button>
          <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
            <Heading
              title="Customer details"
              description="View and manage this customer."
            />
            <EditCustomer
              customer={{
                id: customer.id,
                name: customer.name,
                address: customer.address || "",
                phonenumber: customer.phonenumber || "",
              }}
            />
          </div>
        </header>

        {/* Customer summary */}
        <section className="rounded-xl border bg-card">
          <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted text-lg font-semibold text-muted-foreground">
              {initialsOf(customer.name)}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {customer.name}
              </h1>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono">{customer.id}</span>
                {joined && <span>Joined {joined}</span>}
                {customer.phonenumber && <span>{customer.phonenumber}</span>}
              </p>
            </div>
          </div>

          {/* Key figures */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border lg:grid-cols-4">
            <KpiCell label="Total orders">
              {countFormat.format(totalOrders)}
            </KpiCell>
            <KpiCell label="Total spent">
              {currencyFormatter(totalSpent)}
            </KpiCell>
            <KpiCell label="Average order">
              {currencyFormatter(averageOrderValue)}
            </KpiCell>
            <KpiCell label="Last purchase">
              {formatDate(lastPurchaseDate) ?? "—"}
            </KpiCell>
          </dl>
        </section>

        {/* Contact & account details */}
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border bg-card">
            <header className="border-b px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight">
                Contact
              </h2>
            </header>
            <dl className="divide-y px-5">
              <Detail label="Phone">
                {customer.phonenumber ? (
                  <a
                    href={`tel:${customer.phonenumber}`}
                    className="hover:underline"
                  >
                    {customer.phonenumber}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not provided</span>
                )}
              </Detail>
              <Detail label="Address">
                {customer.address || (
                  <span className="text-muted-foreground">Not provided</span>
                )}
              </Detail>
            </dl>
          </section>

          <section className="rounded-xl border bg-card">
            <header className="border-b px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight">
                Account
              </h2>
            </header>
            <dl className="divide-y px-5">
              <Detail label="Added by">{customer.user_name || "System"}</Detail>
              <Detail label="Last updated">
                {updated ?? (
                  <span className="text-muted-foreground">Unknown</span>
                )}
              </Detail>
            </dl>
          </section>
        </div>

        {/* Purchase history */}
        <CustomerPurchaseHistory sales={sales} />
      </div>
    </PageContainer>
  );
}

// import { redirect } from "next/navigation";
// import Link from "next/link";
// import {
//   ArrowLeft,
//   User,
//   Calendar,
//   Phone,
//   MapPin,
//   ShoppingBag,
// } from "lucide-react";
// import { format } from "date-fns";
// import { currencyFormatter } from "@/config/formatter";
// import { getCustomer } from "@/actions/customers"; // adjust import path
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";

// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table";
// import PageContainer from "@/components/layout/page-container";
// import { Heading } from "@/components/ui/heading";
// import EditCustomer from "@/components/admin/customers/EditCustomer";
// import { getCustomerSaleByCustomerID } from "@/actions/sales";
// import CustomerSalesItemsTable from "./CustomerSalesItemsTable";

// export default async function ViewCustomer({
//   params,
// }: {
//   params: { id?: string };
// }) {
//   if (!params?.id) {
//     redirect("/admin/customer");
//   }

//   // Fetch all data in parallel
//   const [customerResult, salesResult] = await Promise.all([
//     getCustomer(params.id),
//     getCustomerSaleByCustomerID(params.id), // returns sales for this customer
//   ]);

//   if (!customerResult.success) {
//     return (
//       <PageContainer>
//         <div className="text-center py-12">
//           <h2 className="text-2xl font-semibold text-red-500">
//             Customer not found
//           </h2>
//           <p className="text-muted-foreground">{customerResult.message}</p>
//           <Button asChild className="mt-4">
//             <Link href="/admin/customer">Go back</Link>
//           </Button>
//         </div>
//       </PageContainer>
//     );
//   }

//   const customer = customerResult.data;
//   const sales = salesResult.success ? salesResult.data : [];

//   // console.log(sales)

//   // Compute summary stats from sales data
//   const totalOrders = sales.length;
//   const totalSpent = sales.reduce(
//     (sum, sale) => sum + (Number(sale.total_amount) || 0),
//     0,
//   );
//   const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
//   const lastPurchaseDate = sales.length > 0 ? sales[0].sale_date : null; // assuming sorted desc

//   // Format dates
//   const joinedDate = customer.created_at
//     ? format(new Date(customer.created_at), "PPP")
//     : "N/A";

//   const initials =
//     customer.name
//       ?.split(" ")
//       .map((n) => n[0])
//       .join("")
//       .toUpperCase()
//       .slice(0, 2) || "C";

//   return (
//     <PageContainer>
//       <div className="space-y-6">
//         {/* Header with back button and actions */}
//         <div className="flex items-center justify-between">
//           <div className="w-full flex items-center gap-4">
//             <Button variant="ghost" size="icon" asChild>
//               <Link href="/admin/customer">
//                 <ArrowLeft className="h-4 w-4" />
//               </Link>
//             </Button>
//             <Heading
//               title="Customer Details"
//               description="View and manage customer information"
//               button={
//                 <EditCustomer
//                   customer={{
//                     id: customer.id,
//                     // user_id: customer.user_id,
//                     name: customer.name,
//                     address: customer?.address || "",
//                     phonenumber: customer?.phonenumber || "",
//                   }}
//                 />
//               }
//             />
//           </div>
//         </div>

//         {/* <Separator /> */}

//         {/* Profile Card */}
//         <Card>
//           <CardHeader className="pb-4">
//             <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
//               {/* Avatar */}
//               <div className="flex-shrink-0">
//                 <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
//                   {initials}
//                 </div>
//               </div>

//               <div className="flex-1 space-y-1">
//                 <h2 className="text-2xl font-bold">{customer.name}</h2>
//                 <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
//                   <span className="flex items-center gap-1">
//                     <User className="h-4 w-4" />
//                     ID: {customer.id}
//                   </span>
//                   <span className="flex items-center gap-1">
//                     <Calendar className="h-4 w-4" />
//                     Joined {joinedDate}
//                   </span>
//                   {customer.phonenumber && (
//                     <span className="flex items-center gap-1">
//                       <Phone className="h-4 w-4" />
//                       {customer.phonenumber}
//                     </span>
//                   )}
//                 </div>
//               </div>
//             </div>
//           </CardHeader>

//           <CardContent className="space-y-6">
//             {/* Contact and address */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//               <div className="space-y-3">
//                 <h4 className="text-sm font-medium text-muted-foreground">
//                   Contact Information
//                 </h4>
//                 <div className="space-y-2 text-sm">
//                   {customer.phonenumber && (
//                     <div className="flex items-center gap-3">
//                       <Phone className="h-4 w-4 text-muted-foreground" />
//                       <span>{customer.phonenumber}</span>
//                     </div>
//                   )}
//                   {customer.address && (
//                     <div className="flex items-center gap-3">
//                       <MapPin className="h-4 w-4 text-muted-foreground" />
//                       <span>{customer.address}</span>
//                     </div>
//                   )}
//                 </div>
//               </div>

//               <div className="space-y-3">
//                 <h4 className="text-sm font-medium text-muted-foreground">
//                   Account Details
//                 </h4>
//                 <div className="space-y-2 text-sm">
//                   <div className="flex items-center gap-3">
//                     <User className="h-4 w-4 text-muted-foreground" />
//                     <span>Added by: {customer.user_name || "System"}</span>
//                   </div>
//                   {customer.updated_at && (
//                     <div className="flex items-center gap-3">
//                       <Calendar className="h-4 w-4 text-muted-foreground" />
//                       <span>
//                         Last updated:{" "}
//                         {format(new Date(customer.updated_at), "PPP")}
//                       </span>
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </div>

//             {/* Summary stats */}
//             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Total Orders
//                 </span>
//                 <span className="text-xl font-bold">{totalOrders}</span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Total Spent
//                 </span>
//                 <span className="text-xl font-bold">
//                   {currencyFormatter(totalSpent)}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Average Order Value
//                 </span>
//                 <span className="text-xl font-bold">
//                   {currencyFormatter(averageOrderValue)}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Last Purchase
//                 </span>
//                 <span className="text-xl font-bold">
//                   {lastPurchaseDate
//                     ? format(new Date(lastPurchaseDate), "PPP")
//                     : "—"}
//                 </span>
//               </div>
//             </div>
//           </CardContent>
//         </Card>

//         {/* Tabs */}
//         <div className="space-y-4">
//           <Tabs defaultValue="overview">
//             <TabsList className="grid w-full max-w-md grid-cols-2">
//               <TabsTrigger value="overview">Overview</TabsTrigger>
//               <TabsTrigger value="sales">Sales History</TabsTrigger>
//             </TabsList>

//             {/* Overview Tab */}
//             <TabsContent value="overview" className="space-y-4">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Customer Insights</CardTitle>
//                   <CardDescription>
//                     Additional details and notes about this customer.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
//                     <div>
//                       <span className="font-medium">Customer since:</span>{" "}
//                       <span className="text-muted-foreground">
//                         {joinedDate}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="font-medium">Total spent:</span>{" "}
//                       <span className="text-muted-foreground">
//                         {currencyFormatter(totalSpent)}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="font-medium">Orders placed:</span>{" "}
//                       <span className="text-muted-foreground">
//                         {totalOrders}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="font-medium">Average order:</span>{" "}
//                       <span className="text-muted-foreground">
//                         {currencyFormatter(averageOrderValue)}
//                       </span>
//                     </div>
//                   </div>
//                 </CardContent>
//               </Card>
//             </TabsContent>

//             {/* Sales History Tab */}
//             <TabsContent value="sales">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Purchase History</CardTitle>
//                   <CardDescription>
//                     All sales transactions made by this customer.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   {sales.length === 0 ? (
//                     <div className="text-center py-8 text-muted-foreground">
//                       <ShoppingBag className="mx-auto h-12 w-12 mb-4" />
//                       <p>No purchases recorded for this customer yet.</p>
//                     </div>
//                   ) : (
//                     <Table>
//                       <TableHeader>
//                         <TableRow>
//                           <TableHead>Sale ID</TableHead>
//                           <TableHead>Date</TableHead>
//                           <TableHead className="text-right">
//                             No. of Items
//                           </TableHead>
//                           <TableHead className="text-right">Total</TableHead>
//                           <TableHead>Payment Mode</TableHead>
//                           <TableHead>Status</TableHead>
//                           <TableHead className="text-right">Actions</TableHead>
//                         </TableRow>
//                       </TableHeader>
//                       <TableBody>
//                         {sales.map((sale) => (
//                           <TableRow key={sale.sale_id || sale.id}>
//                             <TableCell className="font-medium">
//                               {sale.sale_id || sale.id}
//                             </TableCell>
//                             <TableCell>
//                               {format(
//                                 new Date(sale.sale_date || sale.created_at),
//                                 "PPP",
//                               )}
//                             </TableCell>
//                             <TableCell className="text-right font-medium">
//                               {sale.item_count}
//                             </TableCell>
//                             <TableCell className="text-right font-medium">
//                               {currencyFormatter(sale.total_amount)}
//                             </TableCell>
//                             <TableCell className="capitalize">
//                               {sale.payment_mode || "—"}
//                             </TableCell>
//                             <TableCell>
//                               <Badge variant="outline" className="capitalize">
//                                 {sale.status || "completed"}
//                               </Badge>
//                             </TableCell>
//                             <TableCell className="text-right">
//                               <CustomerSalesItemsTable id={sale.sale_id} />
//                             </TableCell>
//                           </TableRow>
//                         ))}
//                       </TableBody>
//                     </Table>
//                   )}
//                 </CardContent>
//               </Card>
//             </TabsContent>
//           </Tabs>
//         </div>
//       </div>
//     </PageContainer>
//   );
// }

// // import PageContainer from "@/components/layout/page-container";
// // import { Card, CardContent } from "@/components/ui/card";
// // import { Separator } from "@/components/ui/separator";
// // import { CustomerInfoView } from "@/types/globals";
// // import React from "react";
// // import { Heading } from "@/components/ui/heading";
// // import EditCustomer from "./EditCustomer";
// // // import { CustomerTransactionListingPage } from "@/sections/customer/view";

// // type ViewCustomerProps = {
// //   customer: CustomerInfoView;
// // };

// // function ViewCustomer({ customer }: ViewCustomerProps) {
// //   return (
// //     <PageContainer>
// //       <div className="space-y-4">
// //         <div className="flex items-start justify-between">
// //           <Heading
// //             title="Customer Information"
// //             description="Manage customers (Server side table functionalities.)"
// //           />
// //         </div>
// //         <Separator />
// //         <Card>
// //           <CardContent>
// //             <div className="flex items-center space-x-4 p-4 bg-gray-100 dark:bg-black">
// //               {/* Avatar */}
// //               <div className="bg-purple-500 rounded-full w-16 h-16 flex items-center justify-center">
// //                 <span className="text-white text-3xl">N</span>
// //               </div>
// //               <div className="flex flex-col">
// //                 <h2 className="text-lg font-semibold">{customer?.name}</h2>
// //                 <p className="text-sm text-gray-500">{customer?.id}</p>
// //                 <p className="text-sm text-gray-500">{customer?.address}</p>
// //                 <p className="text-sm text-gray-500">{customer?.phonenumber}</p>
// //               </div>
// //             </div>

// //             <div className="flex justify-end flex-wrap gap-2 pt-2">
// //               <EditCustomer
// //                 customer={{
// //                   id: customer?.id,
// //                   user_id: customer.user_id,
// //                   name: customer.name,
// //                   address: customer.address,
// //                   phonenumber: customer?.phonenumber,
// //                 }}
// //               />
// //             </div>
// //           </CardContent>
// //         </Card>
// //       </div>
// // {/*
// //       <CustomerTransactionListingPage id={customer?.id} /> */}
// //     </PageContainer>
// //   );
// // }

// // export default ViewCustomer;
