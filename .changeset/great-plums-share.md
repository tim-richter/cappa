---
"@cappa/server": patch
---

Fix the review UI returning `401` for every screenshot request when the server
is bound off loopback. The review pages — the lists, the sidebar total, the
header count, the detail page and the theme — used raw `fetch` and never sent
the access token, so `cappa review --host <non-loopback>` served a UI whose
capture surface worked and whose entire review surface was empty. They now go
through `@cappa/client`, which sends the token on every request.
