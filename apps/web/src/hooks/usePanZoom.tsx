import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PanZoomLimits = {
  minScale?: number;
  maxScale?: number;
  padding?: number; // px padding inside container before clamping
};

export type PanZoomState = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type ContentSize = { width: number; height: number };
export type ContainerSize = { width: number; height: number };

export type PanZoomApi = {
  getTransformStyle(): { transform: string; transformOrigin: "0 0" };
  reset(): void;
  fit(): void;
  setScale(next: number, focal?: { x: number; y: number }): void;
  setTranslate(nextX: number, nextY: number): void;
};

type ActivePointers = Map<number, { x: number; y: number }>;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Compute clamped translate so content stays within container + padding
function clampTranslate(
  tx: number,
  ty: number,
  scale: number,
  content: ContentSize,
  container: ContainerSize,
  padding: number,
) {
  const w = content.width * scale;
  const h = content.height * scale;

  // Calculate the bounds for the content
  const minX = Math.min(0 + padding, container.width - w - padding);
  const maxX = Math.max(0 + padding, container.width - w - padding);

  const minY = Math.min(0 + padding, container.height - h - padding);
  const maxY = Math.max(0 + padding, container.height - h - padding);

  // If content is smaller than container, allow free movement within bounds
  const canCenterX = w + padding * 2 <= container.width;
  const canCenterY = h + padding * 2 <= container.height;

  // For content that fits horizontally, lock to center position to prevent panning
  const centerX = (container.width - w) / 2;
  const minClampX = canCenterX ? centerX : minX;
  const maxClampX = canCenterX ? centerX : maxX;

  const minClampY = canCenterY
    ? Math.min(minY, (container.height - h) / 2)
    : minY;
  const maxClampY = canCenterY
    ? Math.max(maxY, (container.height - h) / 2)
    : maxY;

  return {
    x: clamp(tx, minClampX, maxClampX),
    y: clamp(ty, minClampY, maxClampY),
  };
}

export function usePanZoom(
  containerRef: React.RefObject<HTMLElement | null>,
  contentSize: ContentSize | null,
  limits: PanZoomLimits = {},
  initialScale = 1,
): [PanZoomState, PanZoomApi] {
  const minScaleLimit = limits.minScale ?? 0.25;
  const maxScaleLimit = limits.maxScale ?? 8;
  const padding = limits.padding ?? 16;

  const [state, setState] = useState<PanZoomState>({
    scale: initialScale,
    translateX: 0,
    translateY: 0,
  });

  const [containerSize, setContainerSize] = useState<ContainerSize | null>(
    null,
  );
  const containerSizeRef = useRef<ContainerSize | null>(null);
  const pointersRef = useRef<ActivePointers>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<PanZoomState | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastMoveTimeRef = useRef<number>(0);

  // Measure container with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        const size = { width: cr.width, height: cr.height };
        containerSizeRef.current = size;
        setContainerSize(size);
        // When container changes, re-clamp
        setState((s) => {
          if (!contentSize) return s;
          const size = containerSizeRef.current;
          if (!size) return s;
          const { x, y } = clampTranslate(
            s.translateX,
            s.translateY,
            s.scale,
            contentSize,
            size,
            padding,
          );
          return { ...s, translateX: x, translateY: y };
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, contentSize, padding]);

  const getScaleBounds = useCallback(() => {
    if (!contentSize || !containerSizeRef.current) {
      return { min: minScaleLimit, max: maxScaleLimit };
    }

    const { width: cw, height: ch } = containerSizeRef.current;
    const fitScale = Math.min(cw / contentSize.width, ch / contentSize.height);
    const min = Math.min(minScaleLimit, fitScale);
    const max = Math.max(min, maxScaleLimit);
    return { min, max };
  }, [contentSize, maxScaleLimit, minScaleLimit]);

  // Apply transform with RAF to avoid layout thrash
  const schedule = useCallback((next: PanZoomState) => {
    pendingRef.current = next;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current) {
        setState(pendingRef.current);
        pendingRef.current = null;
      }
    });
  }, []);

  // Direct state update for immediate response during dragging
  const updateStateImmediate = useCallback((next: PanZoomState) => {
    setState(next);
  }, []);

  const getTransformStyle = useCallback(() => {
    return {
      transform: `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
      transformOrigin: "0 0" as const,
    };
  }, [state.translateX, state.translateY, state.scale]);

  // Pan helpers - optimized for immediate response during dragging
  const panBy = useCallback(
    (dx: number, dy: number, immediate = false) => {
      if (!contentSize || !containerSizeRef.current) return;
      const { x, y } = clampTranslate(
        state.translateX + dx,
        state.translateY + dy,
        state.scale,
        contentSize,
        containerSizeRef.current,
        padding,
      );
      const nextState = { ...state, translateX: x, translateY: y };
      if (immediate) {
        updateStateImmediate(nextState);
      } else {
        schedule(nextState);
      }
    },
    [state, contentSize, padding, schedule, updateStateImmediate],
  );

  // Zoom around focal (container coords)
  const zoomTo = useCallback(
    (nextScale: number, focal?: { x: number; y: number }) => {
      if (!contentSize || !containerSizeRef.current) return;
      const { min, max } = getScaleBounds();
      const scale = clamp(nextScale, min, max);
      if (scale === state.scale) return;

      // If no focal provided, zoom around center
      const cx = focal ? focal.x : containerSizeRef.current.width / 2;
      const cy = focal ? focal.y : containerSizeRef.current.height / 2;

      // Convert focal point from screen -> content coordinates
      const contentX = (cx - state.translateX) / state.scale;
      const contentY = (cy - state.translateY) / state.scale;

      // Compute new translate so focal stays under cursor
      const nextTx = cx - contentX * scale;
      const nextTy = cy - contentY * scale;

      const clamped = clampTranslate(
        nextTx,
        nextTy,
        scale,
        contentSize,
        containerSizeRef.current,
        padding,
      );
      schedule({ scale, translateX: clamped.x, translateY: clamped.y });
    },
    [state, contentSize, getScaleBounds, padding, schedule],
  );

  const setScale = useCallback(
    (next: number, focal?: { x: number; y: number }) => zoomTo(next, focal),
    [zoomTo],
  );

  const setTranslate = useCallback(
    (nextX: number, nextY: number) => {
      if (!contentSize || !containerSizeRef.current) return;
      const { x, y } = clampTranslate(
        nextX,
        nextY,
        state.scale,
        contentSize,
        containerSizeRef.current,
        padding,
      );
      schedule({ ...state, translateX: x, translateY: y });
    },
    [state, contentSize, padding, schedule],
  );

  const reset = useCallback(() => {
    const { min, max } = getScaleBounds();
    const nextScale = clamp(initialScale, min, max);
    schedule({ scale: nextScale, translateX: 0, translateY: 0 });
  }, [getScaleBounds, initialScale, schedule]);

  const fit = useCallback(() => {
    if (!contentSize || !containerSizeRef.current) return;
    const { width: cw, height: ch } = containerSizeRef.current;
    const sx = cw / contentSize.width;
    const sy = ch / contentSize.height;
    const { min, max } = getScaleBounds();
    const scale = clamp(Math.min(sx, sy), min, max);
    const w = contentSize.width * scale;
    const h = contentSize.height * scale;
    const tx = (cw - w) / 2;
    const ty = (ch - h) / 2;
    schedule({ scale, translateX: tx, translateY: ty });
  }, [contentSize, getScaleBounds, schedule]);

  useEffect(() => {
    if (!contentSize || !containerSize) return;
    const size = containerSizeRef.current;
    if (!size) return;

    setState((current) => {
      const { min, max } = getScaleBounds();
      const nextScale = clamp(current.scale, min, max);

      let nextTx = current.translateX;
      let nextTy = current.translateY;

      if (nextScale !== current.scale) {
        const cx = size.width / 2;
        const cy = size.height / 2;
        const contentX = (cx - current.translateX) / current.scale;
        const contentY = (cy - current.translateY) / current.scale;
        nextTx = cx - contentX * nextScale;
        nextTy = cy - contentY * nextScale;
      }

      const clamped = clampTranslate(
        nextTx,
        nextTy,
        nextScale,
        contentSize,
        size,
        padding,
      );

      if (
        nextScale === current.scale &&
        clamped.x === current.translateX &&
        clamped.y === current.translateY
      ) {
        return current;
      }

      return {
        scale: nextScale,
        translateX: clamped.x,
        translateY: clamped.y,
      };
    });
  }, [contentSize, containerSize, getScaleBounds, padding]);

  // Pointer / touch handling (Pointer Events)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.style.touchAction = "none";

    function onPointerDown(e: PointerEvent) {
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      isDraggingRef.current = true;
      lastMoveTimeRef.current = performance.now();
    }

    function onPointerMove(e: PointerEvent) {
      if (!el) return;
      const pts = pointersRef.current;
      if (!pts.has(e.pointerId)) return;

      const now = performance.now();
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, next);

      // Pinch
      if (pts.size >= 2) {
        const [a, b] = Array.from(pts.values());
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = distance(a, b);
        if (lastPinchDistRef.current == null) {
          lastPinchDistRef.current = dist;
          return;
        }
        const delta = dist / lastPinchDistRef.current;
        lastPinchDistRef.current = dist;
        const nextScale = state.scale * delta;
        zoomTo(nextScale, {
          x: mid.x - el.getBoundingClientRect().left,
          y: mid.y - el.getBoundingClientRect().top,
        });
        return;
      }

      // Pan - use immediate updates for smooth dragging
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;

      // Throttle updates to 60fps max, but use immediate updates for responsiveness
      if (now - lastMoveTimeRef.current >= 16) {
        // ~60fps
        panBy(dx, dy, true); // immediate update
        lastMoveTimeRef.current = now;
      } else {
        // For very rapid movements, still update immediately to avoid lag
        panBy(dx, dy, true);
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (!el) return;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) {
        lastPinchDistRef.current = null;
      }
      if (pointersRef.current.size === 0) {
        isDraggingRef.current = false;
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
    }

    function onWheel(e: WheelEvent) {
      // ctrlKey => pinch-zoom on trackpads, respect it
      const delta = e.deltaY;
      if (!containerSizeRef.current) return;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      // Zoom factor: smaller step for precision
      const zoomFactor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0025));
      const nextScale = state.scale * zoomFactor;

      e.preventDefault();
      zoomTo(nextScale, focal);
    }

    function onDblClick(e: MouseEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const next = state.scale < 2 ? state.scale * 2 : 1;
      zoomTo(next, focal);
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDblClick);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel as any);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [containerRef, panBy, zoomTo, state.scale]);

  const api = useMemo<PanZoomApi>(
    () => ({ getTransformStyle, reset, fit, setScale, setTranslate }),
    [getTransformStyle, reset, fit, setScale, setTranslate],
  );

  return [state, api];
}
