import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Providers } from "./Providers";
import { router } from "./routes";

async function enableMocking() {
  if (import.meta.env.DEV !== true) {
    return;
  }

  const { worker } = await import("./mocks/browser");

  // `worker.start()` returns a Promise that resolves
  // once the Service Worker is up and ready to intercept requests.
  return worker.start({ onUnhandledRequest: "bypass" });
}

const root = document.getElementById("root");

if (root) {
  enableMocking().then(() => {
    createRoot(root).render(
      <Providers>
        <RouterProvider router={router} />
      </Providers>,
    );
  });
} else {
  console.error("Root element not found");
}
