---
"@cappa/server": patch
---

Hide the approval controls when the server is read-only. The capture surface was
already hidden, but the detail page's approve button, its `A` shortcut and the
batch approve bar on every list page were still offered — and a read-only server
answers `403`, so all three could only fail. They are now withheld along with
the rest of the mutating UI.
