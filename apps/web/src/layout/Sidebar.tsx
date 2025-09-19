import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
} from "@ui/components/sidebar";
import { Check, Plus, Trash, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

export const AppSidebar = () => {
  return (
    <Sidebar>
      <SidebarHeader className="border-b py-4">
        <h1 className="text-2xl font-bold">Cappa</h1>
        <p className="text-sm text-muted-foreground">
          Visual regression report
        </p>
      </SidebarHeader>

      <SidebarContent className="mt-4">
        <SidebarMenuButton size="lg" asChild>
          <Link to="changed">
            <TriangleAlert /> <span>Changed</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton size="lg" asChild>
          <Link to="new">
            <Plus /> <span>New</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton size="lg" asChild>
          <Link to="deleted">
            <Trash /> <span>Deleted</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton size="lg" asChild>
          <Link to="passed">
            <Check /> <span>Passed</span>
          </Link>
        </SidebarMenuButton>
      </SidebarContent>

      <SidebarFooter className="border-t py-4">
        <div className="text-xs text-muted-foreground">
          <div className="flex justify-between mb-1">
            <span>Total Screenshots</span>
            <span>100</span>
          </div>
          <div className="flex justify-between">
            <span>Last Updated</span>
            <span>2 min ago</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
