import type { AgentReview } from "@cappa/protocol";

/** A verdict as `cappa agent check` reports it after an agent judged it. */
export const mockAgentReview: AgentReview = {
  label: "regression-likely",
  headline: "Submit button label is truncated",
  rationale: [
    "'Submit' renders as 'Subm' in region #1",
    "no code change touches the button copy",
  ],
  action: "investigate",
  source: "agent",
  confidence: 0.9,
  pending: false,
  reviewedAt: "2026-10-14T12:00:00.000Z",
};
