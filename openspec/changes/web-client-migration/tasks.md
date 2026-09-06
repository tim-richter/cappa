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

## Phase 3 — Migrate the read paths

One commit per file; keep every react-query key exactly as it is so the capture
surface's invalidation keeps hitting them.

- [ ] `src/main.tsx` — theme via `client.getConfig()`.
- [ ] `src/layout/Sidebar.tsx` — counts via `client.listScreenshots()`.
- [ ] `src/layout/Header.tsx` — `client.listScreenshots({ category })`. The
      category derivation itself was already fixed separately (`""` on `/` was
      sent as `?category=` and rejected with a `400`, leaving a blank title and
      no count); this step only moves the request onto the client.
- [ ] `src/pages/Home.tsx` — list and search.
- [ ] `src/pages/{Changed,New,Passed,Deleted}.tsx` — per-category list.
- [ ] `src/pages/Screenshot.tsx` — `client.getScreenshot(id)`.
- [ ] Replace the hand-written screenshot types in `src/types.ts` with the
      `@cappa/protocol` types; delete what is left of the file if nothing
      remains.
- [ ] Per-page test asserting the fields that page renders survive the client's
      zod parse — the Phase 4 `next`/`prev` failure mode, guarded per page.

## Phase 4 — Migrate the write paths and drop `PATCH`

- [ ] `src/hooks/useApproveBatch.ts` — `client.approve(names)`.
- [ ] `src/components/ScreenshotViewer/ScreenshotViewer.tsx` —
      `client.approve([screenshot.name])`; invalidate the same query keys.
- [ ] Delete `PATCH /api/screenshots/:id` from `apps/server/src/screenshots.ts`,
      its `patchBodySchema`, and its tests.
- [ ] Remove the `PATCH` spelling from `@cappa/protocol`'s route docs; keep
      `routes.screenshot` for `GET`.
- [ ] Update the msw handlers in `src/mocks/` to match.
- [ ] Changeset noting the removed route (`@cappa/server` minor).

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
