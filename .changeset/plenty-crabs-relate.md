---
"@cappa/client": patch
---

Skip run events of an unknown type instead of failing on them.

A newer server can now add event types without breaking an older client: an
unrecognised type is skipped, its sequence number is still consumed — so a
reconnect resumes from where the server actually is rather than replaying from
before it — and the condition is reported once per stream instead of once per
event. A known event type with a malformed body still surfaces through
`onError`, because that is a different problem.
