"use client";

import { useEffect } from "react";
import { checkAndSendEODReportAuto } from "@/actions/daily-reports";

/**
 * DailyReportScheduler auto-checks at business closing time if a daily sales report needs to be auto-dispatched.
 */
export function DailyReportScheduler() {
  useEffect(() => {
    const runCheck = async () => {
      try {
        await checkAndSendEODReportAuto();
      } catch {
        // Silent background check
      }
    };

    // Run check immediately on mount
    runCheck();

    // Re-check every 15 minutes (900,000 ms)
    const timerId = setInterval(runCheck, 15 * 60 * 1000);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  return null;
}
