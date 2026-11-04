---
"@cappa/core": patch
---

A screenshot whose images were written in the same millisecond `cappa agent check` started no longer loses its verdict in the review UI. The report's timestamp has whole-millisecond precision and file times have sub-millisecond precision, so such images used to count as newer than the check.
