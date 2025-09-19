import { SidebarProvider } from "@ui/components/sidebar";
import type { FC } from "react";
import { Outlet } from "react-router";
import { Header } from "./Header";
import { AppSidebar } from "./Sidebar";

export const Layout: FC = () => {
  return (
    <div className="flex h-screen bg-background">
      <SidebarProvider>
        <AppSidebar />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header category="changed" count={10} />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
};
