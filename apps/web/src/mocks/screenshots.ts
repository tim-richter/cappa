import type { Screenshot } from "@cappa/core";
import { HttpResponse, http } from "msw";

export const handlers = [
  http.get("/api/screenshots", ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");

    if (search) {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 1",
          id: "1",
          category: "new",
          actualPath: "https://picsum.photos/200/300",
          expectedPath: "https://picsum.photos/200/300",
          diffPath: "https://picsum.photos/200/300",
        },
      ]);
    }

    if (category === "new") {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 1",
          id: "1",
          actualPath: "https://picsum.photos/200/300",
          expectedPath: "https://picsum.photos/200/300",
          diffPath: "https://picsum.photos/200/300",
          category: "new",
        },
      ]);
    }

    if (category === "deleted") {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 2",
          id: "2",
          actualPath: "https://picsum.photos/200/300",
          expectedPath: "https://picsum.photos/200/300",
          diffPath: "https://picsum.photos/200/300",
          category: "deleted",
        },
      ]);
    }

    if (category === "changed") {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 3",
          id: "3",
          actualPath: "https://picsum.photos/200/300",
          expectedPath: "https://picsum.photos/200/300",
          diffPath: "https://picsum.photos/200/300",
          category: "changed",
        },
      ]);
    }

    if (category === "passed") {
      return HttpResponse.json<Screenshot[]>([
        {
          name: "Screenshot 4",
          id: "4",
          actualPath: "https://picsum.photos/200/300",
          expectedPath: "https://picsum.photos/200/300",
          diffPath: "https://picsum.photos/200/300",
          category: "passed",
        },
      ]);
    }

    return HttpResponse.json<Screenshot[]>([
      {
        name: "Screenshot 1",
        id: "1",
        actualPath: "https://picsum.photos/200/300",
        expectedPath: "https://picsum.photos/200/300",
        diffPath: "https://picsum.photos/200/300",
        category: "new",
      },
      {
        name: "Screenshot 2",
        id: "2",
        actualPath: "https://picsum.photos/200/300",
        expectedPath: "https://picsum.photos/200/300",
        diffPath: "https://picsum.photos/200/300",
        category: "new",
      },
      {
        name: "Screenshot 3",
        id: "3",
        actualPath: "https://picsum.photos/200/300",
        expectedPath: "https://picsum.photos/200/300",
        diffPath: "https://picsum.photos/200/300",
        category: "changed",
      },
      {
        name: "Screenshot 4",
        id: "4",
        actualPath: "https://picsum.photos/200/300",
        expectedPath: "https://picsum.photos/200/300",
        diffPath: "https://picsum.photos/200/300",
        category: "deleted",
      },
      {
        name: "Screenshot 5",
        id: "5",
        actualPath: "https://picsum.photos/200/300",
        expectedPath: "https://picsum.photos/200/300",
        diffPath: "https://picsum.photos/200/300",
        category: "passed",
      },
    ]);
  }),

  http.get("/api/screenshots/:id", ({ params }) => {
    return HttpResponse.json<Screenshot>({
      name: params.id as string,
      id: params.id as string,
      actualPath: "/images/4a.png",
      expectedPath: "/images/4b.png",
      diffPath: "/images/4diff.png",
      category: "new",
    });
  }),

  http.post("/api/screenshots/:id", ({ params }) => {
    return HttpResponse.json<Screenshot>({
      name: params.id as string,
      id: params.id as string,
      category: "new",
      actualPath: "/images/4a.png",
      expectedPath: "/images/4b.png",
      diffPath: "/images/4diff.png",
      approved: true,
    });
  }),
];
