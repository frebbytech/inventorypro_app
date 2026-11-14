"use client";

import Link from "next/link";
import { useMemo, Fragment } from "react";
import { usePathname } from "next/navigation";
import { Home, Slash } from "lucide-react";

import { breadcrumbMap } from "@/lib/breadcrumb";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePlatform } from "@/hooks/use-platform";

function formatSegment(segment: string) {
  return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AppBreadcrumb() {
  const pathname = usePathname();
  const { isDesktop } = usePlatform();

  // const breadcrumbs = useMemo(() => {
  //   if (breadcrumbMap[pathname]) {
  //     return breadcrumbMap[pathname];
  //   }

  //   const segments = pathname.split("/").filter(Boolean);
  //   const result = [];

  //   for (let i = 0; i < segments.length; i++) {
  //     const href = "/" + segments.slice(0, i + 1).join("/");
  //     result.push({
  //       href,
  //       title: formatSegment(segments[i]),
  //     });
  //   }

  //   return result;
  // }, [pathname]);

  const breadcrumbs =
    breadcrumbMap[pathname] ??
    (() => {
      const segments = pathname.split("/").filter(Boolean);

      return segments.map((segment, index) => ({
        href: "/" + segments.slice(0, index + 1).join("/"),
        title: formatSegment(segment),
      }));
    })();

  if (isDesktop || pathname.startsWith("/sales")) {
    return null;
  }

  return (
    <Breadcrumb className="mb-4 pl-6">
      <BreadcrumbList>
        <BreadcrumbItem>
          <Link
            href="/admin"
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4 text-primary" />
          </Link>
        </BreadcrumbItem>

        {breadcrumbs.length > 0 && (
          <BreadcrumbSeparator>
            <Slash />
          </BreadcrumbSeparator>
        )}

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <Fragment key={item.href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-medium">
                    {item.title}
                  </BreadcrumbPage>
                ) : (
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {item.title}
                  </Link>
                )}
              </BreadcrumbItem>

              {!isLast && (
                <BreadcrumbSeparator>
                  <Slash />
                </BreadcrumbSeparator>
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
