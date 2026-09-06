---
"@cappa/server": patch
---

Fix the review UI losing its access token after the first page load. When the
server is bound off loopback it requires a token and prints it once, as part of
the URL it tells you to open. The UI read that token out of the query string on
every module load, but the token is only ever in the address bar on that first
load — so any client-side navigation or reload left the UI unauthenticated and
every capture request came back `401`.

The token is now captured once, kept in `sessionStorage` for the tab, and read
back on later loads. It is also removed from the address bar as soon as it has
been captured, so it stops leaking into bookmarks, screenshots and the referer
header. `sessionStorage` rather than `localStorage`: the token grants capture
control over the machine running the server, so it should not outlive the tab —
a new tab still needs the URL the server printed.

Loopback servers, which use no token, are unaffected.
