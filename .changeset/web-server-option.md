---
"@cappa/core": minor
"@cappa/cli": minor
"@cappa/config": minor
---

Add a `webServer` config option that starts the app under test before capturing and stops it when done.

```ts
export default defineConfig({
  webServer: {
    command: "pnpm storybook --ci",
    url: "http://localhost:6006",
  },
});
```

- Fields: `command`, `url`, `reuseExistingServer` (default `!process.env.CI`), `timeout` (default 60s, measured from spawn), `cwd` (default and base for relative paths: the directory of `cappa.config.ts`), `env`. An array starts several servers in parallel.
- The engine owns the lifecycle, so `capture`, `capture --watch`, `review`, `serve` and single-screenshot re-capture from the review UI all get it: started on the first run, stopped on close and with the idle browser, started again on the next run. A reused server is never stopped.
- The whole process tree is stopped (SIGTERM, then SIGKILL after 5s; `taskkill /T /F` on Windows). Output is buffered and shown when the server fails to start; `--log-level 4` streams it.
- A refused connection from any plugin now reads `Cannot reach <url>: connection refused.` plus what to do about it, and identical errors collapse into one entry in `capture --json` (with a `count`) and in the failure report.
- `cappa agent init` points out a missing `webServer`, and the bundled skill relies on it instead of starting Storybook by hand.
