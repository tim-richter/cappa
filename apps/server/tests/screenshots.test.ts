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
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
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
        next: "2",
      },
      {
        name: "Screenshot 2",
        id: "2",
        category: "deleted",
        next: "3",
        prev: "1",
      },
      {
        name: "Screenshot 3",
        id: "3",
        category: "changed",
        next: "4",
        prev: "2",
      },
      {
        name: "Screenshot 4",
        id: "4",
        category: "passed",
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
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
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
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
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
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
        },
        {
          name: "Screenshot 3",
          id: "3",
          category: "changed",
        },
        {
          name: "Screenshot 4",
          id: "4",
          category: "passed",
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
        },
        {
          name: "Screenshot 2",
          id: "2",
          category: "deleted",
          approved: false,
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
