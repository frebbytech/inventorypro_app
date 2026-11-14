"use client";

import { useState, useEffect, ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

type Props = {
  productListing: ReactNode; // Server component slot 1
  cartSummary: ReactNode;    // Component slot 2
};

export default function ResponsivePanelWrapper({ productListing, cartSummary }: Props) {
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleScreenChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setOrientation(e.matches ? "vertical" : "horizontal");
    };

    handleScreenChange(mediaQuery);
    mediaQuery.addEventListener("change", handleScreenChange);
    return () => mediaQuery.removeEventListener("change", handleScreenChange);
  }, []);

  return (
    <ResizablePanelGroup
      orientation={orientation}
      className={`gap-4 p-4 flex rounded-md bg-card/70 transition-all ${
        orientation === "vertical" ? "flex-col min-h-[100svh]" : "flex-row"
      }`}
    >
      <ResizablePanel defaultSize={orientation === "horizontal" ? 75 : 100}>
        {productListing}
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={orientation === "horizontal" ? 25 : 0}>
        {cartSummary}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
