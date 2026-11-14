"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface SidebarSkeletonProps {
  className?: string;
}

export function SidebarSkeleton({ className }: SidebarSkeletonProps) {
  return (
    <div 
      className={cn(
        "flex h-full w-72 flex-col border-r bg-background p-4 justify-between",
        className
      )}
    >
      {/* 1. Header / Navigation Links Group */}
      <div className="space-y-6">
        <div className="px-4 py-2">
          {/* Section Heading Title */}
          <Skeleton className="h-5 w-24" />
        </div>

        {/* 2. Navigation Items List */}
        <nav className="space-y-3 px-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-9 w-full" />
        </nav>
      </div>

      {/* 3. Footer Profile Section Group */}
      <div className="space-y-4 border-t bg-muted/10 p-2 pt-4">
        {/* Avatar + Text Rows Block */}
        <div className="flex items-center gap-3">
          {/* Round User Avatar Shape */}
          <Skeleton className="h-9 w-9 rounded-full" />
          
          {/* Username & Role Stack */}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>

        {/* Divider Segment */}
        <Separator className="bg-muted/40" />

        {/* Logout Button Wireframe */}
        <Skeleton className="h-9 w-full" />

        {/* Copyright Disclaimer Row */}
        <div className="flex justify-center pt-1">
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      </div>
    </div>
  );
}
