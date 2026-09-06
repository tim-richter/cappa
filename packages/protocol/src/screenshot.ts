import { z } from "zod";

/**
 * Screenshot shapes as they cross the wire.
 *
 * These mirror the types in `@cappa/core`, but are declared independently on
 * purpose: this package must stay installable by a browser client that has no
 * business pulling in `playwright-core` or native diff bindings. A type-level
 * compatibility assertion in `screenshot.test.ts` fails the build if the two
 * definitions drift apart.
 */

export const screenshotCategorySchema = z.enum([
  "new",
  "deleted",
  "changed",
  "passed",
]);

export type ScreenshotCategory = z.infer<typeof screenshotCategorySchema>;

export const diffMetadataSchema = z.object({
  numDiffPixels: z.number(),
  percentDifference: z.number(),
  /**
   * Structured diff interpretation, carried opaquely.
   *
   * Its shape is owned by the diff engine (`@blazediff/core-native`'s
   * `InterpretResult`) and changes with that dependency. Pinning it here would
   * make every diff-engine upgrade a breaking protocol change for no benefit,
   * so the protocol passes it through untouched and consumers that want to
   * render the detail narrow it with `InterpretResult` from `@cappa/core`.
   */
  interpretation: z.unknown().optional(),
});

export type DiffMetadata = z.infer<typeof diffMetadataSchema>;

const screenshotBase = {
  id: z.string(),
  name: z.string(),
  approved: z.boolean().optional(),
  /**
   * Neighbours in the full, unfiltered list, so the UI can walk every
   * screenshot with the arrow keys regardless of the current filter.
   *
   * Computed by the server rather than the engine — but they must be described
   * here, or a client parsing a response would silently drop them.
   */
  next: z.string().optional(),
  prev: z.string().optional(),
};

export const newScreenshotSchema = z.object({
  ...screenshotBase,
  category: z.literal("new"),
  actualPath: z.string(),
});

export const deletedScreenshotSchema = z.object({
  ...screenshotBase,
  category: z.literal("deleted"),
  expectedPath: z.string(),
});

export const changedScreenshotSchema = z.object({
  ...screenshotBase,
  category: z.literal("changed"),
  actualPath: z.string(),
  expectedPath: z.string(),
  diffPath: z.string(),
  diffMeta: diffMetadataSchema.optional(),
});

export const passedScreenshotSchema = z.object({
  ...screenshotBase,
  category: z.literal("passed"),
  actualPath: z.string(),
  expectedPath: z.string(),
});

export const screenshotSchema = z.discriminatedUnion("category", [
  newScreenshotSchema,
  deletedScreenshotSchema,
  changedScreenshotSchema,
  passedScreenshotSchema,
]);

export type Screenshot = z.infer<typeof screenshotSchema>;

export const screenshotQuerySchema = z.object({
  search: z.string().optional(),
  category: screenshotCategorySchema.optional(),
});

export type ScreenshotQuery = z.infer<typeof screenshotQuerySchema>;

export const approveRequestSchema = z.object({
  names: z.array(z.string()).min(1, "names must be a non-empty array"),
});

export type ApproveRequest = z.infer<typeof approveRequestSchema>;

export const approveResultSchema = z.object({
  approved: z.array(z.string()),
  errors: z.array(z.object({ name: z.string(), error: z.string() })),
});

export type ApproveResult = z.infer<typeof approveResultSchema>;
