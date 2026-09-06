import type { StartRunRequest, Target } from "@cappa/protocol";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Input } from "@ui/components/input";
import { toast } from "@ui/lib/utils";
import { Camera, RefreshCw } from "lucide-react";
import { type FC, useMemo, useState } from "react";
import { describeStartRunError } from "@/api/hooks";

export interface CapturePanelProps {
  targets: Target[];
  plugins: { name: string; description?: string }[];
  isDiscovering?: boolean;
  isStarting?: boolean;
  /** True while a run holds the browser — starting another would be rejected. */
  isRunActive?: boolean;
  onStart: (request: StartRunRequest) => void;
  onRefreshTargets?: () => void;
}

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
