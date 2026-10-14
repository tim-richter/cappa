import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { mockAgentReview } from "@/mocks/review";
import { AgentVerdictBadge } from "./AgentVerdictBadge";

describe("AgentVerdictBadge", () => {
  it("names the verdict and who reached it", async () => {
    const screen = await render(<AgentVerdictBadge review={mockAgentReview} />);

    await expect
      .element(screen.getByLabelText("Regression likely · Judged by agent"))
      .toBeVisible();
  });

  it("shows the headline on hover", async () => {
    const screen = await render(<AgentVerdictBadge review={mockAgentReview} />);

    await userEvent.hover(screen.getByText("Regression likely"));

    await expect
      .element(
        screen
          .getByRole("tooltip")
          .getByText(/Submit button label is truncated/),
      )
      .toBeInTheDocument();
  });

  it("marks a heuristic verdict that still awaits judgment", async () => {
    const screen = await render(
      <AgentVerdictBadge
        review={{
          ...mockAgentReview,
          label: "ambiguous",
          source: "heuristic",
          pending: true,
        }}
      />,
    );

    await expect
      .element(
        screen.getByLabelText("Ambiguous · Heuristic · awaiting judgment"),
      )
      .toBeVisible();
  });

  it("shows an unknown label as-is instead of dropping it", async () => {
    const screen = await render(
      <AgentVerdictBadge
        review={{ ...mockAgentReview, label: "flaky-likely" }}
      />,
    );

    await expect.element(screen.getByText("flaky-likely")).toBeVisible();
  });
});
