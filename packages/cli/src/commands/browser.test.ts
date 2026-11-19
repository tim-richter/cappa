import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initLogger } from "@cappa/logger";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { getConfigMock, removeMock, removeImagesMock, buildMock, versionMock } =
  vi.hoisted(() => ({
    getConfigMock: vi.fn(),
    removeMock: vi.fn(),
    removeImagesMock: vi.fn(),
    buildMock: vi.fn(),
    versionMock: vi.fn(),
  }));

vi.mock("@cappa/config", () => ({ getConfig: getConfigMock }));
vi.mock("@cappa/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cappa/core")>()),
  removePlaywrightContainers: removeMock,
  removePlaywrightImages: removeImagesMock,
  buildPlaywrightImage: buildMock,
  installedPlaywrightVersion: versionMock,
}));

import { browserBuild, browserDown } from "./browser";

const withContainer = (container: unknown) => ({
  browser: { provider: { name: "playwright", options: { container } } },
});

beforeAll(() => {
  initLogger(0);
});

beforeEach(() => {
  getConfigMock.mockReset();
  removeMock.mockReset().mockResolvedValue([]);
  removeImagesMock.mockReset().mockResolvedValue([]);
  buildMock
    .mockReset()
    .mockResolvedValue({ tag: "cappa-browser:v1.63.0-abcd1234", built: true });
  versionMock.mockReset().mockReturnValue("1.63.0");
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

  it("keeps images unless --images is given", async () => {
    getConfigMock.mockResolvedValue(withContainer(true));

    await browserDown({ cli: "docker" });

    expect(removeImagesMock).not.toHaveBeenCalled();
  });

  it("also removes built images with --images, after the containers", async () => {
    await browserDown({ cli: "podman", images: true });

    expect(removeImagesMock).toHaveBeenCalledWith({ cli: "podman" });
    expect(removeMock.mock.invocationCallOrder[0]).toBeLessThan(
      removeImagesMock.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe("browserBuild", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cappa-browser-build-"));
  writeFileSync(path.join(dir, "browser.Dockerfile"), "FROM x\n");
  const dockerfile = path.join(dir, "browser.Dockerfile");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("force-builds the configured image, then removes its containers", async () => {
    getConfigMock.mockResolvedValue(
      withContainer({ cli: "podman", build: dockerfile }),
    );
    removeMock.mockResolvedValue(["cappa-playwright-v1.63.0-x"]);

    await browserBuild();

    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cli: "podman",
        version: "1.63.0",
        force: true,
        build: {
          dockerfile,
          context: dir,
          target: null,
          args: {},
        },
      }),
    );
    expect(removeMock).toHaveBeenCalledWith({
      cli: "podman",
      image: "cappa-browser:v1.63.0-abcd1234",
    });
  });

  it("uses --cli over the config", async () => {
    getConfigMock.mockResolvedValue(
      withContainer({ cli: "podman", build: dockerfile }),
    );

    await browserBuild({ cli: "nerdctl" });

    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({ cli: "nerdctl" }),
    );
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({ cli: "nerdctl" }),
    );
  });

  it.each([
    ["no container", undefined],
    ["a container without build", { image: "corp/pw" }],
    ["container: true", true],
  ])("explains %s", async (_label, container) => {
    getConfigMock.mockResolvedValue(withContainer(container));

    await expect(browserBuild()).rejects.toThrow(
      /needs playwright\(\{ container: \{ build \} \}\)/,
    );
    expect(buildMock).not.toHaveBeenCalled();
  });

  it("does not remove containers when the build fails", async () => {
    getConfigMock.mockResolvedValue(withContainer({ build: dockerfile }));
    buildMock.mockRejectedValue(new Error("Could not build"));

    await expect(browserBuild()).rejects.toThrow(/Could not build/);
    expect(removeMock).not.toHaveBeenCalled();
  });
});
