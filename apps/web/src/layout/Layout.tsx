import { SidebarProvider } from "@ui/components/sidebar";
import type { FC } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "./Sidebar";

export const Layout: FC = () => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main>
        <Outlet />
      </main>
    </SidebarProvider>
  );
};
