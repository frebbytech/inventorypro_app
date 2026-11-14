import type { ReactNode } from "react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/helpers";
import type { User } from "@/types/globals";
import EditProfile from "./EditProfile";

interface ViewProfileProps {
  user: User & { lastSignedIn?: string | null };
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  cashier: "Cashier",
};

const getRoleLabel = (role?: string | null) =>
  role ? (ROLE_LABELS[role] ?? "Member") : "Guest";

/** Renders a date as <time>, or the fallback when it's missing or invalid. */
function DateValue({
  value,
  pattern,
  fallback,
}: {
  value?: string | null;
  pattern: string;
  fallback: string;
}) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return <span className="text-muted-foreground">{fallback}</span>;
  }
  return <time dateTime={date.toISOString()}>{format(date, pattern)}</time>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:gap-4 sm:px-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

const linkClass =
  "rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function ViewProfile({ user }: ViewProfileProps) {
  const fullName = [user.firstname, user.lastname].filter(Boolean).join(" ") || user.username;

  return (
    <div className="container mx-auto px-4 py-6">
      <section
        aria-labelledby="profile-name"
        className="mx-auto max-w-3xl rounded-xl border bg-card"
      >
        <header className="flex flex-col gap-4 border-b px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <div
              aria-hidden
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-foreground"
            >
              {getInitials(user)}
            </div>

            <div className="min-w-0 space-y-1.5">
              <h2 id="profile-name" className="truncate text-xl font-semibold tracking-tight">
                {fullName}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{getRoleLabel(user.role)}</Badge>
                {user.username && (
                  <span className="text-sm text-muted-foreground">@{user.username}</span>
                )}
              </div>
            </div>
          </div>

          <EditProfile user={user} />
        </header>

        <dl className="divide-y">
          <Detail label="Email">
            <a href={`mailto:${user.email}`} className={linkClass}>
              {user.email}
            </a>
          </Detail>

          <Detail label="Phone">
            {user.phonenumber ? (
              <a href={`tel:${user.phonenumber}`} className={linkClass}>
                {user.phonenumber}
              </a>
            ) : (
              <span className="text-muted-foreground">Not provided</span>
            )}
          </Detail>

          <Detail label="Member since">
            <DateValue value={user?.created_at?.toString()} pattern="PPP" fallback="Unknown" />
          </Detail>

          <Detail label="Last signed in">
            <DateValue value={user.lastSignedIn} pattern="PPP p" fallback="Never" />
          </Detail>

          <Detail label="Account ID">
            {user.id ? (
              // select-all: one click selects the whole ID for copying.
              <span className="font-mono text-sm break-all select-all">{user.id}</span>
            ) : (
              <span className="text-muted-foreground">Unknown</span>
            )}
          </Detail>
        </dl>
      </section>
    </div>
  );
}

// import { User } from "@/types/globals";
// import { format } from "date-fns";
// import { Calendar, Mail, Phone, User as UserIcon } from "lucide-react";
// import { Card, CardContent, CardHeader } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";
// import EditProfile from "./EditProfile";
// import { getInitials } from "@/lib/helpers";

// interface ViewProfileProps {
//   user: User & { lastSignedIn?: string | null };
// }

// export default function ViewProfile({ user }: ViewProfileProps) {

 
 
  
//   // Format dates
//   const joinedDate = user?.created_at
//     ? format(new Date(user?.created_at), "PPP")
//     : "N/A";

//   const lastSignedIn = user?.lastSignedIn
//     ? format(new Date(user?.lastSignedIn), "PPP p")
//     : "Never";

//   // Get initials

//   const roleBadgeColor =
//     user?.role === "admin" ? "bg-purple-500" : "bg-blue-500";

//   return (
//     <div className="container  mx-auto py-6 px-4 space-y-6">
//       {/* Header with title and actions */}

//       <Separator />
//       {/* Profile Card */}
//       <Card>
//         <CardHeader className="pb-4">
//           <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
//             {/* Avatar */}
//             <div className="flex-shrink-0 self-center md:self-auto">
//               <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
//                 {getInitials(user)}
//               </div>
//             </div>

//             <div className="flex-1 space-y-1">
//               <div className="flex flex-col-reverse md:flex-row items-center justify-between gap-3 flex-wrap">
//                 <div className="flex items-center gap-3 flex-wrap">
//                   <h2 className="text-2xl font-bold">
//                     {user?.firstname} {user?.lastname}
//                   </h2>
//                   <Badge
//                     variant="outline"
//                     className={`text-white ${roleBadgeColor}`}
//                   >
//                     {user?.role
//                       ? user?.role === "admin"
//                         ? "Administrator"
//                         : "Member"
//                       : "Guest"}{" "}
//                   </Badge>
//                   <Badge
//                     variant="outline"
//                     className="bg-green-50 text-green-700 border-green-200"
//                   >
//                     Active
//                   </Badge>
//                 </div>
//                 <div className="self-end">
//                   <EditProfile user={user} />
//                 </div>
//               </div>
//               <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
//                 <span className="flex items-center gap-1">
//                   <UserIcon className="h-4 w-4" />@{user?.username}
//                 </span>
//                 <span className="flex items-center gap-1">
//                   <Mail className="h-4 w-4" />
//                   {user?.email}
//                 </span>
//                 {user?.phonenumber && (
//                   <span className="flex items-center gap-1">
//                     <Phone className="h-4 w-4" />
//                     {user?.phonenumber}
//                   </span>
//                 )}
//                 <span className="flex items-center gap-1">
//                   <Calendar className="h-4 w-4" />
//                   Joined {joinedDate}
//                 </span>
//               </div>
//             </div>
//           </div>
//         </CardHeader>

//         <CardContent className="space-y-6">
//           {/* Stats (optional – you can replace with real data) */}
//           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
//             <div className="flex flex-col">
//               <span className="text-sm text-muted-foreground">
//                 Last Signed In
//               </span>
//               <span className=" font-medium">{lastSignedIn}</span>
//             </div>
//             <div className="flex flex-col">
//               <span className="text-sm text-muted-foreground">Role</span>
//               <span className=" font-medium capitalize">
//                  {user?.role
//                       ? user?.role === "admin"
//                         ? "Administrator"
//                         : "Member"
//                       : "Guest"}{" "}
//               </span>
//             </div>
//             <div className="flex flex-col">
//               <span className="text-sm text-muted-foreground">Account ID</span>
//               <span className=" font-medium text-muted-foreground truncate">
//                 {user?.id || "N/A"}
//               </span>
//             </div>
//           </div>

//           <Separator />

//           {/* Detailed Information */}
//           <div className="space-y-4">
//             <h3 className="text-lg font-semibold">Personal Information</h3>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//               <div className="space-y-1">
//                 <label className="text-sm font-medium text-muted-foreground">
//                   First Name
//                 </label>
//                 <p className="p-2 border rounded-lg bg-muted/20">
//                   {user?.firstname}
//                 </p>
//               </div>
//               <div className="space-y-1">
//                 <label className="text-sm font-medium text-muted-foreground">
//                   Last Name
//                 </label>
//                 <p className="p-2 border rounded-lg bg-muted/20">
//                   {user?.lastname}
//                 </p>
//               </div>
//               <div className="space-y-1">
//                 <label className="text-sm font-medium text-muted-foreground">
//                   Username
//                 </label>
//                 <p className="p-2 border rounded-lg bg-muted/20">
//                   {user?.username}
//                 </p>
//               </div>
//               <div className="space-y-1">
//                 <label className="text-sm font-medium text-muted-foreground">
//                   Email Address
//                 </label>
//                 <p className="p-2 border rounded-lg bg-muted/20">
//                   {user?.email}
//                 </p>
//               </div>
//               <div className="space-y-1">
//                 <label className="text-sm font-medium text-muted-foreground">
//                   Phone Number
//                 </label>
//                 <p className="p-2 border rounded-lg bg-muted/20">
//                   {user?.phonenumber || "Not provided"}
//                 </p>
//               </div>
//               <div className="space-y-1">
//                 <label className="text-sm font-medium text-muted-foreground">
//                   Account Created
//                 </label>
//                 <p className="p-2 border rounded-lg bg-muted/20">
//                   {format(new Date(user?.created_at), "PPP")}
//                 </p>
//               </div>
//             </div>
//           </div>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
