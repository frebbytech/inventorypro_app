// hooks/use-platform.ts

"use client";

import { useEffect, useState } from "react";

export function usePlatform() {
  const [platform, setPlatform] = useState<"web" | "desktop">("web");

  useEffect(() => {
    setPlatform(
      typeof window !== "undefined" && !!window.api?.platform
        ? "desktop"
        : "web",
    );
  }, []);

  return {
    platform,
    isDesktop: platform === "desktop",
    isWeb: platform === "web",
  };
}
