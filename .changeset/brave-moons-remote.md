---
"@cappa/cli": minor
---

Add `cappa capture --server <url>`, capturing against a `cappa serve` host.

The browser runs on one machine and the CI job on another. Everything downstream
is unchanged: the same live output, the same failure report, the same exit code.
Pair it with `--token <token>`, which also reads `CAPPA_TOKEN`.

A pre-flight `GET /api/health` turns four failures into four distinct messages
before any capture starts — an unreachable host, a rejected token, a protocol
mismatch, and a `--read-only` host that cannot capture — rather than letting
them arrive mid-run. A host that is already busy reports that it is, instead of
raising a stack trace.

Two documented differences from a local capture:

- **`onFail` receives relative paths only.** The screenshot files are on the
  host, so the `absolute*Path` fields would be fiction. They are left undefined
  and the reason is logged once. The callback still runs.
- **Diff regions are best effort.** The protocol carries
  `diffMeta.interpretation` opaquely so a diff-engine upgrade is not a breaking
  wire change, so the changed-screenshot report now narrows it and omits the
  region breakdown when it does not match. Diff statistics are typed in the
  protocol and always render. Local capture is unaffected — it narrows a value
  that already matched.

Ctrl-C cancels the run on the host and waits, briefly, for it to confirm before
exiting 130; a second Ctrl-C leaves at once and says the remote run may still be
going.
