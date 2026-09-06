---
"@cappa/server": minor
---

Remove `PATCH /api/screenshots/:id`. It validated `{ approved: true }` and then
called the same engine method `POST /api/screenshots/approve-batch` does, with
`{ approved: false }` an explicit no-op — un-approving is not a concept, since a
baseline is replaced rather than withdrawn. It was a second spelling of one
mutation. The review UI now approves a single screenshot through
`approve-batch` with one name, like everything else.

The route was unversioned and undocumented, and its only consumer was the review
UI that ships alongside this package.
