"use client";

import { Button } from "@ui/components/button";
import {
  ArrowLeft,
  Eye,
  GitCompare,
  Layers,
  RotateCcw,
  SplitSquareHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import type { Screenshot } from "@/types";

interface ScreenshotComparisonProps {
  screenshot: Screenshot;
  onBack: () => void;
}

type ViewMode = "side-by-side" | "overlay" | "split" | "diff-only";

export function ScreenshotComparison({
  screenshot,
  onBack,
}: ScreenshotComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const viewModes = [
    { id: "side-by-side", label: "Side by Side", icon: SplitSquareHorizontal },
    { id: "overlay", label: "Overlay", icon: Layers },
    { id: "split", label: "Split View", icon: GitCompare },
    { id: "diff-only", label: "Diff Only", icon: Eye },
  ] as const;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.5, 5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.5, 0.25));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom > 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [zoom, pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && zoom > 1) {
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart, zoom],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.min(Math.max(prev * delta, 0.25), 5));
  }, []);

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
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 border border-border rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.25}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 5}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleResetZoom}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* View Mode Controls */}
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
        </div>
      </div>

      {/* Comparison Content */}
      <div
        className="flex-1 overflow-hidden p-6"
        ref={containerRef}
        onWheel={handleWheel}
      >
        {viewMode === "side-by-side" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Before
              </h3>
              <div
                className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {screenshot.actualPath ? (
                  <img
                    src={screenshot.actualPath || "/placeholder.svg"}
                    alt="Before"
                    className="max-w-none rounded border border-border transition-transform"
                    style={{
                      transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                      cursor:
                        zoom > 1
                          ? isDragging
                            ? "grabbing"
                            : "grab"
                          : "default",
                    }}
                    draggable={false}
                  />
                ) : (
                  <div className="text-muted-foreground">
                    No before image available
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                After
              </h3>
              <div
                className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {screenshot.expectedPath ? (
                  <img
                    src={screenshot.expectedPath || "/placeholder.svg"}
                    alt="After"
                    className="max-w-none rounded border border-border transition-transform"
                    style={{
                      transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                      cursor:
                        zoom > 1
                          ? isDragging
                            ? "grabbing"
                            : "grab"
                          : "default",
                    }}
                    draggable={false}
                  />
                ) : (
                  <div className="text-muted-foreground">
                    No after image available
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === "overlay" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Overlay Comparison
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Opacity:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground w-8">
                  {overlayOpacity}%
                </span>
              </div>
            </div>
            <div
              className="bg-muted rounded-lg p-4 min-h-[500px] flex items-center justify-center relative overflow-hidden cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {screenshot.actualPath && (
                <img
                  src={screenshot.actualPath || "/placeholder.svg"}
                  alt="Before"
                  className="max-w-none rounded border border-border absolute transition-transform"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    cursor:
                      zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                  }}
                  draggable={false}
                />
              )}
              {screenshot.expectedPath && (
                <img
                  src={screenshot.expectedPath || "/placeholder.svg"}
                  alt="After"
                  className="max-w-none rounded border border-border transition-transform"
                  style={{
                    opacity: overlayOpacity / 100,
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    cursor:
                      zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                  }}
                  draggable={false}
                />
              )}
            </div>
          </div>
        )}

        {viewMode === "split" && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Split View
            </h3>
            <div
              className="bg-muted rounded-lg p-4 min-h-[500px] flex items-center justify-center relative overflow-hidden cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div className="relative w-full h-full flex">
                <div className="w-1/2 overflow-hidden">
                  {screenshot.actualPath && (
                    <img
                      src={screenshot.actualPath || "/placeholder.svg"}
                      alt="Before"
                      className="w-full h-full object-cover rounded-l border border-border transition-transform"
                      style={{
                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        cursor:
                          zoom > 1
                            ? isDragging
                              ? "grabbing"
                              : "grab"
                            : "default",
                      }}
                      draggable={false}
                    />
                  )}
                </div>
                <div className="w-1/2 overflow-hidden">
                  {screenshot.expectedPath && (
                    <img
                      src={screenshot.expectedPath || "/placeholder.svg"}
                      alt="After"
                      className="w-full h-full object-cover rounded-r border border-border transition-transform"
                      style={{
                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        cursor:
                          zoom > 1
                            ? isDragging
                              ? "grabbing"
                              : "grab"
                            : "default",
                      }}
                      draggable={false}
                    />
                  )}
                </div>
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary transform -translate-x-0.5"></div>
              </div>
            </div>
          </div>
        )}

        {viewMode === "diff-only" && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Visual Differences
            </h3>
            <div
              className="bg-muted rounded-lg p-4 min-h-[500px] flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {screenshot.diffPath ? (
                <img
                  src={screenshot.diffPath || "/placeholder.svg"}
                  alt="Differences"
                  className="max-w-none rounded border border-border transition-transform"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    cursor:
                      zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                  }}
                  draggable={false}
                />
              ) : (
                <div className="text-muted-foreground">
                  No diff image available
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
