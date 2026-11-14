import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUser } from "@/actions/_actions";
import { getUserLogs } from "@/actions/audit-logs";
import { getEmployeeSales } from "@/actions/sales";
import PageContainer from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { currencyFormatter } from "@/config/formatter";
import DeleteEmployee from "./DeleteEmployee";
import EditEmployee from "./EditEmployee";
import EmployeeAuditLog from "./employee-audit-log";
import EmployeeSalesHistory from "./employee-sales-history";
import UpdatePassword from "./UpdatePassword";

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

function initialsOf(firstname?: string | null, lastname?: string | null) {
  const initials = [firstname, lastname]
    .filter(Boolean)
    .map((n) => (n as string)[0])
    .join("")
    .toUpperCase();
  return initials || "?";
}

const ROLE_LABELS: Record<string, string> = { admin: "Administrator" };
const roleLabel = (role?: string | null) =>
  role ? (ROLE_LABELS[role] ?? "Member") : "Guest";

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

export default async function EmployeePage({
  params,
}: {
  params: { id?: string };
}) {
  const { id } = params;
  if (!id) redirect("/admin/employee");

  const [userResult, salesResult, logsResult] = await Promise.all([
    getUser(id),
    getEmployeeSales(id),
    getUserLogs(id),
  ]);

  if (!userResult.success || !userResult.data) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div>
            <h2 className="text-xl font-semibold">Employee not found</h2>
            <p className="text-sm text-muted-foreground">
              {userResult.message || "This employee may have been removed."}
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/employee">Back to employees</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const user = userResult.data;
  const sales = salesResult.success ? (salesResult.data ?? []) : [];
  const logs = logsResult.success ? (logsResult.data ?? []) : [];

  const totalSales = sales.length;
  const totalRevenue = sales.reduce(
    (sum, sale) => sum + (Number(sale.total_amount) || 0),
    0,
  );
  const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
  // Assumes `sales` is sorted most-recent-first, as the original page did.
  const lastSaleDate = sales[0]?.sale_date ?? null;

  const joined = formatDate(user.created_at);
  const lastSignedIn = formatDate(user.lastSignedIn, "PPP p");
  const updated = formatDate(user.updated_at);

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/employee">
              <ArrowLeft aria-hidden className="size-4" />
              <span className="sr-only">Back to employees</span>
            </Link>
          </Button>
          <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
            <Heading
              title="Employee Details"
              description="View and manage this employee."
            />
            <div className="flex flex-wrap items-center gap-2">
              <EditEmployee user={user} />
              <UpdatePassword id={user.id} />
              <DeleteEmployee id={user.id} />
            </div>
          </div>
        </header>

        {/* Employee summary */}
        <section className="rounded-xl border bg-card">
          <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted text-lg font-semibold text-muted-foreground">
              {initialsOf(user.firstname, user.lastname)}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">
                  {user.firstname} {user.lastname}
                </h1>
                <Badge variant="secondary">{roleLabel(user.role)}</Badge>
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono">{user.id}</span>
                {joined && <span>Joined {joined}</span>}
                {user.phonenumber && <span>{user.phonenumber}</span>}
              </p>
            </div>
          </div>

          {/* Key figures */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border lg:grid-cols-4">
            <KpiCell label="Total sales">
              {countFormat.format(totalSales)}
            </KpiCell>
            <KpiCell label="Revenue generated">
              {currencyFormatter(totalRevenue)}
            </KpiCell>
            <KpiCell label="Average order">
              {currencyFormatter(averageOrderValue)}
            </KpiCell>
            <KpiCell label="Last sale">
              {formatDate(lastSaleDate) ?? "—"}
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
              <Detail label="Email">
                <a href={`mailto:${user.email}`} className="hover:underline">
                  {user.email}
                </a>
              </Detail>
              <Detail label="Phone">
                {user.phonenumber ? (
                  <a
                    href={`tel:${user.phonenumber}`}
                    className="hover:underline"
                  >
                    {user.phonenumber}
                  </a>
                ) : (
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
              <Detail label="Username">{user.username}</Detail>
              <Detail label="Last signed in">
                {lastSignedIn ?? (
                  <span className="text-muted-foreground">Never</span>
                )}
              </Detail>
              <Detail label="Last updated">
                {updated ?? (
                  <span className="text-muted-foreground">Unknown</span>
                )}
              </Detail>
            </dl>
          </section>
        </div>

        {/* Tabs */}
        <div className="space-y-4">
          <Tabs defaultValue="sales">
            <TabsList className="grid w-full max-w-sm grid-cols-2">
              <TabsTrigger value="sales">Sales History</TabsTrigger>
              <TabsTrigger value="logs">Audit Logs</TabsTrigger>
            </TabsList>

            {/* Sales History Tab */}
            <TabsContent value="sales">
              <EmployeeSalesHistory sales={sales} />
            </TabsContent>

            {/* Audit Logs Tab */}
            <TabsContent value="logs">
              <EmployeeAuditLog logs={logs} />
            </TabsContent>
          </Tabs>
        </div>
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
//   Mail,
//   Phone,
//   ShoppingBag,
//   Activity,
// } from "lucide-react";
// import { format } from "date-fns";
// import { currencyFormatter } from "@/config/formatter"; // adjust path
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { Separator } from "@/components/ui/separator";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// import PageContainer from "@/components/layout/page-container";
// import { Heading } from "@/components/ui/heading";
// import EditEmployee from "./EditEmployee";
// import DeleteEmployee from "./DeleteEmployee";
// import UpdatePassword from "./UpdatePassword";
// import EmployeeSalesTable from "./EmployeeSalesTable";
// import EmployeeLogsTable from "./EmployeeLogsTable";
// import { getUser } from "@/actions/_actions";
// import { getUserLogs } from "@/actions/audit-logs";
// import { getEmployeeSales } from "@/actions/sales";

// export default async function EmployeePage({
//   params,
// }: {
//   params: { id?: string };
// }) {
//   if (!params?.id) {
//     redirect("/admin/employee");
//   }

//   // Fetch all data in parallel
//   const [userResult, salesResult, logsResult] = await Promise.all([
//     getUser(params.id),
//     getEmployeeSales(params.id),
//     getUserLogs(params.id),
//   ]);

//   if (!userResult.success) {
//     return (
//       <PageContainer>
//         <div className="text-center py-12">
//           <h2 className="text-2xl font-semibold text-red-500">
//             Employee not found
//           </h2>
//           <p className="text-muted-foreground">{userResult.message}</p>
//           <Button asChild className="mt-4">
//             <Link href="/admin/employee">Go back</Link>
//           </Button>
//         </div>
//       </PageContainer>
//     );
//   }

//   const user = userResult.data;
//   const sales = salesResult.success ? salesResult.data : [];
//   const logs = logsResult.success ? logsResult.data : [];

//   // console.log(logs)

//   // Summary stats from sales
//   const totalSales = sales.length;
//   const totalRevenue = sales.reduce(
//     (sum, sale) => sum + (Number(sale.total_amount) || 0),
//     0,
//   );
//   const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
//   const lastSaleDate = sales.length > 0 ? sales[0].sale_date : null;

//   const joinedDate = user.created_at
//     ? format(new Date(user.created_at), "PPP")
//     : "N/A";

//   const initials =
//     user.firstname && user.lastname
//       ? `${user.firstname[0]}${user.lastname[0]}`.toUpperCase()
//       : user.firstname?.[0]?.toUpperCase() || "?";

//   const roleBadgeColor =
//     user.role === "admin" ? "bg-purple-500" : "bg-blue-500";

//   return (
//     <PageContainer>
//       <div className="space-y-6">
//         {/* Header with back button and actions */}
//         <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
//           {/* Left Section: Back Button and Typography */}
//           <div className="flex items-start gap-3 sm:items-center sm:gap-4">
//             <Button
//               variant="ghost"
//               size="icon"
//               asChild
//               className="shrink-0 mt-1 sm:mt-0"
//             >
//               <Link href="/admin/employee">
//                 <ArrowLeft className="h-4 w-4" />
//               </Link>
//             </Button>
//             <Heading
//               title="Employee Details"
//               description="View and manage employee information. Discover more about employees and the contributions to our team."
//             />
//           </div>

//           {/* Right Section: Action Buttons */}
//           <div className="flex flex-wrap items-center gap-2 sm:justify-end">
//             <EditEmployee user={user} />
//             <UpdatePassword id={user.id} />
//             <DeleteEmployee id={user.id} />
//           </div>
//         </div>

//         {/* <Separator /> */}

//         {/* Profile Card */}
//         <Card>
//           <CardHeader className="pb-4">
//             <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
//               {/* Avatar */}
//               <div className="flex-shrink-0 self-center md:self-auto">
//                 <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
//                   {initials}
//                 </div>
//               </div>

//               <div className="flex-1 space-y-1">
//                 <div className="flex items-center gap-3 flex-wrap">
//                   <h2 className="text-2xl font-bold">
//                     {user.firstname} {user.lastname}
//                   </h2>
//                   <Badge
//                     variant="outline"
//                     className={`text-white ${roleBadgeColor}`}
//                   >
//                     {user?.role
//                       ? user.role === "admin"
//                         ? "Administrator"
//                         : "Member"
//                       : "Guest"}{" "}
//                   </Badge>
//                 </div>
//                 <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
//                   <span className="flex items-center gap-1">
//                     <User className="h-4 w-4" />
//                     ID: {user.id}
//                   </span>
//                   <span className="flex items-center gap-1">
//                     <Calendar className="h-4 w-4" />
//                     Joined {joinedDate}
//                   </span>
//                   {user.phonenumber && (
//                     <span className="flex items-center gap-1">
//                       <Phone className="h-4 w-4" />
//                       {user.phonenumber}
//                     </span>
//                   )}
//                 </div>
//               </div>
//             </div>
//           </CardHeader>

//           <CardContent className="space-y-6">
//             {/* Contact and account details */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//               <div className="space-y-3">
//                 <h4 className="text-sm font-medium text-muted-foreground">
//                   Contact Information
//                 </h4>
//                 <div className="space-y-2 text-sm">
//                   <div className="flex items-center gap-3">
//                     <Mail className="h-4 w-4 text-muted-foreground" />
//                     <span>{user.email}</span>
//                   </div>
//                   {user.phonenumber && (
//                     <div className="flex items-center gap-3">
//                       <Phone className="h-4 w-4 text-muted-foreground" />
//                       <span>{user.phonenumber}</span>
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
//                     <span>Username: {user.username}</span>
//                   </div>
//                   {user.lastSignedIn && (
//                     <div className="flex items-center gap-3">
//                       <Calendar className="h-4 w-4 text-muted-foreground" />
//                       <span>
//                         Last signed in:{" "}
//                         {format(new Date(user.lastSignedIn), "PPP p")}
//                       </span>
//                     </div>
//                   )}
//                   {user.updated_at && (
//                     <div className="flex items-center gap-3">
//                       <Calendar className="h-4 w-4 text-muted-foreground" />
//                       <span>
//                         Last updated: {format(new Date(user.updated_at), "PPP")}
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
//                   Total Sales
//                 </span>
//                 <span className="text-lg md:text-xl font-bold">
//                   {totalSales}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Revenue Generated
//                 </span>
//                 <span className="text-lg md:text-xl font-bold">
//                   {currencyFormatter(totalRevenue)}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">
//                   Average Order Value
//                 </span>
//                 <span className="text-lg md:text-xl font-bold">
//                   {currencyFormatter(averageOrderValue)}
//                 </span>
//               </div>
//               <div className="flex flex-col">
//                 <span className="text-sm text-muted-foreground">Last Sale</span>
//                 <span className="text-lg md:text-xl font-bold">
//                   {lastSaleDate ? format(new Date(lastSaleDate), "PPP") : "—"}
//                 </span>
//               </div>
//             </div>
//           </CardContent>
//         </Card>

//         {/* Tabs */}
//         <div className="space-y-4">
//           <Tabs defaultValue="overview">
//             <TabsList className="grid w-full max-w-md grid-cols-3">
//               <TabsTrigger value="overview">Overview</TabsTrigger>
//               <TabsTrigger value="sales">Sales History</TabsTrigger>
//               <TabsTrigger value="logs">Audit Logs</TabsTrigger>
//             </TabsList>

//             {/* Overview Tab */}
//             <TabsContent value="overview" className="space-y-4">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Employee Insights</CardTitle>
//                   <CardDescription>
//                     Additional details and performance metrics.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
//                     <div>
//                       <span className="font-medium">Role:</span>{" "}
//                       <span className="text-muted-foreground capitalize">
//                         {user.role}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="font-medium">Total sales:</span>{" "}
//                       <span className="text-muted-foreground">
//                         {totalSales}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="font-medium">Total revenue:</span>{" "}
//                       <span className="text-muted-foreground">
//                         {currencyFormatter(totalRevenue)}
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
//                   <CardTitle>Sales History</CardTitle>
//                   <CardDescription>
//                     All sales completed by this employee.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   {sales.length === 0 ? (
//                     <div className="text-center py-8 text-muted-foreground">
//                       <ShoppingBag className="mx-auto h-12 w-12 mb-4" />
//                       <p>No sales recorded for this employee yet.</p>
//                     </div>
//                   ) : (
//                     <EmployeeSalesTable sales={sales} />
//                   )}
//                 </CardContent>
//               </Card>
//             </TabsContent>

//             {/* Audit Logs Tab */}
//             <TabsContent value="logs">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Audit Logs</CardTitle>
//                   <CardDescription>
//                     All actions performed by this employee.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   {logs.length === 0 ? (
//                     <div className="text-center py-8 text-muted-foreground">
//                       <Activity className="mx-auto h-12 w-12 mb-4" />
//                       <p>No audit logs found for this employee.</p>
//                     </div>
//                   ) : (
//                     <EmployeeLogsTable logs={logs} />
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
