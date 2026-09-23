import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { cn } from "@ui/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createInspectRegion,
  type ImageSize,
  type InspectRegion,
  type InspectRegionField,
  isRegionOutside,
  parseCoordinate,
  persistInspectOpen,
  persistRegions,
  readPersistedInspectOpen,
  readPersistedRegions,
  regionColor,
  regionStyle,
} from "../inspectRegions";

type InspectContextValue = {
  regions: InspectRegion[];
  /**
   * The size of the last image that reported one, for the panel's readout.
   *
   * One value for however many images are on screen: the views that show two
   * show a before and an after of the same screenshot, and a pair whose sizes
   * disagree is a difference the reader wants to know about anyway.
   */
  imageSize: ImageSize | null;
  reportImageSize: (size: ImageSize) => void;
};

const InspectContext = createContext<InspectContextValue>({
  regions: [],
  imageSize: null,
  reportImageSize: () => {},
});

/**
 * Manual inspect regions, and the state the panel edits.
 *
 * Persisted rather than per-screenshot: the point of typing a box in is to go
 * looking for it, which means walking screenshots and switching view modes
 * without losing the coordinates.
 */
export function useInspectRegionState() {
  const [regions, setRegions] = useState<InspectRegion[]>(readPersistedRegions);
  const [open, setOpenState] = useState<boolean>(readPersistedInspectOpen);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    persistInspectOpen(next);
  }, []);

  const update = useCallback(
    (next: (current: InspectRegion[]) => InspectRegion[]) => {
      setRegions((current) => {
        const updated = next(current);
        persistRegions(updated);
        return updated;
      });
    },
    [],
  );

  return useMemo(
    () => ({
      regions,
      open,
      setOpen,
      // Opening with nothing to edit would show an empty panel, so the first
      // open starts a region: the fields are the feature.
      toggleOpen: () => {
        const next = !open;
        setOpen(next);
        if (next && regions.length === 0) {
          update((current) => [...current, createInspectRegion()]);
        }
      },
      addRegion: () => update((current) => [...current, createInspectRegion()]),
      updateRegion: (id: string, field: InspectRegionField, value: number) =>
        update((current) =>
          current.map((region) =>
            region.id === id ? { ...region, [field]: value } : region,
          ),
        ),
      removeRegion: (id: string) =>
        update((current) => current.filter((region) => region.id !== id)),
      clearRegions: () => update(() => []),
    }),
    [regions, open, setOpen, update],
  );
}

export function InspectProvider({
  regions,
  children,
}: {
  regions: InspectRegion[];
  children: ReactNode;
}) {
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);

  const reportImageSize = useCallback((size: ImageSize) => {
    setImageSize((current) =>
      current?.width === size.width && current?.height === size.height
        ? current
        : size,
    );
  }, []);

  const value = useMemo(
    () => ({ regions, imageSize, reportImageSize }),
    [regions, imageSize, reportImageSize],
  );

  return (
    <InspectContext.Provider value={value}>{children}</InspectContext.Provider>
  );
}

/**
 * Track an image's natural size, which is the coordinate space every typed
 * region is expressed in.
 *
 * Reads it from the element on mount as well as on `load`, because an image the
 * browser already has cached can be complete before React attaches the handler.
 */
function useInspectedImage() {
  const { reportImageSize } = useContext(InspectContext);
  const [size, setSize] = useState<ImageSize | null>(null);

  const measure = useCallback(
    (img: HTMLImageElement) => {
      if (!img.naturalWidth || !img.naturalHeight) {
        return;
      }

      const next = { width: img.naturalWidth, height: img.naturalHeight };
      setSize((current) =>
        current?.width === next.width && current?.height === next.height
          ? current
          : next,
      );
      reportImageSize(next);
    },
    [reportImageSize],
  );

  const ref: Ref<HTMLImageElement> = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete) {
        measure(img);
      }
    },
    [measure],
  );

  return {
    size,
    imgProps: {
      ref,
      onLoad: (event: SyntheticEvent<HTMLImageElement>) =>
        measure(event.currentTarget),
    },
  };
}

/**
 * The typed regions, drawn over an image of `size`.
 *
 * Renders nothing until the image has reported its size: without it there is no
 * pixel space to place a box in, and guessing one would put the box somewhere
 * confidently wrong.
 */
function InspectRegionsLayer({ size }: { size: ImageSize | null }) {
  const { regions } = useContext(InspectContext);

  if (!size || regions.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {regions.map((region, index) => {
        const color = regionColor(index);
        const outside = isRegionOutside(region, size);

        return (
          <div
            key={region.id}
            data-testid="inspect-region"
            data-outside={outside || undefined}
            title={
              outside
                ? `Region ${index + 1} reaches outside the image (${size.width}×${size.height})`
                : undefined
            }
            className={cn(
              "absolute",
              color.box,
              outside ? "border-2 border-dashed" : "border-2",
            )}
            style={regionStyle(region, size)}
          >
            <span
              className={cn(
                "absolute -top-5 left-0 rounded px-1 text-[10px] font-medium leading-4",
                color.label,
              )}
            >
              {index + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * An image with the inspect layer pinned to it.
 *
 * The wrapper shrinks to the rendered image so the layer's percentages land on
 * the image itself rather than on whatever box the view lays out around it.
 * `children` is for the overlays a view stacks on the same image — the split
 * view's clipped "after", the diff view's interpreted regions.
 */
export function InspectableImage({
  src,
  alt,
  className,
  wrapperClassName,
  wrapperRef,
  ariaHidden,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  wrapperRef?: Ref<HTMLDivElement>;
  /** For a view that stacks images and shows one at a time. */
  ariaHidden?: boolean;
  children?: ReactNode;
}) {
  const { size, imgProps } = useInspectedImage();

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative inline-block max-w-full max-h-full",
        wrapperClassName,
      )}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        aria-hidden={ariaHidden}
        className={className}
        {...imgProps}
      />
      {children}
      <InspectRegionsLayer size={size} />
    </div>
  );
}

/**
 * A coordinate field.
 *
 * Holds what was typed rather than re-rendering the parsed number back into the
 * box, so clearing a field to retype it does not fight the user with a `0`.
 */
function CoordinateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft((current) =>
      parseCoordinate(current) === value ? current : String(value),
    );
  }, [value]);

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span aria-hidden="true" className="uppercase">
        {label}
      </span>
      <Input
        aria-label={label}
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseCoordinate(event.target.value);
          if (parsed !== null) {
            onCommit(parsed);
          }
        }}
        onBlur={() => setDraft(String(value))}
        className="h-7 w-full px-1 text-center text-xs"
      />
    </div>
  );
}

function RegionRow({
  region,
  index,
  imageSize,
  onUpdate,
  onRemove,
}: {
  region: InspectRegion;
  index: number;
  imageSize: ImageSize | null;
  onUpdate: (field: InspectRegionField, value: number) => void;
  onRemove: () => void;
}) {
  const color = regionColor(index);
  const outside = imageSize ? isRegionOutside(region, imageSize) : false;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded px-1 text-[10px] font-medium leading-4",
            color.label,
          )}
        >
          {index + 1}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          aria-label={`Remove region ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <CoordinateField
          label="x"
          value={region.x}
          onCommit={(value) => onUpdate("x", value)}
        />
        <CoordinateField
          label="y"
          value={region.y}
          onCommit={(value) => onUpdate("y", value)}
        />
        <CoordinateField
          label="w"
          value={region.width}
          onCommit={(value) => onUpdate("width", value)}
        />
        <CoordinateField
          label="h"
          value={region.height}
          onCommit={(value) => onUpdate("height", value)}
        />
      </div>

      {outside && imageSize && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Outside the image ({imageSize.width}×{imageSize.height}) — a different
          viewport or scale factor?
        </p>
      )}
    </div>
  );
}

/**
 * The inspect panel: type a size and a position, see it on the screenshot.
 */
export function InspectPanel({
  regions,
  onAdd,
  onUpdate,
  onRemove,
  onClear,
  onClose,
}: {
  regions: InspectRegion[];
  onAdd: () => void;
  onUpdate: (id: string, field: InspectRegionField, value: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { imageSize } = useContext(InspectContext);

  return (
    <section
      aria-label="Inspect regions"
      className="fixed bottom-6 left-6 z-10000 w-[22rem] max-w-[calc(100vw-3rem)] rounded-lg border border-border bg-background/95 p-3 shadow-xl backdrop-blur-lg"
    >
      <header className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-medium">Inspect</h3>
        <span className="text-xs text-muted-foreground">
          {imageSize
            ? `image ${imageSize.width}×${imageSize.height}`
            : "measuring image…"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          aria-label="Close inspect panel"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {regions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add a region and type the position and size a diff report gave you —
            it is drawn on the screenshot in every view.
          </p>
        ) : (
          regions.map((region, index) => (
            <RegionRow
              key={region.id}
              region={region}
              index={index}
              imageSize={imageSize}
              onUpdate={(field, value) => onUpdate(region.id, field, value)}
              onRemove={() => onRemove(region.id)}
            />
          ))
        )}
      </div>

      <footer className="mt-2 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus className="size-3.5" /> Add region
        </Button>
        {regions.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </footer>
    </section>
  );
}
