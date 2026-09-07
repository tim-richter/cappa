import type { Screenshot } from "@cappa/protocol";
import { SidebarProvider } from "@ui/components/sidebar";
import { Toaster } from "@ui/components/sonner";
import { type FC, useState } from "react";
import { Outlet } from "react-router";
import { useServerConfig } from "@/api/hooks";
import { isServerUnavailable, ServerUnavailable } from "./ServerUnavailable";
import { AppSidebar } from "./Sidebar";

export const Layout: FC = () => {
  const [activeCategory, setActiveCategory] = useState<
    Screenshot["category"] | null
  >(null);

  // `/api/config` is the first call every page makes, so it is where a rejected
  // token or a version mismatch shows up first. Both make the entire UI
  // useless, so they replace it rather than being reported per page.
  const { error } = useServerConfig();

  if (isServerUnavailable(error)) {
    return <ServerUnavailable error={error} />;
  }

  return (
    <div className="flex h-screen bg-background">
      <SidebarProvider>
        <AppSidebar />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Outlet context={{ activeCategory, setActiveCategory }} />
        </div>
      </SidebarProvider>

      <Toaster />
    </div>
  );
};
