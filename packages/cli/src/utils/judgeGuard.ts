/**
 * The shell commands the `cappa-judge` subagent may run.
 *
 * OpenCode enforces this with the judge's `permission.bash` patterns. Claude
 * Code agent frontmatter cannot narrow Bash to commands, only run a
 * `PreToolUse` hook — which calls `cappa agent guard`, and that calls this.
 */

const GIT_READ_ONLY = ["diff", "log", "show", "status"] as const;
const CAPPA_ALLOWED = ["check", "judge"] as const;

/**
 * Split a command the way a shell would, as far as the guard needs: words,
 * with quotes removed. Returns a reason instead when the command does
 * anything but run one program — chaining, pipes, redirects, substitution —
 * since a prefix check alone would let `git diff; rm -rf .` through.
 *
 * Quoted text is literal, so a headline like "Price | Total misaligned"
 * stays one argument; only `$(` and backticks are refused inside double
 * quotes, because the shell still expands those.
 */
export const splitCommand = (
  command: string,
): { words: string[] } | { reason: string } => {
  const words: string[] = [];
  let word: string | undefined;
  let quote: "'" | '"' | undefined;

  for (let i = 0; i < command.length; i++) {
    const char = command[i] as string;
    const next = command[i + 1];

    if (quote === "'") {
      if (char === "'") quote = undefined;
      else word += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = undefined;
      else if (char === "`" || (char === "$" && next === "(")) {
        return { reason: "command substitution is not allowed" };
      } else if (char === "\\" && next !== undefined) {
        word += next;
        i++;
      } else word += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      word ??= "";
    } else if (char === "\\" && next === "\n") {
      i++; // line continuation
    } else if (char === "\\" && next !== undefined) {
      word = (word ?? "") + next;
      i++;
    } else if (char === " " || char === "\t") {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else if (";&|<>`\n".includes(char) || (char === "$" && next === "(")) {
      return {
        reason:
          "run one command at a time — no chaining, pipes, redirects or substitution",
      };
    } else {
      word = (word ?? "") + char;
    }
  }

  if (quote) return { reason: "unterminated quote" };
  if (word !== undefined) words.push(word);
  return { words };
};

/**
 * Why the judge may not run `command`, or `undefined` when it may.
 *
 * `runner` is how the project runs cappa (`pnpm exec cappa`); the judge's
 * cappa calls must start with exactly those words.
 */
export const judgeCommandRefusal = (
  command: string,
  runner: string,
): string | undefined => {
  const split = splitCommand(command.trim());
  if ("reason" in split) return split.reason;

  const { words } = split;
  const prefix = runner.trim().split(/\s+/);
  const allowed = `only \`${runner} agent ${CAPPA_ALLOWED.join("|")}\` and \`git ${GIT_READ_ONLY.join("|")}\``;

  if (words[0] === "git") {
    // Other global options (`-C <dir>`, `-c key=value`) are not needed by
    // the judge, and `-c` could point git at a program to run.
    const sub = words[1] === "--no-pager" ? words[2] : words[1];
    if ((GIT_READ_ONLY as readonly string[]).includes(sub ?? "")) {
      if (words.some((w) => w === "--output" || w.startsWith("--output="))) {
        return "`--output` writes a file";
      }
      return undefined;
    }
    return `the judge may run ${allowed}`;
  }

  const isCappa = prefix.every((w, i) => words[i] === w);
  const [agent, sub] = words.slice(prefix.length);
  if (
    isCappa &&
    agent === "agent" &&
    (CAPPA_ALLOWED as readonly string[]).includes(sub ?? "")
  ) {
    return undefined;
  }
  return `the judge may run ${allowed}`;
};
