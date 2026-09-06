import { z } from "zod";

export const runStateSchema = z.enum([
  "idle",
  "discovering",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export type RunState = z.infer<typeof runStateSchema>;

export const taskStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "changed",
  "new",
  "failed",
  "skipped",
]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const targetSchema = z.object({
  id: z.string(),
  url: z.string(),
  plugin: z.string(),
});

export type Target = z.infer<typeof targetSchema>;

export const pluginInfoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export type PluginInfo = z.infer<typeof pluginInfoSchema>;

export const startRunRequestSchema = z.object({
  plugins: z.array(z.string()).optional(),
  filter: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
  clearActual: z.boolean().optional(),
});

export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const serializedErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

export type SerializedError = z.infer<typeof serializedErrorSchema>;

/**
 * A plugin's `execute` return value.
 *
 * Only the keys the runner interprets are named; plugins are free to return
 * more, so unknown keys pass through.
 */
export const pluginCaptureResultSchema = z.looseObject({
  success: z.boolean().optional(),
  skipped: z.boolean().optional(),
  isNew: z.boolean().optional(),
  error: z.unknown().optional(),
  filepath: z.string().optional(),
  storyId: z.string().optional(),
  storyName: z.string().optional(),
});

export type PluginCaptureResult = z.infer<typeof pluginCaptureResultSchema>;

export const taskFailureSchema = z.object({
  taskId: z.string(),
  taskUrl: z.string(),
  pluginName: z.string(),
  result: pluginCaptureResultSchema,
});

export type TaskFailure = z.infer<typeof taskFailureSchema>;

export const taskRecordSchema = z.object({
  id: z.string(),
  url: z.string(),
  plugin: z.string(),
  status: taskStatusSchema,
  durationMs: z.number().optional(),
  result: pluginCaptureResultSchema.optional(),
});

export type TaskRecord = z.infer<typeof taskRecordSchema>;

export const runSummarySchema = z.object({
  id: z.string(),
  state: runStateSchema,
  request: startRunRequestSchema,
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  durationMs: z.number().optional(),
  totalTasks: z.number(),
  completedTasks: z.number(),
  failedTasks: z.number(),
  deletedScreenshots: z.array(z.string()),
  anyTasksRan: z.boolean(),
  error: serializedErrorSchema.optional(),
});

export type RunSummary = z.infer<typeof runSummarySchema>;

export const runDetailSchema = runSummarySchema.extend({
  tasks: z.array(taskRecordSchema),
  failures: z.array(taskFailureSchema),
});

export type RunDetail = z.infer<typeof runDetailSchema>;

export const runLogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export type RunLogLevel = z.infer<typeof runLogLevelSchema>;

const eventBase = {
  seq: z.number(),
  runId: z.string(),
  at: z.number(),
};

/**
 * The run event stream, exactly as `@cappa/core`'s `CaptureRunner` emits it.
 *
 * `seq` is monotonic and 1-based per run; the SSE endpoint uses it as the
 * `Last-Event-ID` so a reconnecting client can replay what it missed.
 */
export const runEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("run:start"),
    request: startRunRequestSchema,
  }),
  z.object({
    ...eventBase,
    type: z.literal("discover:start"),
    plugins: z.array(z.string()),
  }),
  z.object({
    ...eventBase,
    type: z.literal("discover:plugin"),
    plugin: z.string(),
    taskCount: z.number(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("discover:complete"),
    targets: z.array(targetSchema),
    totalTasks: z.number(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("filter:applied"),
    filter: z.string().optional(),
    taskIds: z.array(z.string()).optional(),
    plugins: z.array(
      z.object({
        plugin: z.string(),
        before: z.number(),
        after: z.number(),
      }),
    ),
  }),
  z.object({
    ...eventBase,
    type: z.literal("plugin:start"),
    plugin: z.string(),
    taskCount: z.number(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("task:start"),
    plugin: z.string(),
    taskId: z.string(),
    url: z.string(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("task:complete"),
    plugin: z.string(),
    taskId: z.string(),
    url: z.string(),
    status: taskStatusSchema,
    completed: z.number(),
    total: z.number(),
    durationMs: z.number(),
    result: pluginCaptureResultSchema.optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("plugin:complete"),
    plugin: z.string(),
    resultCount: z.number(),
    failed: z.boolean(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("log"),
    level: runLogLevelSchema,
    message: z.string(),
    args: z.array(z.unknown()),
  }),
  z.object({
    ...eventBase,
    type: z.literal("run:complete"),
    summary: runSummarySchema,
  }),
  z.object({
    ...eventBase,
    type: z.literal("run:error"),
    error: serializedErrorSchema,
  }),
  z.object({ ...eventBase, type: z.literal("run:cancelled") }),
]);

export type RunEvent = z.infer<typeof runEventSchema>;

export type RunEventType = RunEvent["type"];
