import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { New } from "./New";

describe("New page", () => {
  it("shows loading state initially", () => {
    const { getByText } = renderPage(<New />, { route: "/new" });
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("renders new screenshots after data loads", async () => {
    const { findByText } = renderPage(<New />, { route: "/new" });
    expect(await findByText("Screenshot 1")).toBeTruthy();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const { findByText } = renderPage(<New />, { route: "/new" });
    expect(await findByText("Error fetching screenshots")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("renders batch approve controls", async () => {
    const { findByText } = renderPage(<New />, { route: "/new" });
    expect(await findByText("Select")).toBeTruthy();
  });

  it("activating select mode shows Cancel and Select all buttons", async () => {
    const user = userEvent.setup();
    const { findByText } = renderPage(<New />, { route: "/new" });

    const selectBtn = await findByText("Select");
    await user.click(selectBtn);

    await waitFor(async () => {
      expect(await findByText("Cancel")).toBeTruthy();
      expect(await findByText("Select all")).toBeTruthy();
    });
  });

  it("approving all new screenshots calls the approve API", async () => {
    const user = userEvent.setup();
    let capturedNames: string[] | undefined;

    server.use(
      http.post("/api/screenshots/approve-batch", async ({ request }) => {
        const body = (await request.json()) as { names: string[] };
        capturedNames = body.names;
        return HttpResponse.json({ approved: body.names, errors: [] });
      }),
    );

    const { findByText } = renderPage(<New />, { route: "/new" });

    const selectBtn = await findByText("Select");
    await user.click(selectBtn);

    const selectAllBtn = await findByText("Select all");
    await user.click(selectAllBtn);

    const approveBtn = await findByText(/Approve selected/);
    await user.click(approveBtn);

    await waitFor(() => {
      expect(capturedNames).toEqual(["Screenshot 1"]);
    });
  });
});
