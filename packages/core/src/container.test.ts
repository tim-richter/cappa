import { describe, expect, it, vi } from "vitest";
import {
  BUILT_IMAGE_REPOSITORY,
  buildCommandArgs,
  buildImageTag,
  buildPlaywrightImage,
  CONTAINER_IMAGE_LABEL,
  CONTAINER_LABEL,
  containerImage,
  containerName,
  type Exec,
  ensurePlaywrightContainer,
  parsePort,
  removePlaywrightContainers,
  removePlaywrightImages,
} from "./container";
import type { ResolvedContainerBuild } from "./playwright";

type Handler = (args: string[]) => string | Error;

/**
 * A fake container CLI. `handlers` is keyed by the first argument (plus the
 * second for `image inspect`); unmatched calls succeed with empty output.
 */
const fakeCli = (handlers: Record<string, Handler> = {}) => {
  const calls: string[][] = [];
  const exec = vi.fn<Exec>(async (file, args) => {
    calls.push([file, ...args]);
    const key = args[0] === "image" ? `image ${args[1]}` : (args[0] ?? "");
    const result = handlers[key]?.(args) ?? "";
    if (result instanceof Error) throw result;
    return { stdout: result, stderr: "" };
  });
  return { exec, calls };
};

const cliError = (stderr: string, code?: string) =>
  Object.assign(new Error("Command failed"), { stderr, code });

const base = {
  version: "1.63.0",
  packageDir: "/repo/node_modules/playwright-core",
  cli: "docker",
  image: "mcr.microsoft.com/playwright:v{version}-noble",
  runArgs: [],
  readyTimeout: 10_000,
  sleep: async () => {},
};

const name = containerName(
  "1.63.0",
  "mcr.microsoft.com/playwright:v1.63.0-noble",
  [],
  "/repo/node_modules/playwright-core",
);

describe("helpers", () => {
  it("templates the version into the image", () => {
    expect(containerImage("registry/pw:v{version}-fonts", "1.2.3")).toBe(
      "registry/pw:v1.2.3-fonts",
    );
  });

  it("names containers per version, image, run args and package dir", () => {
    expect(name).toMatch(/^cappa-playwright-v1\.63\.0-[0-9a-f]{8}$/);
    expect(containerName("1.63.0", "other", [])).not.toBe(name);
    expect(
      containerName(
        "1.63.0",
        "mcr.microsoft.com/playwright:v1.63.0-noble",
        ["--network=x"],
        "/repo/node_modules/playwright-core",
      ),
    ).not.toBe(name);
    expect(
      containerName(
        "1.63.0",
        "mcr.microsoft.com/playwright:v1.63.0-noble",
        [],
        "/other/playwright-core",
      ),
    ).not.toBe(name);
  });

  it("parses the host port from `port` output", () => {
    expect(parsePort("127.0.0.1:49153\n")).toBe(49153);
    expect(parsePort("0.0.0.0:1234\n[::]:1234\n")).toBe(1234);
    expect(parsePort("")).toBeNull();
  });
});

describe("ensurePlaywrightContainer", () => {
  it("pulls a missing image, starts the container and waits for the server", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => cliError("No such object"),
      "image inspect": () => cliError("No such image"),
      port: () => "127.0.0.1:49153\n",
    });
    const probe = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const log = vi.fn();

    const container = await ensurePlaywrightContainer({
      ...base,
      exec,
      probe,
      log,
    });

    expect(container).toMatchObject({
      wsEndpoint: "ws://127.0.0.1:49153/",
      name,
      image: "mcr.microsoft.com/playwright:v1.63.0-noble",
      reused: false,
    });
    expect(probe).toHaveBeenCalledWith("http://127.0.0.1:49153/");
    expect(calls).toContainEqual([
      "docker",
      "pull",
      "mcr.microsoft.com/playwright:v1.63.0-noble",
    ]);
    expect(calls.find((c) => c[1] === "run")).toEqual([
      "docker",
      "run",
      "-d",
      "--init",
      "--ipc=host",
      "--user",
      "pwuser",
      "--workdir",
      "/home/pwuser",
      "-p",
      "127.0.0.1::3000",
      "--mount",
      "type=bind,source=/repo/node_modules/playwright-core,target=/opt/playwright-core,readonly",
      "--label",
      `${CONTAINER_LABEL}=1.63.0`,
      "--label",
      `${CONTAINER_IMAGE_LABEL}=mcr.microsoft.com/playwright:v1.63.0-noble`,
      "--name",
      name,
      "mcr.microsoft.com/playwright:v1.63.0-noble",
      "node",
      "/opt/playwright-core/cli.js",
      "run-server",
      "--port",
      "3000",
      "--host",
      "0.0.0.0",
    ]);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Pulling/));
  });

  it("uses the configured CLI, image and run args", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => cliError("no such container"),
      port: () => "127.0.0.1:5000",
    });

    const container = await ensurePlaywrightContainer({
      ...base,
      cli: "podman",
      image: "registry.corp/pw:{version}-fonts",
      runArgs: ["--userns=keep-id"],
      exec,
      probe: async () => true,
    });

    expect(calls.every(([file]) => file === "podman")).toBe(true);
    const run = calls.find((c) => c[1] === "run") ?? [];
    // Run args go right before the image.
    expect(run.slice(-9, -7)).toEqual([
      "--userns=keep-id",
      "registry.corp/pw:1.63.0-fonts",
    ]);
    // Image already present: no pull.
    expect(calls.some((c) => c[1] === "pull")).toBe(false);
    expect(container.wsEndpoint).toBe("ws://127.0.0.1:5000/");
  });

  it("reuses a running container without pulling or starting", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => "true\n",
      port: () => "127.0.0.1:41000",
    });

    const container = await ensurePlaywrightContainer({
      ...base,
      exec,
      probe: async () => true,
    });

    expect(container.reused).toBe(true);
    expect(calls.map((c) => c[1])).toEqual(["version", "inspect", "port"]);
  });

  it("replaces a stopped container", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => "false\n",
      port: () => "127.0.0.1:41000",
    });

    await ensurePlaywrightContainer({ ...base, exec, probe: async () => true });

    const verbs = calls.map((c) => c[1]);
    expect(verbs.indexOf("rm")).toBeLessThan(verbs.indexOf("run"));
  });

  it("uses the container another process created first", async () => {
    const { exec } = fakeCli({
      inspect: () => cliError("no such container"),
      run: () =>
        cliError(`Conflict. The container name "/${name}" is already in use`),
      port: () => "127.0.0.1:41000",
    });

    const container = await ensurePlaywrightContainer({
      ...base,
      exec,
      probe: async () => true,
    });

    expect(container.reused).toBe(true);
  });

  it("explains a missing CLI", async () => {
    const { exec } = fakeCli({
      version: () => cliError("", "ENOENT"),
    });

    await expect(
      ensurePlaywrightContainer({ ...base, cli: "nerdctl", exec }),
    ).rejects.toThrow(/Container CLI "nerdctl" not found/);
  });

  it("explains a stopped podman machine", async () => {
    const { exec } = fakeCli({
      version: () => cliError("Cannot connect to Podman"),
    });

    await expect(
      ensurePlaywrightContainer({ ...base, cli: "podman", exec }),
    ).rejects.toThrow(/podman machine start/);
  });

  it("explains an image that cannot be pulled", async () => {
    const { exec } = fakeCli({
      inspect: () => cliError("no such container"),
      "image inspect": () => cliError("no such image"),
      pull: () => cliError("manifest unknown"),
    });

    await expect(
      ensurePlaywrightContainer({ ...base, version: "1.99.0-next", exec }),
    ).rejects.toThrow(
      /Could not pull mcr\.microsoft\.com\/playwright:v1\.99\.0-next-noble[\s\S]*manifest unknown/,
    );
  });

  it("reports a container that died during startup, with its logs", async () => {
    let inspects = 0;
    const { exec, calls } = fakeCli({
      // absent at first, then present-but-stopped once it crashed
      inspect: () => (inspects++ === 0 ? cliError("no such") : "false"),
      port: () => "",
      logs: () => "Error: Cannot find module '/opt/playwright-core/cli.js'",
    });

    await expect(
      ensurePlaywrightContainer({ ...base, exec, probe: async () => false }),
    ).rejects.toThrow(
      /exited before its server came up[\s\S]*Cannot find module/,
    );
    expect(calls.at(-1)?.slice(1, 3)).toEqual(["rm", "-f"]);
  });

  it("times out with the container logs", async () => {
    let time = 0;
    const { exec } = fakeCli({
      inspect: (args) => (args.includes("{{.State.Running}}") ? "true" : ""),
      port: () => "127.0.0.1:41000",
      logs: () => "still pulling",
    });

    await expect(
      ensurePlaywrightContainer({
        ...base,
        readyTimeout: 1_000,
        exec,
        probe: async () => false,
        now: () => time,
        sleep: async (ms) => {
          time += ms;
        },
      }),
    ).rejects.toThrow(/Timed out after 1000ms[\s\S]*still pulling/);
  });

  it("stop() removes the container", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => "true",
      port: () => "127.0.0.1:41000",
    });
    const container = await ensurePlaywrightContainer({
      ...base,
      exec,
      probe: async () => true,
    });

    await container.stop();

    expect(calls.at(-1)).toEqual(["docker", "rm", "-f", name]);
  });
});

describe("removePlaywrightContainers", () => {
  it("removes every labelled container", async () => {
    const { exec, calls } = fakeCli({
      ps: () =>
        "cappa-playwright-v1.62.0-aaaa\ncappa-playwright-v1.63.0-bbbb\n",
    });

    const removed = await removePlaywrightContainers({ cli: "podman", exec });

    expect(removed).toEqual([
      "cappa-playwright-v1.62.0-aaaa",
      "cappa-playwright-v1.63.0-bbbb",
    ]);
    expect(calls[0]).toEqual([
      "podman",
      "ps",
      "-a",
      "--filter",
      `label=${CONTAINER_LABEL}`,
      "--format",
      "{{.Names}}",
    ]);
    expect(calls[1]).toEqual(["podman", "rm", "-f", ...removed]);
  });

  it("narrows to the containers running one image", async () => {
    const { exec, calls } = fakeCli({ ps: () => "cappa-playwright-x\n" });

    await removePlaywrightContainers({
      cli: "docker",
      image: "cappa-browser:v1.63.0-abcd1234",
      exec,
    });

    expect(calls[0]).toContain(
      `label=${CONTAINER_IMAGE_LABEL}=cappa-browser:v1.63.0-abcd1234`,
    );
  });

  it("does nothing when there are none", async () => {
    const { exec, calls } = fakeCli();

    expect(await removePlaywrightContainers({ cli: "docker", exec })).toEqual(
      [],
    );
    expect(calls).toHaveLength(1);
  });
});

describe("built images", () => {
  const build: ResolvedContainerBuild = {
    dockerfile: "/repo/browser.Dockerfile",
    context: "/repo",
    target: null,
    args: {},
  };
  const dockerfile = "FROM node:24-bookworm-slim\n";
  const readFile = vi.fn(async (_file: string) => dockerfile);
  const tag = buildImageTag("1.63.0", build, dockerfile);

  it("tags per version, Dockerfile contents, context, target and args", () => {
    expect(tag).toMatch(
      new RegExp(`^${BUILT_IMAGE_REPOSITORY}:v1\\.63\\.0-[0-9a-f]{8}$`),
    );
    expect(buildImageTag("1.63.0", build, dockerfile)).toBe(tag);
    const variants = [
      buildImageTag("1.64.0", build, dockerfile),
      buildImageTag("1.63.0", build, `${dockerfile}RUN true\n`),
      buildImageTag("1.63.0", { ...build, context: "/other" }, dockerfile),
      buildImageTag("1.63.0", { ...build, target: "browser" }, dockerfile),
      buildImageTag("1.63.0", { ...build, args: { A: "1" } }, dockerfile),
    ];
    expect(new Set([tag, ...variants]).size).toBe(variants.length + 1);
    // Arg order does not matter.
    expect(
      buildImageTag("1.63.0", { ...build, args: { A: "1", B: "2" } }, ""),
    ).toBe(buildImageTag("1.63.0", { ...build, args: { B: "2", A: "1" } }, ""));
  });

  it("builds with every option in the argv", () => {
    expect(
      buildCommandArgs(
        "1.63.0",
        {
          ...build,
          target: "browser",
          args: { NODE_VERSION: "24.22.1", APT_MIRROR: "x" },
        },
        "cappa-browser:v1.63.0-abcd1234",
      ),
    ).toEqual([
      "build",
      "-f",
      "/repo/browser.Dockerfile",
      "-t",
      "cappa-browser:v1.63.0-abcd1234",
      "--build-arg",
      "PLAYWRIGHT_VERSION=1.63.0",
      "--build-arg",
      "NODE_VERSION=24.22.1",
      "--build-arg",
      "APT_MIRROR=x",
      "--target",
      "browser",
      "--label",
      `${CONTAINER_LABEL}=1.63.0`,
      "/repo",
    ]);
  });

  it("builds a missing image, then runs it", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => cliError("no such container"),
      "image inspect": () => cliError("no such image"),
      port: () => "127.0.0.1:41000",
    });
    const log = vi.fn();

    const container = await ensurePlaywrightContainer({
      ...base,
      build,
      exec,
      readFile,
      log,
      probe: async () => true,
    });

    expect(container.image).toBe(tag);
    expect(container.name).toBe(
      containerName("1.63.0", tag, [], base.packageDir),
    );
    expect(calls.some((c) => c[1] === "pull")).toBe(false);
    expect(calls.find((c) => c[1] === "build")).toEqual([
      "docker",
      ...buildCommandArgs("1.63.0", build, tag),
    ]);
    const verbs = calls.map((c) => c[1]);
    expect(verbs.indexOf("build")).toBeLessThan(verbs.indexOf("run"));
    expect(calls.find((c) => c[1] === "run")).toContain(tag);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Building cappa-browser:v1\.63\.0-\w{8} from \/repo\/browser\.Dockerfile \(first run only/,
      ),
    );
  });

  it("reuses a built image without building again", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => cliError("no such container"),
      port: () => "127.0.0.1:41000",
    });

    await ensurePlaywrightContainer({
      ...base,
      build,
      exec,
      readFile,
      probe: async () => true,
    });

    expect(calls).toContainEqual(["docker", "image", "inspect", tag]);
    expect(calls.some((c) => c[1] === "build")).toBe(false);
  });

  it("does not build while the container for the tag is running", async () => {
    const { exec, calls } = fakeCli({
      inspect: () => "true",
      port: () => "127.0.0.1:41000",
    });

    const container = await ensurePlaywrightContainer({
      ...base,
      build,
      exec,
      readFile,
      probe: async () => true,
    });

    expect(container.reused).toBe(true);
    expect(calls.map((c) => c[1])).toEqual(["version", "inspect", "port"]);
  });

  it("explains a failed build with the Dockerfile and the end of its output", async () => {
    const output = Array.from({ length: 50 }, (_, i) => `step ${i}`).join("\n");
    const { exec } = fakeCli({
      inspect: () => cliError("no such container"),
      "image inspect": () => cliError("no such image"),
      build: () => cliError(`${output}\nE: Unable to locate package nope`),
    });

    const error: Error = await ensurePlaywrightContainer({
      ...base,
      build,
      exec,
      readFile,
    }).then(
      () => {
        throw new Error("expected the build to fail");
      },
      (e: Error) => e,
    );

    expect(error.message).toMatch(
      /^Could not build cappa-browser:v1\.63\.0-\w{8} from \/repo\/browser\.Dockerfile\./,
    );
    expect(error.message).toContain("Unable to locate package nope");
    expect(error.message).toContain("step 49");
    expect(error.message).not.toContain("step 0\n");
  });

  it("explains an unreadable Dockerfile", async () => {
    const { exec } = fakeCli();

    await expect(
      ensurePlaywrightContainer({
        ...base,
        build,
        exec,
        readFile: async () => {
          throw new Error("ENOENT");
        },
      }),
    ).rejects.toThrow(
      /Could not read the Dockerfile \/repo\/browser\.Dockerfile/,
    );
  });

  it.each([
    ["build", { build }],
    ["pull", {}],
  ])("does not count the %s against readyTimeout", async (verb, extra) => {
    let time = 0;
    const { exec } = fakeCli({
      inspect: () => cliError("no such container"),
      "image inspect": () => cliError("no such image"),
      [verb]: () => {
        time += 60_000; // a slow pull/build
        return "";
      },
      port: () => "127.0.0.1:41000",
    });
    const probe = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const container = await ensurePlaywrightContainer({
      ...base,
      ...extra,
      readyTimeout: 1_000,
      exec,
      readFile,
      probe,
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    });

    expect(container.wsEndpoint).toBe("ws://127.0.0.1:41000/");
  });

  describe("buildPlaywrightImage", () => {
    it("rebuilds an existing tag when forced", async () => {
      const { exec, calls } = fakeCli();
      const log = vi.fn();

      const result = await buildPlaywrightImage({
        cli: "podman",
        version: "1.63.0",
        build,
        force: true,
        exec,
        readFile,
        log,
      });

      expect(result).toEqual({ tag, built: true });
      expect(calls.map((c) => c[1])).toEqual(["build"]);
      expect(log).toHaveBeenCalledWith(
        expect.not.stringContaining("first run only"),
      );
    });

    it("reports an existing tag without building", async () => {
      const { exec, calls } = fakeCli();

      expect(
        await buildPlaywrightImage({
          cli: "docker",
          version: "1.63.0",
          build,
          exec,
          readFile,
        }),
      ).toEqual({ tag, built: false });
      expect(calls.map((c) => c[1])).toEqual(["image"]);
    });

    it("explains a missing CLI", async () => {
      const { exec, calls } = fakeCli({
        "image inspect": () => cliError("", "ENOENT"),
      });

      await expect(
        buildPlaywrightImage({
          cli: "nerdctl",
          version: "1.63.0",
          build,
          exec,
          readFile,
        }),
      ).rejects.toThrow(/Container CLI "nerdctl" not found/);
      // No build attempt after the CLI turned out to be missing.
      expect(calls.some((c) => c[1] === "build")).toBe(false);
    });
  });
});

describe("removePlaywrightImages", () => {
  it("removes every labelled image once", async () => {
    const { exec, calls } = fakeCli({ images: () => "aaa\nbbb\naaa\n" });

    expect(await removePlaywrightImages({ cli: "podman", exec })).toEqual([
      "aaa",
      "bbb",
    ]);
    expect(calls).toEqual([
      ["podman", "images", "--filter", `label=${CONTAINER_LABEL}`, "-q"],
      ["podman", "rmi", "aaa", "bbb"],
    ]);
  });

  it("does nothing when there are none", async () => {
    const { exec, calls } = fakeCli();

    expect(await removePlaywrightImages({ cli: "docker", exec })).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("explains a failed rmi", async () => {
    const { exec } = fakeCli({
      images: () => "aaa",
      rmi: () => cliError("image is being used by running container"),
    });

    await expect(
      removePlaywrightImages({ cli: "docker", exec }),
    ).rejects.toThrow(/"docker rmi" failed[\s\S]*being used/);
  });
});
