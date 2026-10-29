import { describe, expect, it } from "vitest";
import { judgeCommandRefusal, splitCommand } from "./judgeGuard";

const runner = "pnpm -C packages/web exec cappa";
const allowed = (command: string) =>
  expect(judgeCommandRefusal(command, runner)).toBeUndefined();
const refused = (command: string, reason = "the judge may run") =>
  expect(judgeCommandRefusal(command, runner)).toContain(reason);

describe("splitCommand", () => {
  it("keeps quoted text as one word", () => {
    expect(
      splitCommand(`a --headline "Price | Total; misaligned" 'it''s'`),
    ).toEqual({
      words: ["a", "--headline", "Price | Total; misaligned", "its"],
    });
  });

  it("keeps escaped quotes and empty strings", () => {
    expect(splitCommand(`a "say \\"hi\\"" ""`)).toEqual({
      words: ["a", 'say "hi"', ""],
    });
  });

  it("joins line continuations", () => {
    expect(splitCommand("a \\\n  b")).toEqual({ words: ["a", "b"] });
  });
});

describe("judgeCommandRefusal", () => {
  it("allows the judge's cappa commands with the project's runner", () => {
    allowed(`${runner} agent check --json`);
    allowed(`${runner} agent check --judge all --json`);
    allowed(
      `${runner} agent judge a b --label noise-likely --headline "Clock | ticks" --rationale "x; y" --json`,
    );
  });

  it("allows read-only git", () => {
    allowed("git diff");
    allowed("git --no-pager log -p -- src/Button.tsx");
    allowed("git show HEAD~1:src/a.ts");
    allowed("git status --short");
  });

  it("refuses other cappa commands and other runners", () => {
    refused(`${runner} agent approve a --json`);
    refused(`${runner} capture --json`);
    refused("npx cappa agent check --json");
    refused(`${runner} agent`);
  });

  it("refuses git that writes or runs something", () => {
    refused("git commit -m x");
    refused("git -c core.pager=sh log");
    refused("git diff --output=/tmp/x", "--output");
    refused("git log --output /tmp/x", "--output");
  });

  it("refuses anything else", () => {
    refused("rm -rf .");
    refused("magick a.png b.png");
  });

  it("refuses chaining, pipes, redirects and substitution", () => {
    const chain = "one command at a time";
    refused("git diff; rm -rf .", chain);
    refused("git diff && rm -rf .", chain);
    refused("git log | head", chain);
    refused("git diff > out.txt", chain);
    refused(`${runner} agent check --json $(rm -rf .)`, chain);
    refused("git diff `rm -rf .`", chain);
    refused("git diff\nrm -rf .", chain);
    refused(`git log "$(rm -rf .)"`, "substitution");
    refused('git log "a', "unterminated quote");
  });
});
