import fs from "node:fs";
import path from "node:path";
import { getLogger } from "@cappa/logger";
import { defaultConfig } from "../features/config/default";

export const init = async () => {
  const logger = getLogger();

  const configPath = path.resolve(process.cwd(), "cappa.config.ts");
  const packageJsonPath = path.resolve(process.cwd(), "package.json");

  // Create cappa.config.ts
  if (fs.existsSync(configPath)) {
    logger.warn("cappa.config.ts already exists, skipping...");
  } else {
    fs.writeFileSync(configPath, defaultConfig);
    logger.success("Created cappa.config.ts");
  }

  // Add scripts to package.json
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      if (packageJson.scripts.cappa) {
        logger.warn(
          "'cappa' script already exists in package.json, skipping...",
        );
      } else {
        packageJson.scripts.cappa = "cappa capture";
      }

      if (packageJson.scripts["cappa:review"]) {
        logger.warn(
          "'cappa:review' script already exists in package.json, skipping...",
        );
      } else {
        packageJson.scripts["cappa:review"] = "cappa review";
      }

      fs.writeFileSync(
        packageJsonPath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
      );
      logger.success("Added 'cappa' scripts to package.json");
    } catch (error) {
      logger.error("Failed to update package.json:", error);
    }
  } else {
    logger.warn("package.json not found, skipping script addition");
  }

  logger.success("Cappa initialization complete!");
  logger.warn(
    "cappa relies on playwright to capture screenshots. Please install playwright and browsers before running cappa.",
  );
};
