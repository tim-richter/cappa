import type { AgentReview } from "@cappa/protocol";
import { Badge } from "@ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib/utils";
import { Bot } from "lucide-react";

/**
 * Styling per verdict label. Keyed by the label strings `cappa agent check`
 * writes; anything else — a label a newer engine introduced — falls back to a
 * neutral badge showing the raw label rather than disappearing.
 */
const LABELS: Record<string, { text: string; className: string }> = {
  "regression-likely": {
    text: "Regression likely",
    className: "bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300",
  },
  "intentional-likely": {
    text: "Intentional",
    className:
      "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  "noise-likely": {
    text: "Noise",
    className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

export const verdictLabel = (label: string) =>
  LABELS[label] ?? {
    text: label,
    className: "bg-secondary text-secondary-foreground",
  };

/**
 * A judge's verdict from the last `cappa agent check`, compact enough for a
 * list row or a card. The tooltip carries the one-line headline.
 */
export const AgentVerdictBadge = ({
  review,
  className,
}: {
  review: AgentReview;
  className?: string;
}) => {
  const { text, className: color } = verdictLabel(review.label);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={cn("text-xs gap-1 cursor-default", color, className)}
          aria-label={`${text} · Judged by agent`}
        >
          <Bot aria-hidden="true" />
          {text}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Judged by agent: {review.headline}</TooltipContent>
    </Tooltip>
  );
};
