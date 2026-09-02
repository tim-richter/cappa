import { InvalidArgumentError } from "commander";
import { DEFAULT_MAX_REGIONS } from "./describeChanges";

/**
 * Parse the `--max-regions` option: a non-negative integer, where `0` disables
 * the per-region breakdown. Falls back to the default when omitted.
 */
export const parseMaxRegions = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_MAX_REGIONS;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new InvalidArgumentError(
      "Expected a non-negative integer (0 disables the region breakdown).",
    );
  }

  return Number(value.trim());
};
