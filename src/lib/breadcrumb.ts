// lib/breadcrumbs.ts

import { navItems } from "@/constants/data";

type BreadcrumbItem = {
  title: string;
  href: string;
};

function flattenNav(
  items: typeof navItems,
  parent: BreadcrumbItem[] = [],
): Record<string, BreadcrumbItem[]> {
  const map: Record<string, BreadcrumbItem[]> = {};

  items.forEach((item) => {
    if (item.href) {
      const current = [
        ...parent,
        {
          title: item.title,
          href: item.href,
        },
      ];

      map[item.href] = current;
    }

    if (item.children) {
      const currentParent = item.href
        ? [
            ...parent,
            {
              title: item.title,
              href: item.href,
            },
          ]
        : parent;

      Object.assign(map, flattenNav(item.children, currentParent));
    }
  });

  return map;
}

export const breadcrumbMap = flattenNav(navItems);
