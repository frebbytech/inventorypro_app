          'use client';
          import { Maximize } from "lucide-react";

            import { Button } from "@/components/ui/button";
            import {
              Tooltip,
              TooltipContent,
              TooltipTrigger,
            } from "@/components/ui/tooltip";

            export function FullscreenToggler() {




              const toggleFullscreen = async () => {
                if (typeof window === "undefined") return;

                if (window.api?.theme?.toggleFS) {
                  window.api.theme.toggleFS();
                  return;
                }

                if (document.fullscreenElement) {
                  await document.exitFullscreen();
                } else {
                  await document.documentElement.requestFullscreen();
                }
              };

              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant='ghost'
                      size="icon"
                      aria-label="Toggle fullscreen"
                      className="rounded-full"
                      onClick={toggleFullscreen}
                    >
                      <Maximize />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle fullscreen</TooltipContent>
                </Tooltip>
              );
            }