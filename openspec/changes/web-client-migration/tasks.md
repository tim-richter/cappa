# Tasks — Web Client Migration

Each phase independently mergeable and green (`pnpm lint`, `pnpm tsc`,
`pnpm test`). Phase 1 is the bug fix and is worth shipping on its own.

---

## Phase 1 — Token survives the whole session

Fixes the 401s for the capture surface on reload. Small, no API changes.

- [ ] `apps/web/src/api/client.ts`: read the token from `sessionStorage`,
      falling back to `?token=` on first load and persisting it there.
- [ ] Strip `token` from the address bar with `history.replaceState` once it has
      been captured.
- [ ] Tests: token picked up from the URL; persisted across a simulated reload
      with no query string; absent when never supplied; URL cleaned.
- [ ] Verify in a real browser against `cappa review --host 0.0.0.0`: open the
      printed URL, navigate to `/capture`, reload, capture still works.

## Phase 2 — Close the client gaps

- [ ] `@cappa/client`: `getScreenshot(id)` against `routes.screenshot`, parsed
      with the protocol screenshot schema (including `next`/`prev`).
- [ ] `@cappa/client`: `getConfig()` against `routes.config`, parsed with
      `configResponseSchema`.
- [ ] Tests in `client.test.ts` (unit) and `integration.test.ts` (against a live
      Fastify server): 404 mapping for an unknown id, `next`/`prev` round trip,
      `readOnly` surfaced from `getConfig`.
- [ ] Changeset for `@cappa/client` (minor).

## Phase 3 — Migrate the read paths

One commit per file; keep every react-query key exactly as it is so the capture
surface's invalidation keeps hitting them.

- [ ] `src/main.tsx` — theme via `client.getConfig()`.
- [ ] `src/layout/Sidebar.tsx` — counts via `client.listScreenshots()`.
- [ ] `src/layout/Header.tsx` — `client.listScreenshots({ category })`.
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
