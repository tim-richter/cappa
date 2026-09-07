---
"@cappa/server": patch
---

Fix the review UI's header showing a blank title and no count on the home page.
The header derived its category from the first path segment and asserted it was
one — but that segment is `""` on `/`, and the server rejects `?category=` with
a `400`, so the count query failed and the title looked up an entry that does
not exist. The home page now reads "All Screenshots" with the total count, and
a path segment that is not a category no longer reaches the API.
