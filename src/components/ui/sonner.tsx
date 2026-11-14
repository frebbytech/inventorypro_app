"use client";

import type { ComponentProps } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

// Shared by every toast, whatever its type.
const BASE_TOAST =
  "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:p-4";

// A thin coloured left edge is the only thing that changes between types,
// so success and error are told apart at a glance without a loud, all-over colour.
const TYPE_ACCENTS: Record<string, string> = {
  success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-emerald-500",
  error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-destructive",
  warning: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-amber-500",
  info: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-sky-500",
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group shadow-none"
      toastOptions={{
        classNames: {
          toast: BASE_TOAST,
          success: TYPE_ACCENTS.success,
          error: TYPE_ACCENTS.error,
          warning: TYPE_ACCENTS.warning,
          info: TYPE_ACCENTS.info,

          title: "group-[.toast]:text-sm group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",

          icon: "group-[.toast]:shrink-0",

          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:rounded-md group-[.toast]:px-3",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:hover:bg-accent",
          closeButton:
            "group-[.toast]:bg-background group-[.toast]:border-border group-[.toast]:text-muted-foreground group-[.toast]:hover:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

// "use client"

// import { useTheme } from "next-themes"
// import { Toaster as Sonner } from "sonner"

// type ToasterProps = React.ComponentProps<typeof Sonner>

// const Toaster = ({ ...props }: ToasterProps) => {
//   const { theme = "system" } = useTheme()

//   return (
//     <Sonner
//       theme={theme as ToasterProps["theme"]}
//       className="toaster group"
//       toastOptions={{
//         classNames: {
//           // 💡 Custom styling variables applied to every single toast card container
//           toast:
//             "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-primary group-[.toaster]:border-2 group-[.toaster]:rounded-xl group-[.toaster]:shadow-2xl group-[.toaster]:p-4",
          
//           // 💡 Styles applied to the secondary description text
//           description: 
//             "group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:font-medium",
          
//           // 💡 Styles applied to primary call-to-action buttons
//           actionButton:
//             "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:font-semibold group-[.toast]:rounded-md",
          
//           // 💡 Styles applied to secondary dismissal/cancel buttons
//           cancelButton:
//             "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-accent group-[.toast]:rounded-md",
//         },
//       }}
//       {...props}
//     />
//   )
// }

// export { Toaster }


// "use client"

// import { useTheme } from "next-themes"
// import { Toaster as Sonner } from "sonner"

// type ToasterProps = React.ComponentProps<typeof Sonner>

// const Toaster = ({ ...props }: ToasterProps) => {
//   const { theme = "system" } = useTheme()

//   return (
//     <Sonner
//       theme={theme as ToasterProps["theme"]}
//       className="toaster group"
//       toastOptions={{
//         classNames: {
//           toast:
//             "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
//           description: "group-[.toast]:text-muted-foreground",
//           actionButton:
//             "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
//           cancelButton:
//             "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
//         },
//       }}
//       {...props}
//     />
//   )
// }

// export { Toaster }
