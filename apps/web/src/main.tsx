import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./routes";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(<RouterProvider router={router} />);
} else {
  console.error("Root element not found");
}
