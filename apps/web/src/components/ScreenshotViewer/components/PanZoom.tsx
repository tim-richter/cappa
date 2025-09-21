import type React from "react";
import { useRef, useState } from "react";
import {
  type ContentSize,
  type PanZoomLimits,
  usePanZoom,
} from "@/hooks/usePanZoom";

export type PanZoomProps = {
  children: React.ReactNode;
  contentSize: ContentSize | null;
  className?: string;
  limits?: PanZoomLimits;
  initialScale?: number;
};

export function PanZoom(props: PanZoomProps) {
  const {
    children,
    contentSize,
    className,
    limits,
    initialScale = 1,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [, api] = usePanZoom(containerRef, contentSize, limits, initialScale);
  const style = api.getTransformStyle();

  return (
    <div
      className={`relative overflow-hidden w-full h-full ${className ? className : ""}`}
      ref={containerRef}
      style={{ touchAction: 'none' }}
    >
      <div className="absolute inset-0 select-none">
        <div className="will-change-transform" style={style}>
          {children}
        </div>
      </div>
    </div>
  );
}

export type ImagePanZoomProps = {
  src: string;
  alt?: string;
  className?: string;
  limits?: PanZoomLimits;
  initialScale?: number;
};

export function ImagePanZoom(props: ImagePanZoomProps) {
  const { src, alt, className, limits, initialScale } = props;
  const [contentSize, setContentSize] = useState<ContentSize | null>(null);

  return (
    <PanZoom
      contentSize={contentSize}
      className={className}
      limits={limits}
      initialScale={initialScale}
    >
      <img
        src={src}
        alt={alt ? alt : ""}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          setContentSize({
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        }}
      />
    </PanZoom>
  );
}
