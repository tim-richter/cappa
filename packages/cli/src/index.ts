import { initLogger } from "@cappa/logger";
import { Command } from "commander";
import { version } from "../package.json";
import { approve } from "./commands/approve";
import { registerCaptureCommand } from "./commands/capture";
import { init } from "./commands/init";
import { review } from "./commands/review";
import { status } from "./commands/status";
import { DEFAULT_MAX_REGIONS } from "./utils/describeChanges";
import { parseMaxRegions } from "./utils/parseMaxRegions";

const program = new Command();

program
  .name("cappa")
  .description("Cappa CLI")
  .version(version)
  .option(
    "-l, --log-level <level>",
    "set log level (0: fatal and error, 1: warn, 2: log, 3: info, 4: debug, 5: trace)",
    "3",
  )
  .hook("preAction", (thisCommand) => {
    const logLevel = parseInt(thisCommand.opts().logLevel, 10);
    const logger = initLogger(logLevel);
    logger?.debug(`Log level set to: ${logLevel}`);
  });

registerCaptureCommand(program);

program
  .command("review")
  .description("Open the review and capture UI")
  .option("-p, --port <port>", "port to listen on", (v) =>
    Number.parseInt(v, 10),
  )
  .option(
    "--host <host>",
    "host to bind to (a non-loopback host requires an access token)",
  )
  .option(
    "--read-only",
    "serve the UI without capture, approval or any other mutation",
  )
  .option("--token <token>", "require this access token on every API request")
  .action(review);

program
  .command("approve")
  .description("Approve screenshots")
  .option(
    "-f, --filter <filter...>",
    "only approve screenshots whose name includes the provided filter value(s)",
  )
  .action(approve);

program
  .command("status")
  .description("Get status of screenshots")
  .option(
    "--max-regions <count>",
    "maximum number of interpreted diff regions listed per changed screenshot (0 to disable)",
    parseMaxRegions,
    DEFAULT_MAX_REGIONS,
  )
  .action(status);

program
  .command("init")
  .description("Initialize Cappa in the current directory")
  .action(init);

export async function run(): Promise<void> {
  await program.parseAsync();
}
