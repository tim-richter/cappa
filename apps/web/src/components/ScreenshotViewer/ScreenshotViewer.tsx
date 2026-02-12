import type { Screenshot } from "@cappa/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
  Tooltip,
  TooltipContent,
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
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CategoryBadge } from "../CategoryBadge";
import { Diff } from "./components/Diff";
import { Overlay } from "./components/Overlay";
import { SideBySide } from "./components/SideBySide";
import { Single } from "./components/Single";
import { Split } from "./components/Split";

interface ScreenshotComparisonProps {
  screenshot: Screenshot & { next: string; prev: string };
  onBack: () => void;
}

type ViewMode = "side-by-side" | "overlay" | "split" | "diff-only";

const viewModes = [
  { id: "side-by-side", label: "Side by Side", icon: SplitSquareHorizontal },
  { id: "overlay", label: "Overlay", icon: Layers },
  { id: "split", label: "Split View", icon: GitCompare },
  { id: "diff-only", label: "Diff Only", icon: Eye },
] as const;

export function ScreenshotComparison({
  screenshot,
  onBack,
}: ScreenshotComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const queryClient = useQueryClient();

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
            )}
            {screenshot.next && (
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
              <TooltipContent>Approve</TooltipContent>
            </Tooltip>
          )}

          {/* View Mode Controls */}
          {screenshot.category === "changed" && (
            <div className="flex items-center gap-2 flex-wrap">
              {viewModes.map((mode) => {
                const Icon = mode.icon;
                const isSelected = viewMode === mode.id;
                return (
                  <Button
                    key={mode.id}
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode(mode.id as ViewMode)}
                    className={
                      isSelected
                        ? "gap-2"
                        : "gap-2 text-card-foreground hover:bg-accent hover:text-accent-foreground"
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{mode.label}</span>
                  </Button>
                );
              })}
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

            {viewMode === "overlay" && <Overlay screenshot={screenshot} />}

            {viewMode === "split" && <Split screenshot={screenshot} />}

            {viewMode === "diff-only" && <Diff screenshot={screenshot} />}
          </>
        )}
      </div>
    </div>
  );
}
