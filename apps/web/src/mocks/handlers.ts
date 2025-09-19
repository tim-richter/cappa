import { delay, HttpResponse, http } from "msw";
import type { Screenshot } from "@/types";

export const handlers = [
  http.all("*", async () => {
    await delay(250);
  }),
  http.get("/api/screenshots", ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");

    if (search) {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 1",
          url: "https://picsum.photos/200/300",
          category: "new",
        },
      ]);
    }

    if (category === "new") {
      return HttpResponse.json<Screenshot[]>([
          {
            name: "Screenshot 1",
            url: "https://picsum.photos/200/300",
            category: "new",
          },
        ],
      );
    }

    if (category === "deleted") {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 2",
          url: "https://picsum.photos/200/300",
          category: "deleted",
        },
      ]);
    }

    if (category === "changed") {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 3",
          url: "https://picsum.photos/200/300",
          category: "changed",
        },
      ]);
    }

    if (category === "passed") {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 4",
          url: "https://picsum.photos/200/300",
          category: "passed",
        },
      ]);
    }

    return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 1",
          url: "https://picsum.photos/200/300",
          category: "new",
        },
        {
          name: "Screenshot 2",
          url: "https://picsum.photos/200/300",
          category: "new",
        },
        {
          name: "Screenshot 3",
          url: "https://picsum.photos/200/300",
          category: "changed",
        },
        {
          name: "Screenshot 4",
          url: "https://picsum.photos/200/300",
          category: "deleted",
        },
        {
          name: "Screenshot 5",
          url: "https://picsum.photos/200/300",
          category: "passed",
        },
      ],
    );
  }),

  http.get("/api/screenshots/:id", ({ params }) => {
    return HttpResponse.json<Screenshot>({
      name: params.id as string,
      url: "https://picsum.photos/200/300",
      category: "new",
    });
  }),
];
