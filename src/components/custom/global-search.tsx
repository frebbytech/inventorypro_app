"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Search, Truck, UserCog, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface GlobalSearchProps {
  canQuickAdd: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Static config (module scope so it isn't rebuilt on every render)          */
/* -------------------------------------------------------------------------- */

const QUICK_ACTIONS = [
  { label: "Add customer", href: "/admin/customer", icon: UserPlus },
  { label: "Add product", href: "/admin/product", icon: Package },
  { label: "Add supplier", href: "/admin/supplier", icon: Truck },
  { label: "Add employee", href: "/admin/employee/new", icon: UserCog },
];

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin" },
  { label: "Analytics & reports", href: "/admin/summary/employees" },
  { label: "Settings", href: "/admin/settings" },
];
const USER_NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Analytics & reports", href: "/summary" },
  { label: "Profile", href: "/profile" },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function GlobalSearch({ canQuickAdd }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Case-insensitive so Caps Lock or Shift+K still opens it, and
      // `repeat` stops a held key from toggling the dialog rapidly.
      if (
        e.key?.toLowerCase() === "k" &&
        (e.metaKey || e.ctrlKey) &&
        !e.repeat
      ) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const runCommand = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="relative h-9 w-full max-w-sm justify-start gap-2 rounded-full bg-muted/50 text-sm font-normal text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden lg:inline">Search or jump to…</span>
        <span className="inline lg:hidden">Search…</span>
        <kbd
          aria-hidden
          className="pointer-events-none absolute top-1.5 right-1.5 hidden h-6 items-center gap-0.5 rounded-full border bg-background px-2 font-mono text-xs font-medium sm:flex"
        >
          <span>⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search or jump to…" />
        <CommandList>
          <CommandEmpty>No matching pages or actions.</CommandEmpty>

          {canQuickAdd && (
            <CommandGroup heading="Quick actions">
              {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
                <CommandItem
                  key={href}
                  value={label}
                  onSelect={() => runCommand(href)}
                >
                  <Icon
                    aria-hidden
                    className="size-4 text-muted-foreground mr-2"
                  />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Navigation">
            {canQuickAdd ? (
              <>
                {NAV_ITEMS.map(({ label, href }) => (
                  <CommandItem
                    key={href}
                    value={label}
                    onSelect={() => runCommand(href)}
                  >
                    {label}
                  </CommandItem>
                ))}
              </>
            ) : (
              <>
                {USER_NAV_ITEMS.map(({ label, href }) => (
                  <CommandItem
                    key={href}
                    value={label}
                    onSelect={() => runCommand(href)}
                  >
                    {label}
                  </CommandItem>
                ))}
              </>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

// "use client";

// import * as React from "react";
// import { Search, UserPlus, PackagePlus, Truck, ShieldAlert } from "lucide-react";
// import { useRouter } from "next/navigation";
// import { Button } from "@/components/ui/button";
// import {
//   CommandDialog,
//   CommandEmpty,
//   CommandGroup,
//   CommandInput,
//   CommandItem,
//   CommandList,
// } from "@/components/ui/command";

// interface SearchProps {
//   canQuickAdd: boolean;
// }

// export function GlobalSearch({ canQuickAdd }: SearchProps) {
//   const [open, setOpen] = React.useState(false);
//   const router = useRouter();

//   React.useEffect(() => {
//     const down = (e: KeyboardEvent) => {
//       if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
//         e.preventDefault();
//         setOpen((open) => !open);
//       }
//     };
//     document.addEventListener("keydown", down);
//     return () => document.removeEventListener("keydown", down);
//   }, []);

//   const runCommand = React.useCallback((command: () => void) => {
//     setOpen(false);
//     command();
//   }, []);

//   return (
//     <>
//       {/* Trigger Button styled like a real search input */}
//       <Button
//         variant="outline"
//         className="relative w-full max-w-sm h-9 justify-start rounded-full bg-muted/50 text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
//         onClick={() => setOpen(true)}
//       >
//         <Search className="mr-2 h-4 w-4" />
//         <span className="hidden lg:inline-flex">Search everything...</span>
//         <span className="inline-flex lg:hidden">Search...</span>
//         <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded-full border bg-background px-2 font-mono text-[10px] font-medium opacity-100 sm:flex">
//           <span className="text-sm">⌘</span>K
//         </kbd>
//       </Button>

//       {/* Live Dialog Autocomplete Popover */}
//       <CommandDialog open={open} onOpenChange={setOpen}>
//         <CommandInput placeholder="Type a command or search..." />
//         <CommandList>
//           <CommandEmpty>No results found.</CommandEmpty>

//           {/* Quick Actions Group - Conditional on permissions */}
//           {canQuickAdd && (
//             <CommandGroup heading="Quick Actions">
//               <CommandItem onSelect={() => runCommand(() => router.push("/admin/customer"))}>
//                 <UserPlus className="mr-2 h-4 w-4" />
//                 <span>Add New Customer</span>
//               </CommandItem>
//               <CommandItem onSelect={() => runCommand(() => router.push("/admin/product"))}>
//                 <PackagePlus className="mr-2 h-4 w-4" />
//                 <span>Add New Product</span>
//               </CommandItem>
//               <CommandItem onSelect={() => runCommand(() => router.push("/admin/supplier"))}>
//                 <Truck className="mr-2 h-4 w-4" />
//                 <span>Add New Supplier</span>
//               </CommandItem>
//               <CommandItem onSelect={() => runCommand(() => router.push("/admin/employee/new"))}>
//                 <ShieldAlert className="mr-2 h-4 w-4" />
//                 <span>Add New Employee</span>
//               </CommandItem>
//             </CommandGroup>
//           )}

//           {/* Core Navigation Auto-Complete Suggestions */}
//           <CommandGroup heading="Navigation">
//             <CommandItem onSelect={() => runCommand(() => router.push("/admin"))}>
//               Dashboard
//             </CommandItem>
//             <CommandItem onSelect={() => runCommand(() => router.push("/admin/summary/employees"))}>
//               Analytics & Reports
//             </CommandItem>
//             <CommandItem onSelect={() => runCommand(() => router.push("/admin/settings"))}>
//               System Settings
//             </CommandItem>
//           </CommandGroup>
//         </CommandList>
//       </CommandDialog>
//     </>
//   );
// }
