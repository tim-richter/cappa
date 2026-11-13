import { initLogger } from "@cappa/logger";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getConfigMock, removeMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock("@cappa/config", () => ({ getConfig: getConfigMock }));
vi.mock("@cappa/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cappa/core")>()),
  removePlaywrightContainers: removeMock,
}));

import { browserDown } from "./browser";

const withContainer = (container: unknown) => ({
  browser: { provider: { name: "playwright", options: { container } } },
});

beforeAll(() => {
  initLogger(0);
});

beforeEach(() => {
  getConfigMock.mockReset();
  removeMock.mockReset().mockResolvedValue([]);
  vi.unstubAllEnvs();
});

describe("browserDown", () => {
  it("uses --cli over everything else", async () => {
    getConfigMock.mockResolvedValue(withContainer({ cli: "podman" }));

    await browserDown({ cli: "nerdctl" });

    expect(removeMock).toHaveBeenCalledWith({ cli: "nerdctl" });
    expect(getConfigMock).not.toHaveBeenCalled();
  });

  it("uses the config's container cli", async () => {
    getConfigMock.mockResolvedValue(withContainer({ cli: "podman" }));

    await browserDown();

    expect(removeMock).toHaveBeenCalledWith({ cli: "podman" });
  });

  it("falls back to CAPPA_CONTAINER_CLI, then docker", async () => {
    getConfigMock.mockResolvedValue(withContainer(undefined));
    vi.stubEnv("CAPPA_CONTAINER_CLI", "podman");
    await browserDown();
    expect(removeMock).toHaveBeenLastCalledWith({ cli: "podman" });

    vi.unstubAllEnvs();
    vi.stubEnv("CAPPA_CONTAINER_CLI", undefined);
    await browserDown();
    expect(removeMock).toHaveBeenLastCalledWith({ cli: "docker" });
  });

  it("still cleans up when the config does not load", async () => {
    getConfigMock.mockRejectedValue(new Error("no cappa.config.ts"));

    await browserDown();

    expect(removeMock).toHaveBeenCalledWith({ cli: "docker" });
  });
});
