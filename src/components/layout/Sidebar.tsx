import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavigationItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Transactions", path: "/transactions", icon: ArrowLeftRight },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* App branding */}
      <div className="flex h-14 items-center gap-2 px-4">
        <Wallet className="size-5 shrink-0 text-sidebar-primary" />
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight">
            fin-dash
          </span>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <TooltipProvider>
          <nav className="flex flex-col gap-1 px-2">
            {NAVIGATION_ITEMS.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/70",
                        collapsed && "justify-center px-2",
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">{item.label}</TooltipContent>
                )}
              </Tooltip>
            ))}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      <Separator />

      {/* Collapse toggle */}
      <div className="flex items-center justify-center p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}

/** Mobile-only sidebar content rendered inside a Sheet */
export function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col">
      {/* App branding */}
      <div className="flex h-14 items-center gap-2 px-4">
        <Wallet className="size-5 text-primary" />
        <span className="text-lg font-semibold tracking-tight">fin-dash</span>
      </div>

      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-1 px-2">
          {NAVIGATION_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-accent text-primary"
                    : "text-muted-foreground",
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}
