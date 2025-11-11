import path from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const fsMock = {
  existsSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
};

vi.mock("node:fs", () => ({
  __esModule: true,
  default: fsMock,
  ...fsMock,
}));

const screenshotToolInstances: Array<{
  options: unknown;
  close: ReturnType<typeof vi.fn>;
  init: ReturnType<typeof vi.fn>;
  concurrency: number;
  getPageFromPool: ReturnType<typeof vi.fn>;
}> = [];

const screenshotFileSystemInstances: Array<{
  outputDir: string;
  clearActual: ReturnType<typeof vi.fn>;
  clearDiff: ReturnType<typeof vi.fn>;
  approveFromActualPath: ReturnType<typeof vi.fn>;
}> = [];

const imagesMatchMock = vi.fn();

vi.mock("@cappa/core", () => ({
  ScreenshotTool: class {
    options: unknown;
    close: ReturnType<typeof vi.fn>;
    init: ReturnType<typeof vi.fn>;
    concurrency: number;
    getPageFromPool: ReturnType<typeof vi.fn>;

    constructor(options: unknown) {
      this.options = options;
      this.close = vi.fn();
      this.init = vi.fn();
      this.concurrency = 1;
      this.getPageFromPool = vi.fn();
      screenshotToolInstances.push(this);
    }
  },
  ScreenshotFileSystem: class {
    outputDir: string;
    clearActual: ReturnType<typeof vi.fn>;
    clearDiff: ReturnType<typeof vi.fn>;
    approveFromActualPath: ReturnType<typeof vi.fn>;

    constructor(outputDir: string) {
      this.outputDir = outputDir;
      this.clearActual = vi.fn();
      this.clearDiff = vi.fn();
      this.approveFromActualPath = vi.fn();
      screenshotFileSystemInstances.push(this);
    }
  },
  imagesMatch: imagesMatchMock,
}));

const createLoggerInstance = () => ({
  level: 4,
  debug: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  box: vi.fn(),
});

let loggerInstance = createLoggerInstance();
const getLoggerMock = vi.fn(() => loggerInstance);
const initLoggerMock = vi.fn(() => loggerInstance);

vi.mock("@cappa/logger", () => ({
  getLogger: getLoggerMock,
  initLogger: initLoggerMock,
}));

const serverInstances: Array<{ listen: ReturnType<typeof vi.fn> }> = [];
const createServerMock = vi.fn(async () => {
  const server = {
    listen: vi.fn().mockResolvedValue(undefined),
  };
  serverInstances.push(server);
  return server;
});

vi.mock("@cappa/server", () => ({
  createServer: createServerMock,
}));

const globMock = vi.fn().mockResolvedValue([]);

vi.mock("node:fs/promises", () => ({
  __esModule: true,
  glob: globMock,
}));

const loadConfigMock = vi.fn();
const getConfigMock = vi.fn();
vi.mock("./features/config", () => ({
  loadConfig: loadConfigMock,
  getConfig: getConfigMock,
}));

const groupScreenshotsMock = vi.fn();
vi.mock("./utils/groupScreenshots", () => ({
  groupScreenshots: groupScreenshotsMock,
}));

const identity = (value: string) => value;
vi.mock("chalk", () => ({
  __esModule: true,
  default: {
    yellow: identity,
    red: identity,
    green: identity,
    blue: identity,
  },
  yellow: identity,
  red: identity,
  green: identity,
  blue: identity,
}));

let run: () => Promise<void>;
const originalArgv = [...process.argv];

beforeAll(async () => {
  ({ run } = await import("./index"));
});

beforeEach(() => {
  Object.values(fsMock).forEach((mockFn) => {
    mockFn.mockReset();
  });
  imagesMatchMock.mockReset();
  screenshotToolInstances.length = 0;
  screenshotFileSystemInstances.length = 0;
  serverInstances.length = 0;
  globMock.mockReset();
  globMock.mockImplementation(() => Promise.resolve([]));
  loadConfigMock.mockReset();
  getConfigMock.mockReset();
  groupScreenshotsMock.mockReset();

  fsMock.existsSync.mockReturnValue(false);

  loggerInstance = createLoggerInstance();
  getLoggerMock.mockReset();
  getLoggerMock.mockImplementation(() => loggerInstance);
  initLoggerMock.mockReset();
  initLoggerMock.mockImplementation(() => loggerInstance);
});

afterEach(() => {
  process.argv = [...originalArgv];
  process.exitCode = undefined;
});

describe("cappa CLI", () => {
  test("capture command cleans directories and runs plugins", async () => {
    const pluginExecute = vi.fn().mockResolvedValue(undefined);
    const pluginDiscover = vi.fn().mockResolvedValue([]);

    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screenshots",
      diff: { threshold: 0.2 },
      retries: 5,
      plugins: [
        { name: "plugin", discover: pluginDiscover, execute: pluginExecute },
      ],
    });

    process.argv = ["node", "cappa", "capture"];
    await run();

    expect(getConfigMock).toHaveBeenCalled();
    expect(screenshotFileSystemInstances).toHaveLength(1);
    expect(screenshotFileSystemInstances[0]).toMatchObject({
      outputDir: "/tmp/screenshots",
    });
    expect(screenshotFileSystemInstances[0]?.clearActual).toHaveBeenCalled();
    expect(screenshotFileSystemInstances[0]?.clearDiff).toHaveBeenCalled();

    expect(pluginDiscover).toHaveBeenCalledTimes(1);
    expect(pluginExecute).toHaveBeenCalledTimes(0); // No tasks to execute
    expect(screenshotToolInstances).toHaveLength(1);
    expect(pluginDiscover).toHaveBeenCalledWith(screenshotToolInstances[0]);
    expect(screenshotToolInstances[0]?.close).toHaveBeenCalled();
    expect(screenshotToolInstances[0]).toMatchObject({
      options: {
        outputDir: "/tmp/screenshots",
        diff: { threshold: 0.2 },
        retries: 5,
      },
    });
  });

  test("capture command does not trigger onFail callback", async () => {
    const onFail = vi.fn().mockResolvedValue(undefined);

    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screenshots",
      diff: { threshold: 0.2 },
      retries: 2,
      concurrency: 1,
      plugins: [],
      onFail,
    });

    process.argv = ["node", "cappa", "capture"];

    await run();

    // onFail should not be called by capture command
    expect(onFail).not.toHaveBeenCalled();
    expect(groupScreenshotsMock).not.toHaveBeenCalled();
  });

  test("ci command triggers onFail callback with failing screenshots", async () => {
    const onFail = vi.fn().mockResolvedValue(undefined);

    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screenshots",
      diff: { threshold: 0.2 },
      retries: 2,
      concurrency: 1,
      plugins: [],
      onFail,
    });

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve([
          "/tmp/screenshots/actual/button.png",
          "/tmp/screenshots/actual/passed.png",
        ]);
      }
      if (pattern.includes("/expected/")) {
        return Promise.resolve([
          "/tmp/screenshots/expected/button.png",
          "/tmp/screenshots/expected/passed.png",
        ]);
      }
      if (pattern.includes("/diff/")) {
        return Promise.resolve(["/tmp/screenshots/diff/button.png"]);
      }

      return Promise.resolve([]);
    });

    groupScreenshotsMock.mockResolvedValue([
      {
        id: "1",
        name: "button",
        category: "changed",
        actualPath: "actual/button.png",
        expectedPath: "expected/button.png",
        diffPath: "diff/button.png",
        approved: false,
      },
      {
        id: "2",
        name: "passed",
        category: "passed",
        actualPath: "actual/passed.png",
        expectedPath: "expected/passed.png",
        approved: true,
      },
    ]);

    process.argv = ["node", "cappa", "ci"];

    await run();

    expect(groupScreenshotsMock).toHaveBeenCalledWith(
      [
        "/tmp/screenshots/actual/button.png",
        "/tmp/screenshots/actual/passed.png",
      ],
      [
        "/tmp/screenshots/expected/button.png",
        "/tmp/screenshots/expected/passed.png",
      ],
      ["/tmp/screenshots/diff/button.png"],
      "/tmp/screenshots",
    );

    expect(onFail).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "1",
        name: "button",
        category: "changed",
        actualPath: "actual/button.png",
        expectedPath: "expected/button.png",
        diffPath: "diff/button.png",
        absoluteActualPath: path.resolve(
          "/tmp/screenshots",
          "actual/button.png",
        ),
        absoluteExpectedPath: path.resolve(
          "/tmp/screenshots",
          "expected/button.png",
        ),
        absoluteDiffPath: path.resolve("/tmp/screenshots", "diff/button.png"),
      }),
    ]);
  });

  test("ci command does not trigger onFail callback when there are no failing screenshots", async () => {
    const onFail = vi.fn().mockResolvedValue(undefined);

    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screenshots",
      diff: { threshold: 0.2 },
      retries: 2,
      concurrency: 1,
      plugins: [],
      onFail,
    });

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve(["/tmp/screenshots/actual/passed.png"]);
      }
      if (pattern.includes("/expected/")) {
        return Promise.resolve(["/tmp/screenshots/expected/passed.png"]);
      }
      if (pattern.includes("/diff/")) {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });

    groupScreenshotsMock.mockResolvedValue([
      {
        id: "1",
        name: "passed",
        category: "passed",
        actualPath: "actual/passed.png",
        expectedPath: "expected/passed.png",
        approved: true,
      },
    ]);

    process.argv = ["node", "cappa", "ci"];

    await run();

    expect(groupScreenshotsMock).toHaveBeenCalled();
    // onFail should not be called when all screenshots pass
    expect(onFail).not.toHaveBeenCalled();
  });

  test("capture command exits with code 1 when a screenshot comparison fails", async () => {
    const pluginDiscover = vi
      .fn()
      .mockResolvedValue([{ id: "task-1", url: "http://localhost" }]);
    const pluginExecute = vi
      .fn()
      .mockResolvedValue({ success: false, filepath: "actual/task-1.png" });

    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screenshots",
      diff: { threshold: 0.2 },
      retries: 1,
      concurrency: 1,
      plugins: [
        { name: "plugin", discover: pluginDiscover, execute: pluginExecute },
      ],
    });

    process.argv = ["node", "cappa", "capture"];

    await run();

    expect(process.exitCode).toBe(1);
  });

  test("capture command exits with code 1 when a screenshot task throws", async () => {
    const pluginDiscover = vi
      .fn()
      .mockResolvedValue([{ id: "task-1", url: "http://localhost" }]);
    const pluginExecute = vi
      .fn()
      .mockResolvedValue({ error: "Failed to capture" });

    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screenshots",
      diff: { threshold: 0.2 },
      retries: 1,
      concurrency: 1,
      plugins: [
        { name: "plugin", discover: pluginDiscover, execute: pluginExecute },
      ],
    });

    process.argv = ["node", "cappa", "capture"];

    await run();

    expect(process.exitCode).toBe(1);
  });

  test("review command groups screenshots and starts review server", async () => {
    const grouped = [
      {
        id: "1",
        name: "button",
        category: "new",
        actualPath: "actual/button.png",
      },
    ];

    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve(["/tmp/screens/actual/button.png"]);
      }
      if (pattern.includes("/expected/")) {
        return Promise.resolve(["/tmp/screens/expected/button.png"]);
      }
      if (pattern.includes("/diff/")) {
        return Promise.resolve(["/tmp/screens/diff/button.png"]);
      }
      return Promise.resolve([]);
    });

    groupScreenshotsMock.mockResolvedValue(grouped);

    process.argv = ["node", "cappa", "review"];
    await run();

    expect(groupScreenshotsMock).toHaveBeenCalledWith(
      ["/tmp/screens/actual/button.png"],
      ["/tmp/screens/expected/button.png"],
      ["/tmp/screens/diff/button.png"],
      "/tmp/screens",
    );

    expect(createServerMock).toHaveBeenCalledWith({
      isProd: true,
      outputDir: path.resolve("/tmp/screens"),
      screenshots: grouped,
      logger: true,
    });

    expect(serverInstances).toHaveLength(1);
    expect(serverInstances[0]?.listen).toHaveBeenCalledWith({ port: 3000 });
    expect(loggerInstance.success).toHaveBeenCalledWith(
      "Review UI available at http://localhost:3000",
    );
  });

  test("approve command copies filtered screenshots and cleans diffs", async () => {
    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    const actualScreenshots = [
      "/tmp/screens/actual/foo.png",
      "/tmp/screens/actual/bar.png",
    ];

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve(actualScreenshots);
      }

      if (pattern.includes("/expected/")) {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });

    process.argv = ["node", "cappa", "approve", "--filter", "foo"];

    await run();

    expect(screenshotFileSystemInstances).toHaveLength(1);
    expect(
      screenshotFileSystemInstances[0]?.approveFromActualPath,
    ).toHaveBeenCalledTimes(1);
    expect(
      screenshotFileSystemInstances[0]?.approveFromActualPath,
    ).toHaveBeenCalledWith("/tmp/screens/actual/foo.png");
    expect(loggerInstance.success).toHaveBeenCalledWith(
      "1 screenshot(s) approved (filtered)",
    );
  });

  test("approve command skips copying when screenshots already match", async () => {
    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    const actualScreenshots = ["/tmp/screens/actual/foo.png"];
    const expectedPath = "/tmp/screens/expected/foo.png";
    const diffPath = "/tmp/screens/diff/foo.png";

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve(actualScreenshots);
      }

      if (pattern.includes("/expected/")) {
        return Promise.resolve([expectedPath]);
      }

      return Promise.resolve([]);
    });

    fsMock.existsSync.mockImplementation((filepath: string) => {
      if (
        filepath === expectedPath ||
        filepath === diffPath ||
        filepath === "/tmp/screens/actual/foo.png"
      ) {
        return true;
      }

      return false;
    });

    imagesMatchMock.mockResolvedValue(true);

    process.argv = ["node", "cappa", "approve", "--filter", "foo"];

    await run();

    expect(screenshotFileSystemInstances).toHaveLength(1);
    expect(imagesMatchMock).toHaveBeenCalledWith(
      "/tmp/screens/actual/foo.png",
      expectedPath,
      {},
    );
    expect(
      screenshotFileSystemInstances[0]?.approveFromActualPath,
    ).not.toHaveBeenCalled();
    expect(fsMock.unlinkSync).toHaveBeenCalledWith(diffPath);
    expect(loggerInstance.success).toHaveBeenCalledWith(
      "All screenshots approved",
    );
  });

  test("approve command replaces expected screenshots when they change", async () => {
    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    const actualPath = "/tmp/screens/actual/foo.png";
    const otherActualPath = "/tmp/screens/actual/bar.png";
    const expectedPath = "/tmp/screens/expected/foo.png";

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve([actualPath, otherActualPath]);
      }

      if (pattern.includes("/expected/")) {
        return Promise.resolve([expectedPath]);
      }

      return Promise.resolve([]);
    });

    fsMock.existsSync.mockImplementation((filepath: string) => {
      if (
        filepath === expectedPath ||
        filepath === actualPath ||
        filepath === otherActualPath
      ) {
        return true;
      }

      return false;
    });

    imagesMatchMock.mockResolvedValue(false);

    process.argv = ["node", "cappa", "approve", "--filter", "foo"];

    await run();

    expect(imagesMatchMock).toHaveBeenCalledTimes(1);
    expect(imagesMatchMock).toHaveBeenCalledWith(actualPath, expectedPath, {});
    expect(
      screenshotFileSystemInstances[0]?.approveFromActualPath,
    ).toHaveBeenCalledTimes(1);
    expect(
      screenshotFileSystemInstances[0]?.approveFromActualPath,
    ).toHaveBeenCalledWith(actualPath);
    expect(loggerInstance.success).toHaveBeenCalledWith(
      "1 screenshot(s) approved (filtered)",
    );
  });

  test("approve command warns when no screenshots match filter", async () => {
    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve(["/tmp/screens/actual/foo.png"]);
      }

      if (pattern.includes("/expected/")) {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });

    process.argv = ["node", "cappa", "approve", "--filter", "bar"];

    await run();

    expect(loggerInstance.warn).toHaveBeenCalledWith(
      "No screenshots matched the provided filter(s)",
    );
    expect(screenshotFileSystemInstances).toHaveLength(0);
    expect(loggerInstance.success).not.toHaveBeenCalledWith(
      expect.stringContaining("approved"),
    );
  });

  test("approve command removes expected screenshots without matching actual", async () => {
    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    const lonelyExpectedPath = "/tmp/screens/expected/foo.png";
    const lonelyDiffPath = "/tmp/screens/diff/foo.png";

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve([]);
      }

      if (pattern.includes("/expected/")) {
        return Promise.resolve([lonelyExpectedPath]);
      }

      return Promise.resolve([]);
    });

    fsMock.existsSync.mockImplementation((filepath: string) => {
      if (filepath === lonelyDiffPath) {
        return true;
      }

      return false;
    });

    process.argv = ["node", "cappa", "approve"];

    await run();

    expect(fsMock.unlinkSync).toHaveBeenCalledWith(lonelyExpectedPath);
    expect(fsMock.unlinkSync).toHaveBeenCalledWith(lonelyDiffPath);
    expect(loggerInstance.success).toHaveBeenCalledWith(
      "All screenshots approved",
    );
  });

  test("status command summarizes grouped screenshots", async () => {
    loadConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    globMock.mockImplementation((pattern: string) => {
      if (pattern.includes("/actual/")) {
        return Promise.resolve(["/tmp/screens/actual/new.png"]);
      }
      if (pattern.includes("/expected/")) {
        return Promise.resolve([
          "/tmp/screens/expected/changed.png",
          "/tmp/screens/expected/passed.png",
        ]);
      }
      if (pattern.includes("/diff/")) {
        return Promise.resolve(["/tmp/screens/diff/changed.png"]);
      }
      return Promise.resolve([]);
    });

    groupScreenshotsMock.mockResolvedValue([
      { category: "new" },
      { category: "deleted" },
      { category: "changed" },
      { category: "passed" },
    ]);

    process.argv = ["node", "cappa", "status"];
    await run();

    expect(groupScreenshotsMock).toHaveBeenCalled();
    expect(loggerInstance.box).toHaveBeenCalledWith({
      title: "Screenshot Status",
      message:
        "New screenshots: 1\nDeleted screenshots: 1\nChanged screenshots: 1\nPassed screenshots: 1",
    });
  });

  test("init command creates config and updates package scripts", async () => {
    const configPath = path.resolve(process.cwd(), "cappa.config.ts");
    const packageJsonPath = path.resolve(process.cwd(), "package.json");

    fsMock.existsSync.mockImplementation((target: string) => {
      if (target === configPath) {
        return false;
      }
      if (target === packageJsonPath) {
        return true;
      }
      return false;
    });

    fsMock.readFileSync.mockReturnValue(
      JSON.stringify({ name: "test", scripts: {} }),
    );

    process.argv = ["node", "cappa", "init"];
    await run();

    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining("defineConfig"),
    );

    const packageWriteCall = fsMock.writeFileSync.mock.calls.find(
      ([target]) => target === packageJsonPath,
    );
    expect(packageWriteCall).toBeDefined();
    const updatedPackageJson = JSON.parse(
      (packageWriteCall as [string, string])[1],
    );
    expect(updatedPackageJson.scripts.cappa).toBe("cappa capture");
    expect(updatedPackageJson.scripts["cappa:review"]).toBe("cappa review");

    expect(loggerInstance.success).toHaveBeenCalledWith(
      "Created cappa.config.ts",
    );
    expect(loggerInstance.success).toHaveBeenCalledWith(
      "Added 'cappa' scripts to package.json",
    );
    expect(loggerInstance.warn).toHaveBeenCalledWith(
      "cappa relies on playwright to capture screenshots. Please install playwright and browsers before running cappa.",
    );
  });
});
