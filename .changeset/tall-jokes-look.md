---
"@cappa/protocol": minor
---

Export the `ChangedScreenshot` type. The schema was already exported; the
inferred type was not, so a consumer rendering a diff comparison had to narrow
the full union itself.
