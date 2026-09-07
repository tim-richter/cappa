---
"@cappa/client": minor
"@cappa/server": minor
"@cappa/cli": patch
---

Make the review UI honest about a run it did not start, and about being locked out

Three things the UI could not say before:

- **A capture already in flight.** The run id lived in component state, so a
  reload mid-capture — or a `cappa capture` in another terminal — left the page
  showing an idle panel whose Start button could only produce a `409`. It now
  reads the active run from the server and reattaches to it, replaying the
  stream, with the capture controls disabled while somebody else holds the
  browser.

- **A rejected access token.** A `401` was retried like any other failure and
  then reported as "Error fetching screenshots" ten seconds later, with a blank
  sidebar and a capture page offering to start a run over "0 tasks available".
  `@cappa/client` now raises `UnauthorizedError` for a `401`, the UI does not
  retry it, and it explains that the server needs the token from its printed URL.
  A version mismatch gets the same treatment.

- **`cappa review --host 0.0.0.0`** printed `http://0.0.0.0:PORT?token=…`, which
  no browser will open — and that URL is the only place a generated token ever
  appears. It now prints `localhost`.

Also fixes `@cappa/client` caching a *failed* protocol handshake: the first
unauthenticated call poisoned every later one for the lifetime of the client,
including calls made after a token became available. A genuine version mismatch
is still cached, since that one cannot resolve itself.
