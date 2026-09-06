# Web Client Migration

Route every `apps/web` request through `@cappa/client`, so the whole UI speaks
one typed, authenticated path instead of two.

## Problem

Phase 5 of `interactive-capture-ui` put the capture surface on `@cappa/client`
and left the pre-existing review pages on raw `fetch`. That was a deliberate
scope call, listed as a follow-up. It has a consequence that was not noticed at
the time:

**`cappa review --host <non-loopback>` ships a half-broken UI.** The server
generates an access token and gates every `/api/*` route on it
(`apps/server/src/server.ts:67`). Only `apps/web/src/api/client.ts` knows about
that token. The twelve remaining raw-`fetch` call sites do not send it:

| File | Request |
| --- | --- |
| `src/main.tsx:8` | `GET /api/config` (theme) |
| `src/layout/Sidebar.tsx:19` | `GET /api/screenshots` |
| `src/layout/Header.tsx:34` | `GET /api/screenshots?category=` |
| `src/pages/Home.tsx:30,35` | list + search |
| `src/pages/{Changed,New,Passed,Deleted}.tsx` | per-category list |
| `src/pages/Screenshot.tsx:12` | `GET /api/screenshots/:id` |
| `src/components/ScreenshotViewer/ScreenshotViewer.tsx:65` | `PATCH /api/screenshots/:id` |
| `src/hooks/useApproveBatch.ts:8` | `POST /api/screenshots/approve-batch` |

Every one of them gets `401`. The result is a UI where the capture panel works
and the entire review surface — lists, sidebar counts, detail page, approval —
is empty, plus a theme that silently falls back to light because `main.tsx`
swallows the failure. Loopback is unaffected, which is why the Phase 6 smoke
test (which exercised auth with `curl`, not the browser) did not catch it.

A second, smaller bug lives in the same place: `client.ts` reads the token from
`window.location.search` **once, at module load**. The token is only ever in the
URL on first open; after any client-side navigation it is gone from the address
bar, so a refresh on `/changed` loses it and 401s everything — including the
capture surface that works today.

Beyond the bug, the split path costs the usual things: response shapes are typed
by hand in `src/types.ts` rather than derived from `@cappa/protocol`, so server
changes are caught at runtime rather than by `pnpm tsc`, and `readOnly`,
protocol-version checking and typed errors apply to half the app.

## Goals

- Every `apps/web` API request goes through `@cappa/client`.
- Token auth works for the whole UI, and survives navigation and reload.
- Screenshot response types come from `@cappa/protocol`, not hand-written
  duplicates.
- No visible change on loopback without a token — the common path stays
  byte-identical.

## Non-goals

- Changing the server's route surface beyond what the migration needs.
- Reworking the review UI's layout, routing or components.
- Anything to do with remote engines (see `remote-capture-cli`).

## Approach

### 1. Fill the two gaps in `@cappa/client`

`RemoteEngine` covers `listScreenshots` and `approve`, but the review pages need
two things it does not expose:

- **`getScreenshot(id)`** — `GET /api/screenshots/:id`, already in the route
  table (`routes.screenshot`) and already returning the `next`/`prev` fields the
  protocol carries. Add it to the client and to `ScreenshotQuery`-adjacent
  types. It is not part of `CaptureEngine` (a capture engine has no business
  addressing a single screenshot by view id), so it lands as an extra method on
  `RemoteEngine` — the same shape the compatibility assertion in
  `client.test.ts` already tolerates for `listScreenshots`.
- **`getConfig()`** — `GET /api/config`, needed by `main.tsx` for the theme and
  already schema'd as `configResponseSchema`.

Both are additive; `PROTOCOL_VERSION` does not move.

### 2. Drop `PATCH /api/screenshots/:id`

`ScreenshotViewer` uses it to approve one screenshot. The handler
(`apps/server/src/screenshots.ts:94`) validates `{ approved: true }` and then
calls `engine.approve([name])` — with `{ approved: false }` an explicit no-op,
since Phase 3 made `approved` a derived value (`category === "passed"`) and
un-approving is not a concept. It is `approve` with extra steps.

The viewer switches to `client.approve([name])`, the route is deleted, and
`routes.screenshot` keeps only its `GET`. This removes a route rather than
adding a client method for it, which is the right direction: the protocol should
not carry two spellings of the same mutation.

### 3. Persist the token

Lift the token out of the URL on first load, write it to `sessionStorage`, and
read from there afterwards. `sessionStorage` and not `localStorage`: the token
grants capture control over the user's machine and should not outlive the tab.
Strip `?token=` from the address bar with `history.replaceState` once captured,
so it stops leaking into bookmarks, screenshots and the referer header.

### 4. Migrate the call sites

Mechanical, one hook at a time, keeping the existing react-query keys so cache
invalidation across the capture surface keeps working. `src/types.ts`'s
hand-written `Screenshot` shapes are replaced by the `@cappa/protocol` types the
client already returns.

### Considered and rejected

- **A fetch wrapper that injects the token.** Three lines, fixes the 401s, and
  leaves the two type systems and two error models in place. The bug is the
  occasion for this change, not the whole of it.
- **Keeping `PATCH` and adding `client.setApproved()`.** Preserves a route whose
  only non-`approve` behaviour is a documented no-op.

## Risks

- **Silent behaviour drift in the review pages.** Mitigation: the msw handlers
  and the existing 137 web tests stay; migrate one page per commit and keep the
  query keys unchanged.
- **The protocol strips fields the pages rely on.** This exact failure already
  happened once in Phase 4 (`next`/`prev` dropped by zod). Mitigation: an
  integration test per page asserting the fields it renders survive the round
  trip, not just that the request was made.
- **Removing `PATCH` is a server API break.** It is unversioned, undocumented
  and consumed only by this UI, which ships in the same package group as the
  server (`@cappa/server` and `web` are `linked` in changesets). Low, but it
  belongs in the changeset as a minor-with-note.
