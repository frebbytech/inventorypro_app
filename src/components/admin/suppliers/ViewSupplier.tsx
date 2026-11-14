"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currencyFormatter } from "@/config/formatter";
import PageContainer from "@/components/layout/page-container";
import type { SupplierInfoView } from "@/types/globals";
import EditSupplier from "./EditSupplier";
import SupplierTransactionListingPage from "./SupplierTransactionListingPage";
import { supplierStatsQuery } from "./supplier-transaction-queries";

type ViewSupplierProps = {
  supplier: SupplierInfoView;
};

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
  return initials || "?";
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

function KpiSkeleton() {
  return (
    <div className="flex flex-col bg-card p-5 sm:p-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
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
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function ViewSupplier({ supplier }: ViewSupplierProps) {
  const statsQuery = useQuery(supplierStatsQuery(supplier.id));

  const isActive = Boolean(supplier.is_active);
  const joined = formatDate(supplier.created_at);
  const updated = formatDate(supplier.updated_at);

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/supplier">
              <ArrowLeft aria-hidden className="size-4" />
              <span className="sr-only">Back to suppliers</span>
            </Link>
          </Button>
          <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
            <Heading title="Supplier Details" description="View and manage this supplier." />
            <EditSupplier
              supplier={{
                id: supplier.id,
                name: supplier.name,
                email: supplier.email || "",
                company_name: supplier.company_name || "",
                address: supplier.address || "",
                phonenumber: supplier.phonenumber || "",
                user_id: supplier.user_id || "",
                is_active: supplier.is_active,
              }}
            />
          </div>
        </header>

        {/* Supplier summary */}
        <section className="rounded-xl border bg-card">
          <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted text-lg font-semibold text-muted-foreground">
              {initialsOf(supplier.name)}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{supplier.name}</h1>
                <Badge variant={isActive ? "secondary" : "destructive"}>
                  {isActive ? "Active" : "Disabled"}
                </Badge>
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {supplier.company_name && supplier.company_name !== supplier.name && (
                  <span>{supplier.company_name}</span>
                )}
                {joined && <span>Joined {joined}</span>}
              </p>
            </div>
          </div>

          {/* Key figures */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border lg:grid-cols-4">
            {statsQuery.isPending ? (
              <>
                <KpiSkeleton />
                <KpiSkeleton />
                <KpiSkeleton />
                <KpiSkeleton />
              </>
            ) : statsQuery.isError ? (
              <div className="col-span-2 flex items-center justify-between gap-3 bg-card p-5 text-sm sm:p-6 lg:col-span-4">
                <span className="text-muted-foreground">Couldn't load purchase stats.</span>
                <Button variant="outline" size="sm" onClick={() => void statsQuery.refetch()}>
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <KpiCell label="Total purchases">{countFormat.format(statsQuery.data.totalPurchases)}</KpiCell>
                <KpiCell label="Total spent">{currencyFormatter(statsQuery.data.totalSpent)}</KpiCell>
                <KpiCell label="Products supplied">
                  {countFormat.format(statsQuery.data.productsSupplied)}
                </KpiCell>
                <KpiCell label="Last order">
                  {formatDate(statsQuery.data.lastOrderDate, "MMM d, yyyy") ?? "—"}
                </KpiCell>
              </>
            )}
          </dl>
        </section>

        {/* Contact & business details */}
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border bg-card">
            <header className="border-b px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight">Contact</h2>
            </header>
            <dl className="divide-y px-5">
              <Detail label="Phone">
                {supplier.phonenumber ? (
                  <a href={`tel:${supplier.phonenumber}`} className="hover:underline">
                    {supplier.phonenumber}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not provided</span>
                )}
              </Detail>
              <Detail label="Email">
                {supplier.email ? (
                  <a href={`mailto:${supplier.email}`} className="hover:underline">
                    {supplier.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not provided</span>
                )}
              </Detail>
              <Detail label="Address">
                {supplier.address || <span className="text-muted-foreground">Not provided</span>}
              </Detail>
            </dl>
          </section>

          <section className="rounded-xl border bg-card">
            <header className="border-b px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight">Business details</h2>
            </header>
            <dl className="divide-y px-5">
              <Detail label="Company">
                {supplier.company_name || <span className="text-muted-foreground">Not provided</span>}
              </Detail>
              <Detail label="Added by">{supplier.user_name || "System"}</Detail>
              <Detail label="Last updated">
                {updated ?? <span className="text-muted-foreground">Unknown</span>}
              </Detail>
            </dl>
          </section>
        </div>

        <Tabs defaultValue="transactions">
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>
          <TabsContent value="transactions" className="pt-4">
            <SupplierTransactionListingPage supplierId={supplier.id} hideHeader />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}


// "use client";

// import Link from "next/link";
// import {
//   ArrowLeft,
//   Mail,
//   Phone,
//   MapPin,
//   User,
//   Calendar,
//   Building,
//   Package,
// } from "lucide-react";
// import { format } from "date-fns";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Heading } from "@/components/ui/heading";
// import PageContainer from "@/components/layout/page-container";
// import { SupplierInfoView } from "@/types/globals";
// import EditSupplier from "./EditSupplier";

// import SupplierTransactionListingPage from "./SupplierTransactionListingPage";
// import { getSupplierStats } from "@/actions/supplier-transactions";
// import { useEffect, useState } from "react";

// type ViewSupplierProps = {
//   supplier: SupplierInfoView;
// };

// export default function ViewSupplier({ supplier }: ViewSupplierProps) {
//   const [stats, setStats] = useState({
//     totalPurchases: 0,
//     totalSpent: 0,
//     productsSupplied: 0,
//     lastOrderDate: null as string | null,
//   });

//   useEffect(() => {
//     if (supplier?.id) {
//       getSupplierStats(supplier.id).then((res) => {
//         if (res.success && res.data) {
//           setStats(res.data);
//         }
//       });
//     }
//   }, [supplier?.id]);

//   // Safely format dates if they exist
//   const formattedDate = supplier.created_at
//     ? format(new Date(supplier.created_at), "PPP")
//     : "N/A";

//   // Get initials for avatar
//   const initials =
//     supplier.name
//       ?.split(" ")
//       .map((n) => n[0])
//       .join("")
//       .toUpperCase()
//       .slice(0, 2) || "?";

//   // Determine status (example: active if not deleted)
//   const status = supplier.is_active ? "active" : "disabled";

//   // console.log(supplier);

//   return (
//     <PageContainer>
//       <div className="space-y-6">
//         {/* Navigation and header */}
//         <div className="flex items-center justify-between">
//           <div className="flex items-center gap-4">
//             <Button variant="ghost" size="icon" asChild>
//               <Link href="/admin/supplier">
//                 <ArrowLeft className="h-4 w-4" />
//               </Link>
//             </Button>
//             <Heading
//               title="Supplier Details"
//               description="View and manage supplier information"
//               button={
//                 <EditSupplier
//                   supplier={{
//                     id: supplier.id,
//                     name: supplier.name,
//                     email: supplier.email || "",
//                     company_name: supplier.company_name || "",
//                     address: supplier.address || "",
//                     phonenumber: supplier.phonenumber || "",
//                     user_id: supplier.user_id || "",
//                     is_active: supplier.is_active,
//                     // pass other fields if needed
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
//                 <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
//                   {initials}
//                 </div>
//               </div>

//               <div className="flex-1 space-y-1">
//                 <div className="flex items-center gap-3 flex-wrap">
//                   <h2 className="text-2xl font-bold">{supplier.name}</h2>
//                   <Badge
//                     variant={status === "active" ? "default" : "secondary"}
//                     className="capitalize"
//                   >
//                     {status}
//                   </Badge>
//                 </div>
//                 <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
//                   <span className="flex items-center gap-1">
//                     <Building className="h-4 w-4" />
//                     Company: {supplier.company_name || supplier.name}
//                   </span>
//                   <span className="flex items-center gap-1">
//                     <Calendar className="h-4 w-4" />
//                     Joined {formattedDate}
//                   </span>
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
//                 <div className="space-y-2">
//                   {supplier.phonenumber && (
//                     <div className="flex items-center gap-3 text-sm">
//                       <Phone className="h-4 w-4 text-muted-foreground" />
//                       <span>{supplier.phonenumber}</span>
//                     </div>
//                   )}
//                   {supplier.email && (
//                     <div className="flex items-center gap-3 text-sm">
//                       <Mail className="h-4 w-4 text-muted-foreground" />
//                       <span>{supplier.email}</span>
//                     </div>
//                   )}
//                   {supplier.address && (
//                     <div className="flex items-center gap-3 text-sm">
//                       <MapPin className="h-4 w-4 text-muted-foreground" />
//                       <span>{supplier.address}</span>
//                     </div>
//                   )}
//                 </div>
//               </div>

//               {/* Additional info */}
//               <div className="space-y-3">
//                 <h4 className="text-sm font-medium text-muted-foreground">
//                   Business Details
//                 </h4>
//                 <div className="space-y-2 text-sm">
//                   <div className="flex items-center gap-3">
//                     <User className="h-4 w-4 text-muted-foreground" />
//                     <span>Company: {supplier.company_name || "N/A"}</span>
//                   </div>
//                   <div className="flex items-center gap-3">
//                     <User className="h-4 w-4 text-muted-foreground" />
//                     <span>Added by: {supplier.user_name || "System"}</span>
//                   </div>
//                   {supplier.updated_at && (
//                     <div className="flex items-center gap-3">
//                       <Calendar className="h-4 w-4 text-muted-foreground" />
//                       <span>
//                         Last updated:{" "}
//                         {format(new Date(supplier.updated_at), "PPP")}
//                       </span>
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </div>

//             {/* Stats (placeholder – can be replaced with real data) */}
//             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Total Purchases
//                 </span>
//                 <span className="text-xl font-bold">
//                   {stats.totalPurchases}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Total Spent
//                 </span>
//                 <span className="text-xl font-bold">
//                   {" "}
//                   GHS {stats.totalSpent.toFixed(2)}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Products Supplied
//                 </span>
//                 <span className="text-xl font-bold">
//                   {stats.productsSupplied}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Last Order
//                 </span>
//                 <span className="text-xl font-bold">
//                   {" "}
//                   {stats.lastOrderDate
//                     ? format(new Date(stats.lastOrderDate), "MMM d, yyyy")
//                     : "—"}
//                 </span>
//               </div>
//             </div>
//           </CardContent>
//         </Card>

//         {/* Tabs for additional content */}
//         <div className="space-y-4">
//           <Tabs defaultValue="transactions">
//             <TabsList className="grid w-full max-w-md grid-cols-2">
//               <TabsTrigger value="overview">Overview</TabsTrigger>
//               <TabsTrigger value="transactions">Transactions</TabsTrigger>
//             </TabsList>
//             <TabsContent value="overview" className="space-y-4">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>About this supplier</CardTitle>
//                   <CardDescription>
//                     Vendor info and contact details.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-2 text-sm text-muted-foreground">
//                   <p>
//                     <strong>Name:</strong> {supplier.name}
//                   </p>
//                   <p>
//                     <strong>Company:</strong> {supplier.company_name || "N/A"}
//                   </p>
//                   <p>
//                     <strong>Contact Email:</strong> {supplier.email || "N/A"}
//                   </p>
//                   <p>
//                     <strong>Phone:</strong> {supplier.phonenumber || "N/A"}
//                   </p>
//                   <p>
//                     <strong>Address:</strong> {supplier.address || "N/A"}
//                   </p>
//                 </CardContent>
//               </Card>
//             </TabsContent>
//             <TabsContent value="transactions">
//               <SupplierTransactionListingPage
//                 supplierId={supplier.id}
//                 hideHeader={true}
//               />
//             </TabsContent>
//           </Tabs>
//         </div>
//       </div>
//     </PageContainer>
//   );
// }
