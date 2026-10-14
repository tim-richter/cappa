# cappa — masking unstable UI

Masking hides elements matching CSS selectors before the screenshot is taken, so content that is
non-deterministic by nature (clocks, relative times, random avatars, carousels, video, third-party
iframes, ads) stops failing the diff. Re-approving such a change only postpones the next failure.

## Where masks go
- **Storybook** (`@cappa/plugin-storybook`) — per story, in the story file:
  ```ts
  export const Primary = {
    parameters: { cappa: { mask: ['[data-testid="timestamp"]'] } },
  };
  ```
  For every story of a component, set it on the default export's `parameters` instead.
- **Pages** (`@cappa/plugin-pages`) — per page or for all pages via `defaults`:
  ```ts
  cappaPluginPages({
    pages: [{ url: '/', name: 'home', mask: ['.cookie-banner'] }],
    defaults: { mask: ['.live-clock'] },
  });
  ```

## Picking selectors
- Prefer stable hooks: `data-testid`, ids, ARIA roles/labels, component class names. Avoid
  `nth-child` and generated class names (`css-1x2y3z`).
- Mask the smallest element that contains the unstable content, not its whole section — a
  mask also hides any regression inside it.
- Better than masking, when you can edit the source: make the content deterministic in the story
  (fixed date, seeded data, `args`) or for the capture.

## Shared noise across many screenshots
When many pending judgments share a headline (see `JUDGING.md`), the cause is usually one shared
element. Fix or mask it once — a shared decorator/preview parameter in Storybook
(`.storybook/preview` `parameters.cappa.mask`) or `defaults.mask` for pages — then re-capture and
re-check instead of judging each screenshot. Storybook replaces arrays rather than merging them,
so a story that sets its own `mask` must repeat the shared selectors.

After changing masks, re-capture the affected tasks (`cappa capture --json --filter ...`). The
masked screenshots will still differ from the unmasked baselines once — approve those after
confirming with the user.
