import React from "react";

export default function PageContainer({
  children,
  scrollable = true,
}: {
  children: React.ReactNode;
  scrollable?: boolean;
}) {
  return (
    <div className="bg-backgroundflex-1 min-h-svh overflow-y-auto overflow-x-hidden px-4 md:px-8">
      {children}
    </div>
  );
}
