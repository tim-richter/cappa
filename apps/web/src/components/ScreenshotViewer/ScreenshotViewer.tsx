import type { Screenshot } from "@cappa/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ui/components/tooltip";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheckIcon,
  Check,
  Eye,
  GitCompare,
  Layers,
  SplitSquareHorizontal,
  ToggleRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CategoryBadge } from "../CategoryBadge";
import { Diff } from "./components/Diff";
import { Overlay } from "./components/Overlay";
import { SideBySide } from "./components/SideBySide";
import { Single } from "./components/Single";
import { Split } from "./components/Split";
import { Toggle } from "./components/Toggle";
import { getInitialViewMode, persistViewMode, type ViewMode } from "./viewMode";

interface ScreenshotComparisonProps {
  screenshot: Screenshot & { next: string; prev: string };
  onBack: () => void;
}

const viewModes = [
  { id: "side-by-side", label: "Side by Side", icon: SplitSquareHorizontal },
  { id: "toggle-view", label: "Toggle View", icon: ToggleRight },
  { id: "overlay", label: "Overlay", icon: Layers },
  { id: "split", label: "Split View", icon: GitCompare },
  { id: "diff-only", label: "Diff Only", icon: Eye },
] as const;

export function ScreenshotComparison({
  screenshot,
  onBack,
}: ScreenshotComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    getInitialViewMode(),
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleViewModeChange = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    persistViewMode(nextMode);
  };

  const { mutate: approveScreenshot } = useMutation({
    mutationFn: (approved: boolean) => {
      return fetch(`/api/screenshots/${screenshot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ approved }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["screenshot", screenshot.id],
      });
    },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;

      if (e.key === "ArrowLeft" && screenshot.prev) {
        navigate(`/screenshots/${screenshot.prev}`);
      } else if (e.key === "ArrowRight" && screenshot.next) {
        navigate(`/screenshots/${screenshot.next}`);
      } else if (e.key === "a" && !screenshot.approved) {
        approveScreenshot(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    screenshot.prev,
    screenshot.next,
    screenshot.approved,
    navigate,
    approveScreenshot,
  ]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="grid grid-cols-3 items-center p-4 border-b border-border bg-card">
        {/* Left side */}
        <div className="flex items-center gap-3 justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-card-foreground hover:text-card-foreground/80 hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate mt-1">
              {screenshot.name}
            </h1>

            <div className="flex items-center gap-2">
              <CategoryBadge
                category={screenshot.category}
                className="uppercase text-xs"
              />

              {screenshot.approved && (
                <Badge
                  variant="default"
                  className="text-green-100 bg-green-800 dark:bg-green-900/50 dark:text-green-300 cursor-default self-end"
                >
                  <BadgeCheckIcon /> Approved
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Center - Next/Prev buttons */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2">
            {screenshot.prev && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-card-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Link to={`/screenshots/${screenshot.prev}`}>
                      <ArrowLeft className="h-4 w-4" />
                      Prev
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Previous (←)</TooltipContent>
              </Tooltip>
            )}
            {screenshot.next && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-card-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Link to={`/screenshots/${screenshot.next}`}>
                      Next <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Next (→)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4 justify-end">
          {!screenshot.approved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => approveScreenshot(true)}
                  size="icon"
                  className="fixed bottom-4 right-4 z-50 rounded-full transition-all size-16 text-green-100 bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:text-green-100 dark:hover:bg-green-600"
                >
                  <Check className="size-8" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve (A)</TooltipContent>
            </Tooltip>
          )}

          {/* View Mode Controls */}
          {screenshot.category === "changed" && (
            <div className="flex items-center gap-2 flex-wrap">
              <TooltipProvider>
                {viewModes.map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = viewMode === mode.id;

                  return (
                    <Tooltip key={mode.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isSelected ? "default" : "ghost"}
                          size="sm"
                          onClick={() =>
                            handleViewModeChange(mode.id as ViewMode)
                          }
                          aria-label={mode.label}
                          className={
                            isSelected
                              ? "gap-2"
                              : "gap-2 text-card-foreground hover:bg-accent hover:text-accent-foreground"
                          }
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent>{mode.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Content */}
      <div className="flex-1 overflow-hidden p-6">
        {screenshot.category === "new" && (
          <Single screenshotPath={screenshot.actualPath} />
        )}
        {screenshot.category === "deleted" && (
          <Single screenshotPath={screenshot.expectedPath} />
        )}
        {screenshot.category === "passed" && (
          <Single screenshotPath={screenshot.actualPath} />
        )}
        {screenshot.category === "changed" && (
          <>
            {viewMode === "side-by-side" && (
              <SideBySide screenshot={screenshot} />
            )}

            {viewMode === "toggle-view" && <Toggle screenshot={screenshot} />}

            {viewMode === "overlay" && <Overlay screenshot={screenshot} />}

            {viewMode === "split" && <Split screenshot={screenshot} />}

            {viewMode === "diff-only" && <Diff screenshot={screenshot} />}
          </>
        )}
      </div>
    </div>
  );
}
