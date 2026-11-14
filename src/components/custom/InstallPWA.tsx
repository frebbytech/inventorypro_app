"use client";

import { useEffect, useState } from "react";

// Extend the window interface to support the experimental install prompt event
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if the app is already running as an installed standalone PWA
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onClickInstall = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!promptInstall) return;

    // Show the browser's native install sheet/dialog
    await promptInstall.prompt();
    
    // Wait for the user to answer the prompt
    const { outcome } = await promptInstall.userChoice;
    
    if (outcome === "accepted") {
      setSupportsPWA(false); // Hide the banner if they installed it
    }
  };

  // Do not render anything if the browser doesn't support it, 
  // if it's already installed, or if the user dismissed the banner.
  if (!supportsPWA || isDismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-md items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-950">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Install Think & Act App
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Access your admin dashboard instantly from your home screen or dock.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setIsDismissed(true)}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
        >
          Dismiss
        </button>
        <button
          onClick={onClickInstall}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Install
        </button>
      </div>
    </div>
  );
}
