import type { Page } from "playwright-core";

/**
 * Crop a screenshot to the content actually painted on the page.
 *
 * - `false` (default): no crop — the viewport, or the whole page with
 *   `fullPage`.
 * - `true`: crop to the content of `document.body`, with the default padding.
 * - an object: crop with a different root or padding.
 */
export type CropSetting = boolean | ContentCropOptions;

export type ContentCropOptions = {
  /**
   * CSS selector of the element whose content is measured. Only what it
   * paints counts, not its own box, background or border.
   * @default "body"
   */
  root?: string;
  /**
   * Space kept around the content, in CSS pixels — room for focus rings,
   * text shadows and other paint that has no box of its own.
   * @default 8
   */
  padding?: number;
};

export type ResolvedContentCrop = Required<ContentCropOptions>;

export type CropRect = { x: number; y: number; width: number; height: number };

export const DEFAULT_CROP_PADDING = 8;

/** The crop to apply, or `undefined` for none. */
export const resolveCrop = (
  crop: CropSetting | undefined,
): ResolvedContentCrop | undefined => {
  if (!crop) return undefined;
  const options = crop === true ? {} : crop;
  return {
    root: options.root ?? "body",
    padding: Math.max(0, options.padding ?? DEFAULT_CROP_PADDING),
  };
};

type MeasureArgs = { root: string };

type MeasuredBox = {
  /** Union of everything painted, in document coordinates. */
  box: CropRect | null;
  scrollX: number;
  scrollY: number;
  documentWidth: number;
  documentHeight: number;
};

/**
 * Runs in the page: the union of the boxes of everything `root` paints, in
 * document coordinates.
 *
 * This is the box of the *ink*, not of the elements: a full-width wrapper
 * `div` with nothing of its own to draw does not count, the text and the
 * button inside it do. An element counts when it draws something itself — a
 * background, a border, an outline, a shadow — or is replaced content (an
 * image, an SVG, a canvas, a form control); text counts by the boxes of its
 * line fragments. Descendants of an element that clips its overflow are
 * clipped to it, and nothing inside a hidden or fully transparent subtree is
 * counted.
 *
 * Portals need no special case: anything a component renders elsewhere in
 * `body` — a popover, a dialog and its backdrop — is measured like the rest.
 *
 * Kept free of syntax a bundler might rewrite with a helper (spread, optional
 * catch binding): Playwright ships this function to the browser as source.
 */
function measurePaintedBox(args: MeasureArgs): MeasuredBox {
  const doc = document;
  const win = window;
  const scrollX = win.scrollX;
  const scrollY = win.scrollY;
  const scrolling = doc.scrollingElement || doc.documentElement;
  const result: MeasuredBox = {
    box: null,
    scrollX: scrollX,
    scrollY: scrollY,
    documentWidth: Math.max(scrolling.scrollWidth, win.innerWidth),
    documentHeight: Math.max(scrolling.scrollHeight, win.innerHeight),
  };

  const root = doc.querySelector(args.root);
  if (!root) return result;

  type Edges = { l: number; t: number; r: number; b: number };
  const NO_CLIP: Edges = {
    l: -Infinity,
    t: -Infinity,
    r: Infinity,
    b: Infinity,
  };
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;

  const add = (rect: DOMRect | DOMRectReadOnly, grow: number, clip: Edges) => {
    if (rect.width <= 0 || rect.height <= 0) return;
    const left = Math.max(rect.left - grow, clip.l);
    const top = Math.max(rect.top - grow, clip.t);
    const right = Math.min(rect.right + grow, clip.r);
    const bottom = Math.min(rect.bottom + grow, clip.b);
    if (right <= left || bottom <= top) return;
    if (left < l) l = left;
    if (top < t) t = top;
    if (right > r) r = right;
    if (bottom > b) b = bottom;
  };

  // Computed colours serialise as `rgba(r, g, b, 0)` when transparent, or
  // `color(srgb r g b / 0)` and friends for other colour spaces. Only the
  // alpha is looked at: `rgb(255, 0, 0)` also ends in `, 0)`.
  const visibleColor = (color: string) => {
    if (!color || color === "transparent") return false;
    const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) return parseFloat(slash[1] || "0") > 0;
    const rgba = color.match(/^rgba\((?:[^,]+,){3}\s*([\d.]+)(%?)\s*\)$/);
    if (rgba) return parseFloat(rgba[1] || "0") > 0;
    return true;
  };

  // Largest distance a shadow list paints outside the box.
  const shadowExtent = (value: string) => {
    if (!value || value === "none") return 0;
    let stripped = value;
    let previous = "";
    while (previous !== stripped) {
      previous = stripped;
      stripped = stripped.replace(/[a-z-]+\([^()]*\)/gi, " ");
    }
    let extent = 0;
    const shadows = stripped.split(",");
    for (let i = 0; i < shadows.length; i++) {
      const shadow = shadows[i] || "";
      if (/\binset\b/.test(shadow)) continue;
      const lengths = (shadow.match(/-?\d*\.?\d+px/g) || []).map(parseFloat);
      const offset = Math.max(
        Math.abs(lengths[0] || 0),
        Math.abs(lengths[1] || 0),
      );
      const reach = offset + Math.max(0, lengths[2] || 0) + (lengths[3] || 0);
      if (reach > extent) extent = reach;
    }
    return extent;
  };

  const REPLACED: Record<string, true> = {
    IMG: true,
    SVG: true,
    CANVAS: true,
    VIDEO: true,
    IFRAME: true,
    EMBED: true,
    OBJECT: true,
    INPUT: true,
    TEXTAREA: true,
    SELECT: true,
    PROGRESS: true,
    METER: true,
    HR: true,
  };
  const SKIPPED: Record<string, true> = {
    SCRIPT: true,
    STYLE: true,
    LINK: true,
    META: true,
    TEMPLATE: true,
    NOSCRIPT: true,
  };

  const range = doc.createRange();

  const paintsSelf = (style: CSSStyleDeclaration) => {
    if (visibleColor(style.backgroundColor)) return true;
    if (style.backgroundImage && style.backgroundImage !== "none") return true;
    const sides = ["Top", "Right", "Bottom", "Left"];
    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      const width = parseFloat(
        style.getPropertyValue(`border-${side?.toLowerCase()}-width`),
      );
      const kind = style.getPropertyValue(
        `border-${side?.toLowerCase()}-style`,
      );
      const color = style.getPropertyValue(
        `border-${side?.toLowerCase()}-color`,
      );
      if (
        width > 0 &&
        kind !== "none" &&
        kind !== "hidden" &&
        visibleColor(color)
      )
        return true;
    }
    return false;
  };

  const walk = (node: Node, clip: Edges, visible: boolean, isRoot: boolean) => {
    if (node.nodeType === 3) {
      if (!visible || !(node.textContent || "").trim()) return;
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (rect) add(rect, 0, clip);
      }
      return;
    }
    if (node.nodeType !== 1) return;

    const el = node as Element;
    if (SKIPPED[el.tagName.toUpperCase()]) return;

    const style = win.getComputedStyle(el);
    if (style.display === "none") return;
    if (parseFloat(style.opacity) === 0) return;

    // `visibility` is inherited but can be overridden by a descendant.
    const selfVisible =
      style.visibility !== "hidden" && style.visibility !== "collapse";
    const rect = el.getBoundingClientRect();

    if (!isRoot && selfVisible) {
      const tag = el.tagName.toUpperCase();
      if (REPLACED[tag]) {
        add(rect, 0, clip);
      } else if (paintsSelf(style)) {
        add(rect, 0, clip);
      }

      const shadow = shadowExtent(style.boxShadow);
      if (shadow > 0) add(rect, shadow, clip);

      if (style.outlineStyle !== "none") {
        const outline =
          (parseFloat(style.outlineWidth) || 0) +
          (parseFloat(style.outlineOffset) || 0);
        if (outline > 0) add(rect, outline, clip);
      }

      // An SVG or a form control paints its children inside its own box.
      if (REPLACED[tag]) return;
    }

    // Overflow clips descendants to the padding box — except `position:
    // fixed` ones, which escape it; those are approximated as clipped too.
    let childClip = clip;
    const clipsX = style.overflowX !== "visible";
    const clipsY = style.overflowY !== "visible";
    if (!isRoot && (clipsX || clipsY)) {
      childClip = {
        l: clipsX ? Math.max(clip.l, rect.left) : clip.l,
        t: clipsY ? Math.max(clip.t, rect.top) : clip.t,
        r: clipsX ? Math.min(clip.r, rect.right) : clip.r,
        b: clipsY ? Math.min(clip.b, rect.bottom) : clip.b,
      };
    }

    const shadowRoot = (el as HTMLElement).shadowRoot;
    if (shadowRoot) {
      const shadowChildren = shadowRoot.childNodes;
      for (let i = 0; i < shadowChildren.length; i++) {
        const child = shadowChildren[i];
        if (child) walk(child, childClip, selfVisible, false);
      }
    }
    const children = el.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child) walk(child, childClip, selfVisible, false);
    }
  };

  walk(root, NO_CLIP, true, true);
  range.detach();

  if (r <= l || b <= t) return result;

  result.box = {
    x: l + scrollX,
    y: t + scrollY,
    width: r - l,
    height: b - t,
  };
  return result;
}

/**
 * The clip for a content-cropped screenshot, or `undefined` when there is
 * nothing to crop to (nothing painted, or the root is missing) — the caller
 * then takes the uncropped screenshot rather than fail.
 *
 * Coordinates follow Playwright's `clip`: relative to the document with
 * `fullPage`, to the viewport without it. Edges are rounded outwards to whole
 * pixels so the crop never cuts into anti-aliased edges, and the padding is
 * clamped to the document so it never asks for pixels that do not exist.
 */
export async function measureContentClip(
  page: Page,
  crop: ResolvedContentCrop,
  fullPage: boolean,
): Promise<CropRect | undefined> {
  const measured = await page.evaluate(measurePaintedBox, { root: crop.root });
  if (!measured.box) return undefined;

  const { box } = measured;
  let left = Math.max(0, Math.floor(box.x - crop.padding));
  let top = Math.max(0, Math.floor(box.y - crop.padding));
  let right = Math.min(
    measured.documentWidth,
    Math.ceil(box.x + box.width + crop.padding),
  );
  let bottom = Math.min(
    measured.documentHeight,
    Math.ceil(box.y + box.height + crop.padding),
  );

  if (!fullPage) {
    const viewport = page.viewportSize();
    const scrollX = Math.floor(measured.scrollX);
    const scrollY = Math.floor(measured.scrollY);
    left = Math.max(0, left - scrollX);
    top = Math.max(0, top - scrollY);
    right -= scrollX;
    bottom -= scrollY;
    if (viewport) {
      right = Math.min(right, viewport.width);
      bottom = Math.min(bottom, viewport.height);
    }
  }

  if (right <= left || bottom <= top) return undefined;

  return { x: left, y: top, width: right - left, height: bottom - top };
}
