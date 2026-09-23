import type { Screenshot } from "@cappa/protocol";
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
  Crosshair,
  Eye,
  GitCompare,
  Layers,
  SplitSquareHorizontal,
  ToggleRight,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServerConfig } from "@/api/hooks";
import { RecaptureButton } from "@/components/Capture/RecaptureButton";
import { isFullyApproved, useApproveBatch } from "@/hooks/useApproveBatch";
import { CategoryBadge } from "../CategoryBadge";
import { Diff } from "./components/Diff";
import {
  InspectPanel,
  InspectProvider,
  useInspectRegionState,
} from "./components/Inspect";
import { SeverityBadge } from "./components/Interpretation";
import { Overlay } from "./components/Overlay";
import { SideBySide } from "./components/SideBySide";
import { Single } from "./components/Single";
import { Split } from "./components/Split";
import { Toggle } from "./components/Toggle";
import { getInitialViewMode, persistViewMode, type ViewMode } from "./viewMode";

interface ScreenshotComparisonProps {
  screenshot: Screenshot;
  /** The screenshot the Next control moves to, if there is one. */
  next?: string;
  /** The screenshot the Prev control moves to, if there is one. */
  prev?: string;
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
  next,
  prev,
  onBack,
}: ScreenshotComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    getInitialViewMode(),
  );
  const {
    regions,
    open: inspectOpen,
    setOpen: setInspectOpen,
    toggleOpen: toggleInspect,
    addRegion,
    updateRegion,
    removeRegion,
    clearRegions,
  } = useInspectRegionState();
  const navigate = useNavigate();
  const { data: config } = useServerConfig();
  // A read-only server refuses approval with a 403, so the control and its
  // shortcut are both withheld rather than offered and failed.
  //
  // Withheld until the server has actually answered, too: defaulting to
  // "allowed" while `/api/config` is in flight put a live approve button and a
  // live `a` shortcut on screen for as long as that request took, on exactly
  // the servers that refuse them.
  const canApprove = config !== undefined && !config.readOnly;

  const handleViewModeChange = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    persistViewMode(nextMode);
  };

  // Approving one screenshot is the batch mutation with a single name. That is
  // what gives this button the success, partial-failure and request-failure
  // toasts the batch bar has — it used to have an inline `useMutation` with no
  // `onError` at all, so a 403 or a 500 left the button looking inert.
  const { mutate: approveBatch } = useApproveBatch();

  const approveScreenshot = useCallback(() => {
    approveBatch([screenshot.name], {
      onSuccess: (result) => {
        // A name the engine refused is reported by the hook and nothing else
        // happens: navigating away from a screenshot that is still there would
        // hide the failure the user has to act on.
        if (!isFullyApproved(result)) {
          return;
        }

        // Approving a `deleted` screenshot accepts the deletion: its baseline
        // is unlinked, and with nothing left in `actual/` or `expected/` the
        // screenshot stops existing. Staying on its URL would leave the open
        // page asking the server for an id it has just been told to forget, so
        // move on — and replace the entry, so Back does not return to a URL
        // that can only 404.
        if (screenshot.category === "deleted") {
          const onwards = next ?? prev;
          if (onwards) {
            navigate(`/screenshots/${onwards}`, { replace: true });
          } else {
            onBack();
          }
        }
      },
    });
  }, [
    approveBatch,
    screenshot.name,
    screenshot.category,
    next,
    prev,
    navigate,
    onBack,
  ]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;

      if (e.key === "ArrowLeft" && prev) {
        navigate(`/screenshots/${prev}`);
      } else if (e.key === "ArrowRight" && next) {
        navigate(`/screenshots/${next}`);
      } else if (e.key === "a" && !screenshot.approved && canApprove) {
        approveScreenshot();
      } else if (e.key === "i") {
        toggleInspect();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    prev,
    next,
    screenshot.approved,
    navigate,
    approveScreenshot,
    canApprove,
    toggleInspect,
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

              {screenshot.category === "changed" &&
                screenshot.diffMeta?.interpretation && (
                  <SeverityBadge
                    severity={screenshot.diffMeta.interpretation.severity}
                  />
                )}

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
            {prev && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-card-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Link to={`/screenshots/${prev}`}>
                      <ArrowLeft className="h-4 w-4" />
                      Prev
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Previous (←)</TooltipContent>
              </Tooltip>
            )}
            {next && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-card-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Link to={`/screenshots/${next}`}>
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
          <RecaptureButton taskId={screenshot.taskId} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={inspectOpen ? "default" : "ghost"}
                size="sm"
                aria-label="Inspect"
                aria-pressed={inspectOpen}
                onClick={toggleInspect}
                className={
                  inspectOpen
                    ? "gap-2"
                    : "gap-2 text-card-foreground hover:bg-accent hover:text-accent-foreground"
                }
              >
                <Crosshair className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Inspect a region (I)</TooltipContent>
          </Tooltip>

          {!screenshot.approved && canApprove && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Approve"
                  onClick={() => approveScreenshot()}
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

      <InspectProvider regions={regions}>
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

        {inspectOpen && (
          <InspectPanel
            regions={regions}
            onAdd={addRegion}
            onUpdate={updateRegion}
            onRemove={removeRegion}
            onClear={clearRegions}
            onClose={() => setInspectOpen(false)}
          />
        )}
      </InspectProvider>
    </div>
  );
}
