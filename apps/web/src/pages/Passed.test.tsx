import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { Passed } from "./Passed";

describe("Passed page", () => {
  it("shows loading state initially", () => {
    const { getByText } = renderPage(<Passed />, { route: "/passed" });
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("renders passed screenshots after data loads", async () => {
    const { findByText } = renderPage(<Passed />, { route: "/passed" });
    expect(await findByText("Screenshot 4")).toBeTruthy();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const { findByText } = renderPage(<Passed />, { route: "/passed" });
    expect(await findByText("Error fetching screenshots")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("does not render batch approve controls (passed screenshots are read-only)", async () => {
    const { findByText, queryByText } = renderPage(<Passed />, {
      route: "/passed",
    });
    // Wait for loading to complete
    await findByText("Screenshot 4");
    expect(queryByText("Select")).toBeNull();
  });
});
