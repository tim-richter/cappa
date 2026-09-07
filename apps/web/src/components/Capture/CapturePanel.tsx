import type { StartRunRequest, Target, WatchChange } from "@cappa/protocol";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Input } from "@ui/components/input";
import { Switch } from "@ui/components/switch";
import { toast } from "@ui/lib/utils";
import { Camera, Eye, RefreshCw } from "lucide-react";
import { type FC, useMemo, useState } from "react";
import { describeStartRunError } from "@/api/hooks";

/** The watch session, as far as this panel is concerned. */
export interface CaptureWatchProps {
  /** False when the server's engine cannot see the files. */
  supported: boolean;
  active: boolean;
  isPending?: boolean;
  /** The last settled batch of changes, whoever is watching. */
  lastChange?: WatchChange;
  onToggle: (next: boolean) => void;
}

export interface CapturePanelProps {
  targets: Target[];
  plugins: { name: string; description?: string }[];
  isDiscovering?: boolean;
  isStarting?: boolean;
  /** True while a run holds the browser — starting another would be rejected. */
  isRunActive?: boolean;
  onStart: (request: StartRunRequest) => void;
  onRefreshTargets?: () => void;
  watch?: CaptureWatchProps;
}

/** One line describing what a watch iteration did, for the panel's status row. */
export const describeWatchChange = (change: WatchChange): string => {
  const files =
    change.files.length === 1
      ? (change.files[0] ?? "a file")
      : `${change.files.length} files`;

  if (change.error) {
    return `${files} changed — could not start a run: ${change.error}`;
  }

  switch (change.scope) {
    case "tasks": {
      const count = change.taskIds?.length ?? 0;
      return `${files} changed — re-capturing ${count} task${
        count === 1 ? "" : "s"
      }`;
    }
    case "plugins":
      return `${files} changed — re-capturing every task of the affected plugin(s)`;
    case "all":
      return `${files} changed — re-capturing everything`;
    default:
      return `${files} changed — nothing to re-capture`;
  }
};

/**
 * Picks what to capture and starts a run.
 *
 * Selection is expressed as explicit task ids rather than as a URL, which is
 * also the security boundary: the server only accepts ids that discovery
 * produced, so the UI cannot steer the browser somewhere arbitrary.
 */
export const CapturePanel: FC<CapturePanelProps> = ({
  targets,
  plugins,
  isDiscovering,
  isStarting,
  isRunActive,
  onStart,
  onRefreshTargets,
  watch,
}) => {
  const [filter, setFilter] = useState("");
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(
    new Set(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return targets.filter((target) => {
      if (selectedPlugins.size > 0 && !selectedPlugins.has(target.plugin)) {
        return false;
      }
      return term === "" || target.id.toLowerCase().includes(term);
    });
  }, [targets, filter, selectedPlugins]);

  const selectedVisible = visible.filter((target) =>
    selectedIds.has(target.id),
  );
  const allVisibleSelected =
    visible.length > 0 && selectedVisible.length === visible.length;

  const start = () => {
    const request: StartRunRequest = {};

    if (selectedIds.size > 0) {
      request.taskIds = [...selectedIds];
      // A partial run must not wipe results it is not re-capturing.
      request.clearActual = false;
    } else if (selectedPlugins.size > 0) {
      request.plugins = [...selectedPlugins];
    }

    try {
      onStart(request);
    } catch (error) {
      toast.error(describeStartRunError(error));
    }
  };

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectionLabel =
    selectedIds.size > 0
      ? `${selectedIds.size} selected`
      : selectedPlugins.size > 0
        ? `all tasks in ${[...selectedPlugins].join(", ")}`
        : "everything";

  return (
    <section className="flex flex-col gap-4" aria-label="Capture">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Capture</h3>
          <p className="text-sm text-muted-foreground">
            {isDiscovering
              ? "Discovering tasks…"
              : `${targets.length} task(s) available — will capture ${selectionLabel}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {watch?.supported ? (
            <label
              className="flex items-center gap-2 text-sm"
              htmlFor="watch-toggle"
            >
              <Switch
                id="watch-toggle"
                checked={watch.active}
                disabled={watch.isPending}
                onCheckedChange={(next) => watch.onToggle(next === true)}
              />
              <span className="flex items-center gap-1">
                <Eye className="size-4" /> Watch files
              </span>
            </label>
          ) : null}

          {onRefreshTargets ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefreshTargets}
              disabled={isDiscovering || isRunActive}
            >
              <RefreshCw className="size-4" /> Rediscover
            </Button>
          ) : null}

          <Button onClick={start} disabled={isStarting || isRunActive}>
            <Camera className="size-4" />
            {isRunActive ? "Run in progress" : "Start capture"}
          </Button>
        </div>
      </div>

      {watch?.active ? (
        <p
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          role="status"
        >
          {watch.lastChange
            ? describeWatchChange(watch.lastChange)
            : "Watching for file changes — save a file to re-capture what it affects."}
        </p>
      ) : null}

      {plugins.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Plugins:</span>
          {plugins.map((plugin) => (
            <label
              key={plugin.name}
              className="flex items-center gap-2 text-sm"
              htmlFor={`plugin-${plugin.name}`}
            >
              <Checkbox
                id={`plugin-${plugin.name}`}
                checked={selectedPlugins.has(plugin.name)}
                onCheckedChange={() =>
                  setSelectedPlugins((current) => {
                    const next = new Set(current);
                    if (next.has(plugin.name)) {
                      next.delete(plugin.name);
                    } else {
                      next.add(plugin.name);
                    }
                    return next;
                  })
                }
              />
              {plugin.name}
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          value={filter}
          placeholder="Filter tasks…"
          aria-label="Filter tasks"
          className="max-w-md"
          onChange={(event) => setFilter(event.target.value)}
        />

        <Button
          variant="ghost"
          size="sm"
          disabled={visible.length === 0}
          onClick={() =>
            setSelectedIds((current) => {
              const next = new Set(current);
              if (allVisibleSelected) {
                for (const target of visible) {
                  next.delete(target.id);
                }
              } else {
                for (const target of visible) {
                  next.add(target.id);
                }
              }
              return next;
            })
          }
        >
          {allVisibleSelected ? "Clear selection" : "Select all"}
        </Button>
      </div>

      <div className="max-h-72 overflow-auto rounded-md border border-border">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {targets.length === 0
              ? "No tasks discovered."
              : "No tasks match this filter."}
          </p>
        ) : (
          <ul>
            {visible.map((target) => (
              <li
                key={target.id}
                className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
                <Checkbox
                  id={`target-${target.id}`}
                  checked={selectedIds.has(target.id)}
                  onCheckedChange={() => toggle(target.id)}
                />
                <label
                  htmlFor={`target-${target.id}`}
                  className="flex-1 cursor-pointer font-mono text-xs"
                >
                  {target.id}
                </label>
                <span className="text-xs text-muted-foreground">
                  {target.plugin}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
