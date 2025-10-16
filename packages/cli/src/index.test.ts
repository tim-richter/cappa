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
}> = [];

const screenshotFileSystemInstances: Array<{
  outputDir: string;
  clearActual: ReturnType<typeof vi.fn>;
  clearDiff: ReturnType<typeof vi.fn>;
  approveFromActualPath: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("@cappa/core", () => ({
  ScreenshotTool: class {
    options: unknown;
    close: ReturnType<typeof vi.fn>;

    constructor(options: unknown) {
      this.options = options;
      this.close = vi.fn();
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

const getCosmiConfigMock = vi.fn();
vi.mock("./utils/getCosmiConfig", () => ({
  getCosmiConfig: getCosmiConfigMock,
}));

const getConfigMock = vi.fn();
vi.mock("./utils/getConfig", () => ({
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
  screenshotToolInstances.length = 0;
  screenshotFileSystemInstances.length = 0;
  serverInstances.length = 0;
  globMock.mockReset();
  globMock.mockImplementation(() => Promise.resolve([]));
  getCosmiConfigMock.mockReset();
  getConfigMock.mockReset();
  groupScreenshotsMock.mockReset();

  loggerInstance = createLoggerInstance();
  getLoggerMock.mockReset();
  getLoggerMock.mockImplementation(() => loggerInstance);
  initLoggerMock.mockReset();
  initLoggerMock.mockImplementation(() => loggerInstance);
});

afterEach(() => {
  process.argv = [...originalArgv];
});

describe("cappa CLI", () => {
  test("capture command cleans directories and runs plugins", async () => {
    const pluginExecute = vi.fn().mockResolvedValue(undefined);
    const pluginDiscover = vi.fn().mockResolvedValue([]);

    getCosmiConfigMock.mockResolvedValue({
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

    expect(getCosmiConfigMock).toHaveBeenCalledWith("cappa");
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

  test("review command groups screenshots and starts review server", async () => {
    const grouped = [
      {
        id: "1",
        name: "button",
        category: "new",
        actualPath: "actual/button.png",
      },
    ];

    getCosmiConfigMock.mockResolvedValue({
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
    getCosmiConfigMock.mockResolvedValue({
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

    globMock.mockResolvedValue(actualScreenshots);

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

  test("approve command warns when no screenshots match filter", async () => {
    getCosmiConfigMock.mockResolvedValue({
      filepath: "cappa.config.ts",
      config: {},
    });

    getConfigMock.mockResolvedValue({
      outputDir: "/tmp/screens",
      plugins: [],
      diff: {},
    });

    globMock.mockResolvedValue(["/tmp/screens/actual/foo.png"]);

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

  test("status command summarizes grouped screenshots", async () => {
    getCosmiConfigMock.mockResolvedValue({
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
