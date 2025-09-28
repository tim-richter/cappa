import { vol } from "memfs";
import { beforeEach, vi } from "vitest";

vi.mock("node:fs");
vi.mock("node:fs/promises");

beforeEach(() => {
  // reset the state of in-memory fs
  vol.reset();
});
