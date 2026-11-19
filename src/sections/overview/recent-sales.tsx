import { format } from "date-fns";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { currencyFormatter } from "@/config/formatter";

type RecentSalesProps = {
  data: {
    id: string;
    customer_name: string;
    user_name: string;
    sale_date: Date | string;
    total_amount: string;
    payment_mode: string;
    status: string;
    item_count: number;
  }[];
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  momo: "Mobile money",
  bank: "Bank",
  cheque: "Cheque",
};

const capitalize = (text?: string | null) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";

/** Returns null for a missing or invalid date, instead of letting date-fns throw. */
function formatSaleDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), text: format(date, "MMM d, yyyy 'at' h:mm a") };
}

export function RecentSales({ data }: RecentSalesProps) {
  if (!data?.length) {
    return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No sales yet.</p>;
  }

  return (
    <ul className="divide-y">
      {data.map((sale) => {
        const when = formatSaleDate(sale.sale_date);
        const payment = PAYMENT_LABELS[sale.payment_mode] ?? capitalize(sale.payment_mode ?? "");
        const isCompleted = !sale.status || sale.status.toLowerCase() === "completed";

        return (
          <li key={sale.id} className="flex items-center gap-3 px-5 py-3.5">
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="bg-muted text-xs font-medium text-foreground uppercase">
                {(sale.customer_name ?? "?").slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{sale.customer_name}</p>
              <p className="text-sm text-muted-foreground">
                {when ? <time dateTime={when.iso}>{when.text}</time> : "Unknown date"}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-sm font-medium tabular-nums">{currencyFormatter(sale.total_amount)}</p>
              <p className="text-sm text-muted-foreground">
                {sale.item_count} {sale.item_count === 1 ? "item" : "items"}
                {payment && `, ${payment}`}
                {!isCompleted && (
                  <span className="text-amber-600 dark:text-amber-400">, {sale.status.toLowerCase()}</span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// import { Avatar, AvatarFallback } from "@/components/ui/avatar";
// import { Badge } from "@/components/ui/badge";
// import { currencyFormatter } from "@/config/formatter";
// import { format } from "date-fns";

// type RecentSalesProps = {
//   data: {
//     id: string;
//     customer_name: string;
//     user_name: string;
//     sale_date: Date | string;
//     total_amount: string;
//     payment_mode: string;
//     status: string;
//     item_count: number;
//   }[];
// };

// export function RecentSales({ data }: RecentSalesProps) {


//   return (
//     <div className="space-y-8">
//       {data.map((sale) => {
//         return (
//           <div key={sale.id} className="flex items-center">
//             <Avatar className="h-9 w-9">
//               {/* <AvatarImage src="/avatars/01.png" alt="Avatar" /> */}
//               <AvatarFallback className="uppercase">
//                 {sale?.customer_name?.slice(0, 2)}
//               </AvatarFallback>
//             </Avatar>

//             <div className="ml-4 space-y-1 flex-1">
//               <p className="text-sm font-medium leading-none">
//                 {sale?.customer_name}
//               </p>
//               <p className="text-sm text-muted-foreground">
//                 {format(sale?.sale_date, "PPpp")}
//               </p>
//             </div>
//             <div className="flex gap-2">
//               <Badge>{sale.item_count} item(s)</Badge>
//               <div className="ml-auto font-medium">
//                 {currencyFormatter(sale?.total_amount)}
//               </div>
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }
