import { initLogger } from "@cappa/logger";
import { Command } from "commander";
import { version } from "../package.json";
import { approve } from "./commands/approve";
import { capture } from "./commands/capture";
import { init } from "./commands/init";
import { review } from "./commands/review";
import { status } from "./commands/status";

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

program
  .command("capture")
  .description("Capture screenshots")
  .action(async () => {
    await capture(false);
  });

program
  .command("ci")
  .description(
    "Capture screenshots and run onFail callback for failed screenshots",
  )
  .action(async () => {
    await capture(true);
  });

program.command("review").description("Review screenshots").action(review);

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
  .action(status);

program
  .command("init")
  .description("Initialize Cappa in the current directory")
  .action(init);

export async function run(): Promise<void> {
  await program.parseAsync();
}
