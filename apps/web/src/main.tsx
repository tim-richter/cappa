import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Providers } from "./Providers";
import { router } from "./routes";

async function applyTheme() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const { theme } = (await res.json()) as { theme: "light" | "dark" };
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  } catch {
    // Default to light when API is unavailable (e.g. dev without server)
  }
}

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
  enableMocking().then(() =>
    applyTheme().then(() => {
      createRoot(root).render(
        <Providers>
          <RouterProvider router={router} />
        </Providers>,
      );
    }),
  );
} else {
  console.error("Root element not found");
}
