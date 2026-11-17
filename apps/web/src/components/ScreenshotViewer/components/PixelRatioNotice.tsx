import { TriangleAlert } from "lucide-react";
import { formatPixelRatio, type PixelRatios } from "../pixelRatio";

/**
 * Why a changed screenshot cannot pass: its baseline was captured at another
 * pixel ratio, so the two differ in size everywhere. Both images are shown at
 * their CSS size, which is what makes them comparable at all.
 */
export function PixelRatioNotice({ ratios }: { ratios: PixelRatios }) {
  return (
    <section
      aria-label="Pixel ratio changed"
      className="mb-4 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">
          Baseline captured at {formatPixelRatio(ratios.expected)}, this
          screenshot at {formatPixelRatio(ratios.actual)}
        </p>
        <p className="mt-1 opacity-90">
          <code>screenshot.scale</code> or <code>deviceScaleFactor</code>{" "}
          changed, so the images cannot match pixel for pixel. Both are shown at
          their CSS size. Approve if the new scale is intended; otherwise
          restore the previous setting.
        </p>
      </div>
    </section>
  );
}
