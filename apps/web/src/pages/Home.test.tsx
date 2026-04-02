import { waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/setup";
import { renderPage } from "../test/utils";
import { Home } from "./Home";

describe("Home page", () => {
  it("shows loading state initially", () => {
    const { getByText } = renderPage(<Home />, { route: "/" });
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("renders all category sections after data loads", async () => {
    const { getByText } = renderPage(<Home />, { route: "/" });
    await waitFor(() => {
      expect(getByText("New")).toBeTruthy();
      expect(getByText("Deleted")).toBeTruthy();
      expect(getByText("Changed")).toBeTruthy();
      expect(getByText("Passed")).toBeTruthy();
    });
  });

  it("renders screenshot names after data loads", async () => {
    const { findByText } = renderPage(<Home />, { route: "/" });
    expect(await findByText("New Screenshot")).toBeTruthy();
    expect(await findByText("Deleted Screenshot")).toBeTruthy();
    expect(await findByText("Changed Screenshot")).toBeTruthy();
    expect(await findByText("Passed Screenshot")).toBeTruthy();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const { findByText } = renderPage(<Home />, { route: "/" });
    expect(await findByText("Error fetching screenshots")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("renders Select button from BatchApproveBar", async () => {
    const { findByText } = renderPage(<Home />, { route: "/" });
    expect(await findByText("Select")).toBeTruthy();
  });

  it("renders screenshots matching search when search param is set", async () => {
    // Default handler returns "Screenshot 1" for any search query
    const { findByText } = renderPage(<Home />, {
      route: "/",
      searchParams: { search: "something" },
    });
    expect(await findByText("Screenshot 1")).toBeTruthy();
  });
});
