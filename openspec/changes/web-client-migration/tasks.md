# Tasks — Web Client Migration

Each phase independently mergeable and green (`pnpm lint`, `pnpm tsc`,
`pnpm test`). Phase 1 is the bug fix and is worth shipping on its own.

---

## Phase 1 — Token survives the whole session ✅

Fixes the 401s for the capture surface on reload. Small, no API changes.

- [x] `apps/web/src/api/token.ts`: read the token from `sessionStorage`,
      falling back to `?token=` on first load and persisting it there.
- [x] Strip `token` from the address bar with `history.replaceState` once it has
      been captured.
- [x] Tests: token picked up from the URL; persisted across a simulated reload
      with no query string; absent when never supplied; URL cleaned.
- [x] Verify in a real browser against `cappa review --host 0.0.0.0`: open the
      printed URL, navigate to `/capture`, reload, capture still works.

**Deviations**

- **A separate `token.ts`, not logic inside `client.ts`.** `client.ts` builds a
  module-level singleton, so anything inside it can only be tested by resetting
  modules. Token resolution is the part with the edge cases, so it is its own
  pure function and tested directly.
- **Storage access is wrapped in `try`/`catch`.** `sessionStorage` throws
  outright — not returns null — in a private window or with site data blocked.
  The token still works for that page load; it just does not survive a reload.

**Verification.** 9 new tests (146 in `apps/web`, up from 137), lint, `tsc` and
the full repo suite green. Measured before and after against the real `cappa
review --host 0.0.0.0` binary in a real browser, reloading `/capture` on a URL
with no token in it:

| | before | after |
| --- | --- | --- |
| token in address bar after open | yes | stripped |
| `GET /api/health` after reload | `401` | `200` |
| `GET /api/plugins` after reload | never reached | `200` |
| `GET /api/targets` after reload | never reached | `200` |

A full capture run started from the reloaded page ran to completion over SSE.
The loopback path (no token anywhere) is unchanged: every page 2xx, nothing
written to `sessionStorage`, no page errors.

**Still 401 after this phase, as expected:** `GET /api/config` from `main.tsx`
and every `GET /api/screenshots` from the review pages. Those are the raw-`fetch`
call sites, and they are what Phases 3 and 4 migrate.

## Phase 2 — Close the client gaps ✅

- [x] `@cappa/client`: `getScreenshot(id)` against `routes.screenshot`, parsed
      with the protocol screenshot schema (including `next`/`prev`).
- [x] ~~`getConfig()`~~ — already shipped in Phase 4 of `interactive-capture-ui`
      as `config()`. Nothing to add; the plan double-counted it.
- [x] Tests in `client.test.ts` (unit) and `integration.test.ts` (against a live
      Fastify server): 404 mapping for an unknown id, `next`/`prev` round trip,
      `readOnly` surfaced from `config()`.
- [x] Changeset for `@cappa/client` (minor).

**Deviations and findings**

- **Only one gap was real.** `config()` already existed and `apps/web` already
  uses it through `useServerConfig`; the plan listed it from reading the raw
  `fetch` in `main.tsx` without checking the client's surface first. Phase 2 is
  therefore one method, not two.
- **`getScreenshot` is not on `CaptureEngine`, deliberately.** An engine
  discovers and captures; addressing one screenshot by a server-assigned view
  id, and getting `next`/`prev` back with it, is a review concern that only
  exists over HTTP. `LocalEngine` has no equivalent and should not grow one.
  The existing `Omit<CaptureEngine, "listScreenshots">` assertion still holds —
  an extra method does not break assignability.
- **The `404` check was duplicated, so it became a helper.** `getRun` already
  duck-typed `error.status === 404` rather than using `instanceof
  CappaHttpError`, because dual ESM/CJS builds mean a consumer can hold two
  copies of the class — the hazard that turned a `409` into a `500` in Phase 3.
  `isNotFound` now carries that reasoning in one place and both callers use it.

**Verification.** 64 client tests (up from 55): a single fetch by id, `next`/
`prev` surviving the zod parse, id encoding, `404` → `undefined`, a non-404
rethrown, `config()`, plus three against a live Fastify server — asset-URL
rewriting on the single-screenshot route, an unknown id, and a read-only server
still serving reads. Lint, `tsc` and `attw` green.

## Phase 3 — Migrate the read paths ✅

One commit per file; keep every react-query key exactly as it is so the capture
surface's invalidation keeps hitting them.

- [x] `src/main.tsx` — theme via `client.config()`.
- [x] `src/layout/Sidebar.tsx` — counts via `client.listScreenshots()`.
- [x] `src/layout/Header.tsx` — `client.listScreenshots({ category })`. The
      category derivation itself was already fixed separately (`""` on `/` was
      sent as `?category=` and rejected with a `400`, leaving a blank title and
      no count); this step only moves the request onto the client.
- [x] `src/pages/Home.tsx` — list and search.
- [x] `src/pages/{Changed,New,Passed,Deleted}.tsx` — per-category list.
- [x] `src/pages/Screenshot.tsx` — `client.getScreenshot(id)`.
- [x] Replace the hand-written screenshot types in `src/types.ts` with the
      `@cappa/protocol` types; delete what is left of the file if nothing
      remains.
- [x] Per-page test asserting the fields that page renders survive the client's
      zod parse — the Phase 4 `next`/`prev` failure mode, guarded per page.

**Deviations and findings**

- **`src/types.ts` held no duplicate screenshot types.** The plan assumed local
  copies; in fact every page imported `Screenshot` from `@cappa/core` directly,
  and the only screenshot-shaped thing in `types.ts` was a `ScreenshotPaths`
  type with no callers at all. It is deleted; `View` is all that remains.
- **The real type work was swapping the import source, and the compiler could
  not have told us.** Twelve components typed themselves on `@cappa/core`'s
  `Screenshot`, which is *not* assignable from the protocol's — `diffMeta.
  interpretation` is `InterpretResult` in core and `unknown` on the wire. That
  should have been a hard error the moment pages started returning protocol
  types. It was not, because `@blazediff/core-native` does not resolve from
  `apps/web`, so `InterpretResult` silently degrades to `any` there and every
  assignment passes. Verified with an `IsAny` probe. The swap is done anyway:
  relying on an accidental `any` means the day those types do resolve, a dozen
  files break at once.
- **One narrowing, in one place.** `Diff.tsx` is the only component that reads
  the interpretation, so it is the only place that casts the opaque `unknown`
  to `InterpretResult`, with the reason inline. `Interpretation.tsx` keeps its
  `InterpretResult`/`ChangeRegion` imports from core — the deliberate exception
  Phase 4 of `interactive-capture-ui` documented.
- **`ChangedScreenshot` had to be exported from `@cappa/protocol`.** The
  comparison views only ever render a changed screenshot; the schema was
  exported but not its inferred type.
- **The zod-stripping guard is schema-level, not per-page.** A per-page test
  would assert the same parse four times over. Instead
  `src/api/screenshotFields.test.ts` drives the real client against msw and
  asserts every field any surface reads — list identity fields, the preview
  path each category uses, `next`/`prev`, and the diff metadata including the
  opaque interpretation. Confirmed it bites: deleting `next`/`prev` from the
  protocol and rebuilding fails it.
- **`apps/web` resolves workspace packages to their built `dist`.** Four tests
  failed with `client.getScreenshot is not a function` until `@cappa/client`
  was rebuilt — Phase 2 shipped source but nothing rebuilt the package. Worth
  knowing before blaming the code.

**Verification.** 154 web tests (up from 150), 362 across the repo plus 212 in
core; lint, `tsc`, `attw` and a clean `pnpm build` green.

Then the real `cappa review --host 0.0.0.0` binary in a real browser, opened
once on the printed URL and then navigated as a user would, with no token in
any later URL — the scenario that was entirely broken before this change:

| page | before | after |
| --- | --- | --- |
| `/` | `401`, blank list | no 4xx, list and count render |
| `/changed`, `/new`, `/passed`, `/deleted` | `401`, blank | no 4xx, headings and rows render |
| `/screenshots/:id` | `401` | no 4xx, renders, `next`/`prev` present |
| sidebar total | blank | `Total Screenshots 2` |
| `/capture` | worked | still works |

Zero page errors. `review.theme: "dark"` puts `dark` on `<html>`, confirming the
theme now flows through `client.config()` rather than the raw fetch that used to
`401` and silently fall back to light.

## Phase 4 — Migrate the write paths and drop `PATCH` ✅

- [x] `src/hooks/useApproveBatch.ts` — `client.approve(names)`.
- [x] `src/components/ScreenshotViewer/ScreenshotViewer.tsx` —
      `client.approve([screenshot.name])`; invalidate the same query keys.
- [x] Delete `PATCH /api/screenshots/:id` from `apps/server/src/screenshots.ts`,
      its `patchBodySchema`, and its tests.
- [x] Remove the `PATCH` spelling from `@cappa/protocol`'s route docs; keep
      `routes.screenshot` for `GET`.
- [x] Update the msw handlers in `src/mocks/` to match.
- [x] Changeset noting the removed route (`@cappa/server` minor).

**Deviations and findings**

- **Nothing to remove from `@cappa/protocol`.** The route table only ever named
  paths, not methods, so `routes.screenshot` needed no change and the protocol
  never mentioned `PATCH`. The stale list was in the `screenshotsPlugin` doc
  comment in the server, which is where the correction landed.
- **Nothing to remove from the msw handlers either — and that was the
  problem.** No handler ever mocked `PATCH`, so the single-approve button had
  **no test coverage at all**: with `onUnhandledRequest: "warn"` the request
  fell through to the real network and the test passed regardless. Now that it
  is `approve-batch`, the existing handler covers it, and
  `ScreenshotViewer.test.tsx` asserts both the button and the `A` shortcut post
  the screenshot's *name*.
- **The approve button had no accessible name.** It is an icon button whose
  only label was a tooltip, so it could not be selected by role — the reason
  the first attempt at the test above failed. Given an `aria-label`, matching
  the convention the view-mode buttons in `Header` already follow.
- **Single approve keeps invalidating only `["screenshot", id]`.** It could
  reasonably invalidate the list prefix too, since approving changes a
  screenshot's category — but the app's `QueryClient` uses the default
  `staleTime: 0` with `refetchOnMount`, so a list is refetched on navigation
  anyway and the difference is unobservable. Left as it was rather than
  changing behaviour in a transport migration.
- **The deleted `PATCH` tests cost no coverage.** Everything they asserted —
  read-only refusal, malformed body, unknown target, approval failure — the
  `approve-batch` suite already covers, and it reports a failed name in a `200`
  body rather than a blanket `500`. One test remains in their place, asserting
  the route is *gone*, so reintroducing it has to be deliberate.

**Verification.** No raw `fetch` is left anywhere in `apps/web/src` outside the
mocks. 156 web tests (up from 154), 49 server (down from 54: six `PATCH` tests
out, one removal guard in), 358 across the repo plus 212 in core; lint, `tsc`,
`attw` and a clean `pnpm build` green.

Both writes driven against the real `cappa review --host 0.0.0.0` binary in a
real browser, opened once on the printed URL and then navigated bare:

| flow | result |
| --- | --- |
| detail-page approve | `POST /api/screenshots/approve-batch` `200`, zero `PATCH` requests, `about` flipped `changed` → `passed` |
| list-page batch approve | "Select all" → "Approve selected (1)" → `200`, `home` flipped `new` → `passed` |
| lists after approving | refetch, no 4xx, both screenshots listed |

No page errors in either flow.

## Phase 5 — Verification and docs

- [ ] Full repo suite, `pnpm lint`, `pnpm tsc`, `pnpm attw` green.
- [ ] Grep for `fetch(` under `apps/web/src` — only `@cappa/client` and the msw
      service worker should remain.
- [ ] Real-browser pass against `cappa review` on loopback: every page, sidebar
      counts, search, detail navigation, single approve, batch approve.
- [ ] Repeat the same pass against `cappa review --host 0.0.0.0` with a
      generated token — this is the scenario that is broken today.
- [ ] `cappa review --read-only`: review works, approval controls hidden, no
      `403`s in the console.
- [ ] `apps/docs`: note in the Interactive UI page that exposing the UI off
      loopback works for the whole UI, not just capture.

---

## Follow-ups (not in this change)

- A `useCappaQuery` wrapper so query keys and the client stay in one place.
- Server-side search/filter instead of listing everything and narrowing in the
  browser — matters only once a project has thousands of screenshots.
