import type { Page } from "playwright-core";
import type { StorybookStory } from "./plugin";

/**
 * Disable CSS transitions, animations, and scrollbars
 * @param page - The page to disable CSS transitions, animations, and scrollbars
 */
export const freezeUI = async (page: Page) => {
  await page.addStyleTag({
    content: `
			*, *::before, *::after {
				-moz-animation: none !important;
				-moz-transition: none !important;
				transition: none !important; 
				animation: none !important;
			}
			*, input, textarea { caret-color: transparent !important }
			*:focus { outline: none !important }
			*:focus-visible { outline: none !important }
			*:focus-within { outline: none !important }
			* { text-rendering: optimizeLegibility !important }
			::-webkit-scrollbar { display: none !important }
      html { scroll-behavior: auto !important }
			svg, svg * {
			  shape-rendering: crispEdges !important;
				text-rendering: geometricPrecision !important;
				vector-effect: non-scaling-stroke !important;
			}
			img { image-rendering: crisp-edges !important }
		`,
  });
};

/**
 * Wait for general visual stability on the page
 * @param page - The page to wait for
 */
export const waitForVisualIdle = async (page: Page) => {
  // Wait for the page to be fully loaded
  await page.waitForLoadState("networkidle");

  // fonts + images
	await page.evaluate(async () => {
		await (document as any).fonts?.ready?.catch(() => {})
		const imgs = Array.from(document.images).filter(i => !i.complete)
		await Promise.all(imgs.map(i => new Promise(res => { i.onload = i.onerror = () => res(null) })))
	})

  // 2 animation frames + idle period with no DOM mutations
	await page.evaluate(({ minIdleMs }) => new Promise<void>(resolve => {
		let timer: number | null = null
		let last = performance.now()

		const done = () => {
			if (timer) cancelAnimationFrame(timer)
			resolve()
		}

		const mo = new MutationObserver(() => { last = performance.now() })
		mo.observe(document, { attributes: true, childList: true, subtree: true, characterData: true })

		const tick = () => {
			if (performance.now() - last >= minIdleMs) {
				mo.disconnect()
				done()
			} else {
				timer = requestAnimationFrame(tick)
			}
		}

		requestAnimationFrame(() => requestAnimationFrame(tick))
	}), { minIdleMs: 100 })
};

/**
 * Build a filename for a story.
 * @param story - The story to build a filename for
 * @returns The filename for the story. Slashes represent folders that should be handled by seperate file system calls.
 */
export const buildFilename = (story: StorybookStory) => {
  return `${story.title.replace(/[^a-zA-Z0-9/]/g, "")}/${story.name.replace(/[^a-zA-Z0-9]/g, "")}.png`;
};
