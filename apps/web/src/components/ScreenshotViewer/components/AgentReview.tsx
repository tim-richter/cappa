import type { AgentReview } from "@cappa/protocol";
import {
  AgentVerdictBadge,
  verdictSource,
} from "@/components/AgentVerdictBadge";

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/**
 * What `cappa agent check` concluded about this screenshot: the label, its
 * one-line headline and the reasons behind it, so a reviewer can agree or
 * disagree without re-deriving the judgment from the pixels.
 */
export function AgentReviewSummary({ review }: { review: AgentReview }) {
  return (
    <section
      aria-label="Agent review"
      className="rounded-lg border border-border bg-card px-4 py-3 mb-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AgentVerdictBadge review={review} />
        <span className="text-sm font-medium text-card-foreground">
          {review.headline}
        </span>
      </div>

      {review.rationale.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
          {review.rationale.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {verdictSource(review)}
        {review.confidence !== undefined &&
          ` · ${Math.round(review.confidence * 100)}% confidence`}
        {" · "}
        checked {formatTime(review.reviewedAt)}
        {review.pending && (
          <>
            {" · "}
            awaiting judgment — run{" "}
            <code className="font-mono">cappa agent judge</code>
          </>
        )}
      </p>
    </section>
  );
}
