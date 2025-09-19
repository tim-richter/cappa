import { createBrowserRouter } from "react-router";
import { Layout } from "./layout/Layout";
import { Changed } from "./pages/Changed";
import { Deleted } from "./pages/Deleted";
import { Home } from "./pages/Home";
import { New } from "./pages/New";
import { Passed } from "./pages/Passed";

export const router = createBrowserRouter([
  {
    Component: Layout,
    children: [
      {
        index: true,
        Component: Home,
      },
      {
        path: "changed",
        Component: Changed,
      },
      {
        path: "deleted",
        Component: Deleted,
      },
      {
        path: "new",
        Component: New,
      },
      {
        path: "passed",
        Component: Passed,
      },
    ],
  },
]);
