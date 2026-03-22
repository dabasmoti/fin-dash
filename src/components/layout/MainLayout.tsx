import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, SidebarContent } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const handleMobileMenuOpen = useCallback(() => {
    setMobileSheetOpen(true);
  }, []);

  const handleMobileNavigate = useCallback(() => {
    setMobileSheetOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar -- hidden below md */}
      <div className="hidden md:flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* Mobile sidebar sheet */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="left" className="w-60 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={handleMobileNavigate} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMobileMenuOpen={handleMobileMenuOpen} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
