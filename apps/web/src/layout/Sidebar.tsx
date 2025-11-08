import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
} from "@ui/components/sidebar";
import { Check, Plus, Trash, TriangleAlert } from "lucide-react";
import { Link, useLocation } from "react-router";

export const AppSidebar = () => {
  const pathname = useLocation().pathname;
  const { data: count } = useQuery({
    queryKey: ["screenshots"],
    queryFn: () => {
      return fetch("/api/screenshots").then((res) => res.json());
    },
    select: (data) => data?.length || 0,
  });

  return (
    <Sidebar>
      <SidebarHeader className="border-b py-4">
        <Link to="/" className="text-2xl font-bold">
          Cappa
        </Link>
        <p className="text-sm text-muted-foreground">
          Visual regression report
        </p>
      </SidebarHeader>

      <SidebarContent className="mt-4 p-2">
        <SidebarMenuButton asChild isActive={pathname === "/changed"}>
          <Link to="changed">
            <TriangleAlert className="size-4" /> <span>Changed</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton asChild isActive={pathname === "/new"}>
          <Link to="new">
            <Plus className="size-4" /> <span>New</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton asChild isActive={pathname === "/deleted"}>
          <Link to="deleted">
            <Trash className="size-4" /> <span>Deleted</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton asChild isActive={pathname === "/passed"}>
          <Link to="passed">
            <Check className="size-4" /> <span>Passed</span>
          </Link>
        </SidebarMenuButton>
      </SidebarContent>

      <SidebarFooter className="border-t py-4">
        <div className="text-xs text-muted-foreground">
          <div className="flex justify-between mb-1">
            <span>Total Screenshots</span>
            <span>{count}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
