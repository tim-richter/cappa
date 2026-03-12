import { vol } from "memfs";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";

describe("GET /", () => {
  it("should return all screenshots", async () => {
    const app = await createServer({
      outputDir: "dist/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
          expectedPath: "/screenshots/expected/Screenshot 2.png",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
          actualPath: "/screenshots/actual/Screenshot 3.png",
          expectedPath: "/screenshots/expected/Screenshot 3.png",
          diffPath: "/screenshots/diff/Screenshot 3.png",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
          actualPath: "/screenshots/actual/Screenshot 4.png",
          expectedPath: "/screenshots/expected/Screenshot 4.png",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        name: "Screenshot 1",
        id: "1",
        category: "new",
        actualPath: "/assets/screenshots//screenshots/actual/Screenshot 1.png",
        next: "2",
      },
      {
        name: "Screenshot 2",
        id: "2",
        category: "deleted",
        expectedPath:
          "/assets/screenshots//screenshots/expected/Screenshot 2.png",
        next: "3",
        prev: "1",
      },
      {
        name: "Screenshot 3",
        id: "3",
        category: "changed",
        actualPath: "/assets/screenshots//screenshots/actual/Screenshot 3.png",
        expectedPath:
          "/assets/screenshots//screenshots/expected/Screenshot 3.png",
        diffPath: "/assets/screenshots//screenshots/diff/Screenshot 3.png",
        next: "4",
        prev: "2",
      },
      {
        name: "Screenshot 4",
        id: "4",
        category: "passed",
        actualPath: "/assets/screenshots//screenshots/actual/Screenshot 4.png",
        expectedPath:
          "/assets/screenshots//screenshots/expected/Screenshot 4.png",
        prev: "3",
      },
    ]);
  });

  it("should filter by category", async () => {
    const app = await createServer({
      outputDir: "dist/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
          expectedPath: "/screenshots/expected/Screenshot 2.png",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
          actualPath: "/screenshots/actual/Screenshot 3.png",
          expectedPath: "/screenshots/expected/Screenshot 3.png",
          diffPath: "/screenshots/diff/Screenshot 3.png",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
          actualPath: "/screenshots/actual/Screenshot 4.png",
          expectedPath: "/screenshots/expected/Screenshot 4.png",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots",
      query: { category: "new" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        name: "Screenshot 1",
        id: "1",
        category: "new",
        actualPath: "/assets/screenshots//screenshots/actual/Screenshot 1.png",
        next: "2",
      },
    ]);
  });

  it("should filter by search", async () => {
    const app = await createServer({
      outputDir: "dist/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
          expectedPath: "/screenshots/expected/Screenshot 2.png",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
          actualPath: "/screenshots/actual/Screenshot 3.png",
          expectedPath: "/screenshots/expected/Screenshot 3.png",
          diffPath: "/screenshots/diff/Screenshot 3.png",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
          actualPath: "/screenshots/actual/Screenshot 4.png",
          expectedPath: "/screenshots/expected/Screenshot 4.png",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots",
      query: { search: "Screenshot 2" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        name: "Screenshot 2",
        id: "2",
        category: "deleted",
        expectedPath:
          "/assets/screenshots//screenshots/expected/Screenshot 2.png",
        next: "3",
        prev: "1",
      },
    ]);
  });
});

describe("GET /:id", () => {
  it("should return a screenshot", async () => {
    const app = await createServer({
      outputDir: "dist/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
          expectedPath: "/screenshots/expected/Screenshot 2.png",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
          actualPath: "/screenshots/actual/Screenshot 3.png",
          expectedPath: "/screenshots/expected/Screenshot 3.png",
          diffPath: "/screenshots/diff/Screenshot 3.png",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
          actualPath: "/screenshots/actual/Screenshot 4.png",
          expectedPath: "/screenshots/expected/Screenshot 4.png",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots/1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: "Screenshot 1",
      id: "1",
      category: "new",
      actualPath: "/assets/screenshots//screenshots/actual/Screenshot 1.png",
      next: "2",
    });
  });

  it("should return a 404 if the screenshot does not exist", async () => {
    const app = await createServer({
      outputDir: "dist/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots/2",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Screenshot not found" });
  });
});

describe("PATCH /:id", () => {
  it("should update a screenshot", async () => {
    vol.fromJSON({
      "/screenshots/actual/Screenshot 1.png": "actual screenshot",
    });

    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
          approved: false,
          expectedPath: "/screenshots/expected/Screenshot 2.png",
        },
      ],
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/screenshots/1",
      body: {
        approved: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: "Screenshot 1",
      id: "1",
      category: "new",
      approved: true,
      actualPath: "/assets/screenshots//screenshots/actual/Screenshot 1.png",
      next: "2",
    });
  });

  it("should return a 404 if the screenshot does not exist", async () => {
    vol.fromJSON({
      "/screenshots/actual/Screenshot 1.png": "actual screenshot",
    });

    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
      ],
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/screenshots/2",
      body: {
        approved: true,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Screenshot not found",
    });
  });

  it("should return a 400 if the body is invalid", async () => {
    vol.fromJSON({
      "/screenshots/actual/Screenshot 1.png": "actual screenshot",
    });

    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
      ],
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/screenshots/1",
      body: {
        approved: "true",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        fieldErrors: {
          approved: ["approved must be a boolean"],
        },
        formErrors: [],
      },
    });
  });

  it("should move approved screenshots to expected directory", async () => {
    vol.fromJSON({
      "/screenshots/actual/Screenshot 1.png": "actual screenshot",
    });

    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
      ],
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/screenshots/1",
      body: {
        approved: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(vol.toJSON()).toEqual({
      "/screenshots/actual/Screenshot 1.png": "actual screenshot",
      "/screenshots/expected/Screenshot 1.png": "actual screenshot",
    });
  });

  it("should overwrite existing approved screenshots", async () => {
    vol.fromJSON({
      "/screenshots/actual/Screenshot 1.png": "actual screenshot",
      "/screenshots/expected/Screenshot 1.png": "existing screenshot",
    });

    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
      ],
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/screenshots/1",
      body: {
        approved: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(vol.toJSON()).toEqual({
      "/screenshots/actual/Screenshot 1.png": "actual screenshot",
      "/screenshots/expected/Screenshot 1.png": "actual screenshot",
    });
  });
});

describe("POST /approve-batch", () => {
  it("should approve multiple screenshots and move to expected directory", async () => {
    vol.fromJSON({
      "/screenshots/actual/Screenshot 1.png": "actual 1",
      "/screenshots/actual/Screenshot 2.png": "actual 2",
    });

    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 2.png",
        },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: ["Screenshot 1", "Screenshot 2"] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { approved: string[]; errors: unknown[] };
    expect(body.approved).toEqual(["Screenshot 1", "Screenshot 2"]);
    expect(body.errors).toEqual([]);

    expect(vol.toJSON()).toEqual({
      "/screenshots/actual/Screenshot 1.png": "actual 1",
      "/screenshots/actual/Screenshot 2.png": "actual 2",
      "/screenshots/expected/Screenshot 1.png": "actual 1",
      "/screenshots/expected/Screenshot 2.png": "actual 2",
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/screenshots",
    });
    const list = listResponse.json() as { approved?: boolean }[];
    expect(list.every((s) => s.approved)).toBe(true);
  });

  it("should return 400 if names is empty", async () => {
    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should skip already approved and collect errors for missing files", async () => {
    vol.fromJSON({
      "/screenshots/actual/Screenshot 1.png": "actual 1",
    });

    const app = await createServer({
      outputDir: "/screenshots",
      logger: false,
      screenshots: [
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 1.png",
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "new",
          approved: true,
          actualPath: "/screenshots/actual/Screenshot 2.png",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "new",
          approved: false,
          actualPath: "/screenshots/actual/Screenshot 3.png",
        },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/approve-batch",
      payload: { names: ["Screenshot 1", "Screenshot 2", "Screenshot 3"] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      approved: string[];
      errors: { name: string; error: string }[];
    };
    expect(body.approved).toEqual(["Screenshot 1"]);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0].name).toBe("Screenshot 3");
    expect(body.errors[0].error).toBeDefined();
  });
});
