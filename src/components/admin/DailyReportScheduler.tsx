"use client";

import { useEffect } from "react";


/**
 * DailyReportScheduler auto-checks at business closing time if a daily sales report needs to be auto-dispatched.
 */
export function DailyReportScheduler() {
  useEffect(() => {
    let timerId: NodeJS.Timeout;

    const runCheck = async () => {
      try {
        // await checkAndSendEODReportAuto();
      } catch (err) {
        // Silent background check
      }
    };

    // Run check immediately on mount
    runCheck();

    // Re-check every 15 minutes (900,000 ms)
    timerId = setInterval(runCheck, 15 * 60 * 1000);

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, []);

  return null;
}
