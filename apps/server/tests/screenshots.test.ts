import type { Screenshot } from "@cappa/core";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { createFakeEngine, type FakeEngine } from "./fakeEngine";

const screenshots: Screenshot[] = [
  {
    name: "Screenshot 1",
    id: "1",
    category: "new",
    actualPath: "actual/Screenshot 1.png",
  },
  {
    name: "Screenshot 2",
    id: "2",
    category: "deleted",
    expectedPath: "expected/Screenshot 2.png",
  },
  {
    name: "Screenshot 3",
    id: "3",
    category: "changed",
    actualPath: "actual/Screenshot 3.png",
    expectedPath: "expected/Screenshot 3.png",
    diffPath: "diff/Screenshot 3.png",
  },
  {
    name: "Screenshot 4",
    id: "4",
    category: "passed",
    actualPath: "actual/Screenshot 4.png",
    expectedPath: "expected/Screenshot 4.png",
  },
];

const build = async (
  opts: Partial<Parameters<typeof createServer>[0]> = {},
  engine: FakeEngine = createFakeEngine(),
) => {
  engine.screenshots = [...screenshots];
  const app = await createServer({
    engine,
    outputDir: "dist/screenshots",
    logger: false,
    ...opts,
  });
  return { app, engine };
};

describe("GET /api/screenshots", () => {
  it("returns every screenshot with asset URLs and navigation links", async () => {
    const { app } = await build();

    const response = await app.inject({ url: "/api/screenshots" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        name: "Screenshot 1",
        id: "1",
        category: "new",
        approved: false,
        actualPath: "/assets/screenshots/actual/Screenshot 1.png",
        next: "2",
      },
      {
        name: "Screenshot 2",
        id: "2",
        category: "deleted",
        approved: false,
        expectedPath: "/assets/screenshots/expected/Screenshot 2.png",
        next: "3",
        prev: "1",
      },
      {
        name: "Screenshot 3",
        id: "3",
        category: "changed",
        approved: false,
        actualPath: "/assets/screenshots/actual/Screenshot 3.png",
        expectedPath: "/assets/screenshots/expected/Screenshot 3.png",
        diffPath: "/assets/screenshots/diff/Screenshot 3.png",
        next: "4",
        prev: "2",
      },
      {
        name: "Screenshot 4",
        id: "4",
        category: "passed",
        // A screenshot matching its baseline has nothing left to approve.
        approved: true,
        actualPath: "/assets/screenshots/actual/Screenshot 4.png",
        expectedPath: "/assets/screenshots/expected/Screenshot 4.png",
        prev: "3",
      },
    ]);
  });

  it("reads through to the engine on every request", async () => {
    const { app, engine } = await build();

    await app.inject({ url: "/api/screenshots" });
    engine.screenshots = [];
    const second = await app.inject({ url: "/api/screenshots" });

    expect(second.json()).toEqual([]);
  });

  it("filters by category", async () => {
    const { app } = await build();

    const response = await app.inject({ url: "/api/screenshots?category=new" });

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({ id: "1" });
  });

  it("filters by search term, case-insensitively", async () => {
    const { app } = await build();

    const response = await app.inject({
      url: "/api/screenshots?search=screenshot%203",
    });

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({ id: "3" });
  });

  it("keeps next/prev spanning the whole list when filtering", async () => {
    const { app } = await build();

    const response = await app.inject({
      url: "/api/screenshots?category=changed",
    });

    // Screenshot 3 is alone in the filtered result but still links to 2 and 4.
    expect(response.json()[0]).toMatchObject({ prev: "2", next: "4" });
  });

  it("rejects an unknown category", async () => {
    const { app } = await build();

    const response = await app.inject({
      url: "/api/screenshots?category=sideways",
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /api/screenshots/:id", () => {
  it("returns one screenshot", async () => {
    const { app } = await build();

    const response = await app.inject({ url: "/api/screenshots/3" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "3",
      diffPath: "/assets/screenshots/diff/Screenshot 3.png",
    });
  });

  it("404s for an unknown id", async () => {
    const { app } = await build();

    expect((await app.inject({ url: "/api/screenshots/99" })).statusCode).toBe(
      404,
    );
  });
});

describe("PATCH /api/screenshots/:id", () => {
  it("is gone — approving one screenshot is approve-batch with one name", async () => {
    // The handler validated `{ approved: true }` and then called the same
    // engine method `approve-batch` does, with `{ approved: false }` an
    // explicit no-op. Two spellings of one mutation; the route was removed
    // rather than carried into the client.
    const { app, engine } = await build();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/screenshots/1",
      payload: { approved: true },
    });

    expect(response.statusCode).toBe(404);
    expect(engine.approve).not.toHaveBeenCalled();
  });
});

describe("POST /api/screenshots/approve-batch", () => {
  it("approves several screenshots by name", async () => {
    const { app, engine } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: ["Screenshot 1", "Screenshot 3"] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      approved: ["Screenshot 1", "Screenshot 3"],
      errors: [],
    });
    expect(engine.approve).toHaveBeenCalledWith([
      "Screenshot 1",
      "Screenshot 3",
    ]);
  });

  it("reports names that could not be approved", async () => {
    const { app } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: ["Screenshot 1", "ghost"] },
    });

    expect(response.json()).toEqual({
      approved: ["Screenshot 1"],
      errors: [{ name: "ghost", error: "Screenshot not found" }],
    });
  });

  it("rejects an empty names array", async () => {
    const { app, engine } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(engine.approve).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const { app } = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: "Screenshot 1" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("refuses in read-only mode", async () => {
    const { app, engine } = await build({ readOnly: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: ["Screenshot 1"] },
    });

    expect(response.statusCode).toBe(403);
    expect(engine.approve).not.toHaveBeenCalled();
  });
});
