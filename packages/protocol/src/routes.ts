import { z } from "zod";
import { screenshotCategorySchema } from "./screenshot";

/**
 * Bumped whenever the wire contract changes incompatibly.
 *
 * Served on `GET /api/health` and checked by `@cappa/client` on its first call,
 * so a client built against an older server fails with a clear message instead
 * of mis-parsing responses.
 */
export const PROTOCOL_VERSION = 1;

/** Capabilities a server advertises, so a client can hide what is unavailable. */
export const capabilitiesSchema = z.object({
  /** Capture routes are mounted (false when the server is read-only). */
  capture: z.boolean(),
  /** Screenshots can be approved. */
  approve: z.boolean(),
  /** The run event stream is available. */
  events: z.boolean(),
});

export type Capabilities = z.infer<typeof capabilitiesSchema>;

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  protocolVersion: z.number(),
  capabilities: capabilitiesSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const configResponseSchema = z.object({
  theme: z.enum(["light", "dark"]),
  readOnly: z.boolean(),
});

export type ConfigResponse = z.infer<typeof configResponseSchema>;

export const startRunResponseSchema = z.object({
  runId: z.string(),
});

export type StartRunResponse = z.infer<typeof startRunResponseSchema>;

/**
 * Machine-readable codes on error responses.
 *
 * Kept here, in the wire contract, rather than derived from `@cappa/core`'s
 * error classes: a client must be able to tell a conflict from a validation
 * failure without installing the engine. `@cappa/core` mirrors these values and
 * a compatibility assertion there fails the build if they drift.
 */
export const ERROR_CODES = {
  runInProgress: "CAPPA_RUN_IN_PROGRESS",
  unknownTargets: "CAPPA_UNKNOWN_TARGETS",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const errorResponseSchema = z.object({
  error: z.unknown(),
  code: z.string().optional(),
  activeRunId: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Every route the server exposes, in one place. */
export const routes = {
  health: "/api/health",
  config: "/api/config",
  plugins: "/api/plugins",
  targets: "/api/targets",
  runs: "/api/runs",
  run: (id: string) => `/api/runs/${encodeURIComponent(id)}`,
  runCancel: (id: string) => `/api/runs/${encodeURIComponent(id)}/cancel`,
  runEvents: (id: string) => `/api/runs/${encodeURIComponent(id)}/events`,
  screenshots: "/api/screenshots",
  screenshot: (id: string) => `/api/screenshots/${encodeURIComponent(id)}`,
  approveBatch: "/api/screenshots/approve-batch",
} as const;

/** Prefix under which screenshot images are served. */
export const ASSET_PREFIX = "/assets/screenshots";

/** Header carrying the access token when the server is not on loopback. */
export const TOKEN_HEADER = "x-cappa-token";

export const targetsQuerySchema = z.object({
  refresh: z
    .union([
      z.literal("1"),
      z.literal("true"),
      z.literal("0"),
      z.literal("false"),
    ])
    .optional(),
});

export { screenshotCategorySchema };
