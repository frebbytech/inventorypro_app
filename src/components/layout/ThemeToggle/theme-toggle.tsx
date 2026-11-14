"use client";

import { useState } from "react";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSettings } from "@/actions/settings";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/providers/SettingsProvider";

export default function ThemeToggle() {
  const [isUpdating, setIsUpdating] = useState(false);

  // Destructure the live color state to prevent theme switches from resetting it
  const { accentColor, setTheme } = useSettings();

  const handleThemeChange = async (newTheme: "system" | "light" | "dark") => {
    // Update local theme state immediately for snappy user feedback
    setTheme(newTheme);

    setIsUpdating(true);
    try {
      // Pass BOTH the new theme string AND the current accent color hex code
      // This protects your database record from getting partially overwritten
      const result = await updateSettings({
        theme: newTheme,
        accent_color: accentColor,
      });
    } catch (error) {
      toast.error("Failed to save theme preference", {
        position: "top-right",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isUpdating}>
          {isUpdating ? (
            <Loader2 className="h-[1.2rem] w-[1.2rem] animate-spin" />
          ) : (
            <>
              <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </>
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleThemeChange("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
