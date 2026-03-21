import { initLogger } from "@cappa/logger";
import { vol } from "memfs";
import { beforeEach, vi } from "vitest";

vi.mock("node:fs");
vi.mock("node:fs/promises");

beforeEach(() => {
  initLogger(0);
  // reset the state of in-memory fs
  vol.reset();
});
