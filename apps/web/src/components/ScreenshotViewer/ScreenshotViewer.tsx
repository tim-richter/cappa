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
  BadgeCheckIcon,
  Check,
  Eye,
  GitCompare,
  Layers,
  SplitSquareHorizontal,
} from "lucide-react";
import { useState } from "react";
import { Diff } from "./components/Diff";
import { Overlay } from "./components/Overlay";
import { SideBySide } from "./components/SideBySide";
import { Single } from "./components/Single";
import { Split } from "./components/Split";

interface ScreenshotComparisonProps {
  screenshot: Screenshot;
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
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const queryClient = useQueryClient();

  const { mutate: approveScreenshot } = useMutation({
    mutationFn: (approved: boolean) => {
      return fetch(`/api/screenshots/${screenshot.id}`, {
        method: "POST",
        body: JSON.stringify({ approved }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["screenshot", screenshot.id],
      });
    },
  });

  const handleApprove = () => {
    approveScreenshot(true);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {screenshot.name}
            </h1>
          </div>

          {screenshot.approved && (
            <Badge
              variant="default"
              className="text-green-100 bg-green-800 cursor-default"
            >
              <BadgeCheckIcon /> Approved
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4">
          {!screenshot.approved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleApprove}
                  size="icon"
                  className={`fixed bottom-4 right-4 z-50 rounded-full transition-all size-16 text-green-100 bg-green-800 hover:bg-green-900`}
                >
                  <Check className="size-8" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve</TooltipContent>
            </Tooltip>
          )}

          {/* View Mode Controls */}
          {screenshot.category === "changed" && (
            <div className="flex items-center gap-2">
              {viewModes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <Button
                    key={mode.id}
                    variant={viewMode === mode.id ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode(mode.id as ViewMode)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {mode.label}
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
          <Single screenshotPath={screenshot.actualPath} title="New" />
        )}
        {screenshot.category === "deleted" && (
          <Single screenshotPath={screenshot.expectedPath} title="Deleted" />
        )}
        {screenshot.category === "passed" && (
          <Single screenshotPath={screenshot.actualPath} title="Passed" />
        )}
        {screenshot.category === "changed" && (
          <>
            {viewMode === "side-by-side" && (
              <SideBySide screenshot={screenshot} />
            )}

            {viewMode === "overlay" && (
              <Overlay
                screenshot={screenshot}
                overlayOpacity={overlayOpacity}
                setOverlayOpacity={setOverlayOpacity}
              />
            )}

            {viewMode === "split" && <Split screenshot={screenshot} />}

            {viewMode === "diff-only" && <Diff screenshot={screenshot} />}
          </>
        )}
      </div>
    </div>
  );
}
