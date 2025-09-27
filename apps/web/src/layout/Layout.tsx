import type { Screenshot } from "@cappa/core";
import { SidebarProvider } from "@ui/components/sidebar";
import { type FC, useState } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "./Sidebar";

export const Layout: FC = () => {
  const [activeCategory, setActiveCategory] = useState<
    Screenshot["category"] | null
  >(null);

  return (
    <div className="flex h-screen bg-background">
      <SidebarProvider>
        <AppSidebar />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Outlet context={{ activeCategory, setActiveCategory }} />
        </div>
      </SidebarProvider>
    </div>
  );
};
