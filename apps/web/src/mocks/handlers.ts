import type { ScreenshotPaths } from '@/types'
import { delay, http, HttpResponse } from 'msw'
 
export const handlers = [
  http.all('*', async () => {
    await delay(250)
  }),
  http.get('/api/screenshots', () => {
    return HttpResponse.json<ScreenshotPaths>({
      actual: [
        {
          name: 'Screenshot 1',
          url: 'https://picsum.photos/200/300',
          category: 'changed',
        },
        {
          name: 'Screenshot 2',
          url: 'https://picsum.photos/200/300',
          category: 'new',
        },
      ],
      expected: [
        {
          name: 'Screenshot 3',
          url: 'https://picsum.photos/200/300',
          category: 'deleted',
        },
      ],
      diff: [],
    })
  }),
]