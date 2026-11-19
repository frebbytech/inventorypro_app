import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

import { getCustomerSale, getSalesItemsBySalesId } from "@/actions/sales";
import PageContainer from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import { checkRole } from "@/utils/roles";

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

// Fixed locale avoids server/client hydration mismatches.
const countFormat = new Intl.NumberFormat("en-GH");

function formatDate(value: unknown, pattern = "PPP p") {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}

const capitalize = (text?: string | null) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";

function isCompleted(status?: string | null) {
  return !status || status.toLowerCase() === "completed";
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
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

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default async function SalesDetailsPage({ salesId }: { salesId: string }) {
  const isAdmin = await checkRole("admin");
  const backHref = isAdmin ? "/admin/summary" : "/summary";

  if (!salesId) redirect(backHref);

  const [saleResult, itemsResult] = await Promise.all([
    getCustomerSale(salesId),
    getSalesItemsBySalesId(salesId),
  ]);

  if (!saleResult.success || !saleResult.data) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div>
            <h2 className="text-xl font-semibold">Sale not found</h2>
            <p className="text-sm text-muted-foreground">
              {saleResult.message || "This sale may have been removed."}
            </p>
          </div>
          <Button asChild>
            <Link href={backHref}>Back to sales</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const sale = saleResult.data;
  const items = itemsResult.success ? (itemsResult.data ?? []) : [];

  // Falls back to summing the items only if the sale record itself has no total.
  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  const totalAmount = Number(sale.total_amount) || itemsTotal;

  const saleDate = formatDate(sale.sale_date);
  const completed = isCompleted(sale.status);

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={backHref}>
              <ArrowLeft aria-hidden className="size-4" />
              <span className="sr-only">Back to sales</span>
            </Link>
          </Button>
          <Heading title="Sale details" description="A full breakdown of this transaction." />
        </header>

        {/* Sale summary */}
        <section className="rounded-xl border bg-card">
          <div className="flex flex-col gap-2 border-b p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Sale {sale.id}</h1>
              <Badge variant={completed ? "secondary" : "outline"}>
                {capitalize(sale.status || "completed")}
              </Badge>
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{sale.customer_name || "Guest"}</span>
              {saleDate && <span>{saleDate}</span>}
            </p>
          </div>

          {/* Key figures */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border sm:grid-cols-4">
            <KpiCell label="Total">{currencyFormatter(totalAmount)}</KpiCell>
            <KpiCell label="Items">{countFormat.format(items.length)}</KpiCell>
            <KpiCell label="Payment">
              <span className="text-lg sm:text-xl">
                {sale.payment_mode ? capitalize(sale.payment_mode) : "—"}
              </span>
            </KpiCell>
            <KpiCell label="Status">
              <span className="text-lg sm:text-xl">{capitalize(sale.status || "completed")}</span>
            </KpiCell>
          </dl>
        </section>

        {/* Items */}
        <section className="rounded-xl border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="text-base font-semibold tracking-tight">Items sold</h2>
            <p className="text-sm text-muted-foreground">Products included in this sale.</p>
          </header>

          {items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No items found for this sale.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5 sm:pl-6">Product</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="pr-5 text-right sm:pr-6">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.sale_item_id}>
                      <TableCell className="pl-5 font-medium sm:pl-6">{item.product_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {currencyFormatter(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {countFormat.format(Number(item.quantity) || 0)}
                      </TableCell>
                      <TableCell className="pr-5 text-right font-medium tabular-nums sm:pr-6">
                        {currencyFormatter(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="pl-5 font-medium sm:pl-6">
                      Total
                    </TableCell>
                    <TableCell className="pr-5 text-right font-semibold tabular-nums sm:pr-6">
                      {currencyFormatter(totalAmount)}
                    </TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}