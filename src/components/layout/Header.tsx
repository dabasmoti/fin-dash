import { useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Sun, Moon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/contexts/ThemeContext";
import { useData } from "@/contexts/DataContext";
import { DataSourceIndicator } from "@/components/shared/DataSourceIndicator";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/transactions": "Transactions",
  "/analytics": "Analytics",
};

interface HeaderProps {
  onMobileMenuOpen: () => void;
}

function getAccountCount(
  bankData: { result: { success: boolean; accounts: { accountNumber: string }[] } }[],
): number {
  let count = 0;
  for (const bank of bankData) {
    if (bank.result.success) {
      count += bank.result.accounts.length;
    }
  }
  return count;
}

export function Header({ onMobileMenuOpen }: HeaderProps) {
  const { pathname } = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const { bankData, isLoading, refresh } = useData();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  const pageTitle = ROUTE_TITLES[pathname] ?? "fin-dash";
  const accountCount = getAccountCount(bankData);

  function handleThemeToggle() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      {/* Mobile menu button -- hidden on md and above */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMobileMenuOpen}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </Button>

      {/* Page title */}
      <h1 className="text-lg font-semibold">{pageTitle}</h1>

      <div className="ml-auto flex items-center gap-3">
        {/* Refresh data */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          aria-label="Refresh data"
        >
          <RefreshCw
            className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </Button>

        {/* Data source indicator */}
        <DataSourceIndicator />

        <Separator orientation="vertical" className="h-5" />

        {/* Account count */}
        {!isLoading && accountCount > 0 && (
          <>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {accountCount} {accountCount === 1 ? "account" : "accounts"}
            </span>
            <Separator orientation="vertical" className="h-5" />
          </>
        )}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleThemeToggle}
          aria-label={
            resolvedTheme === "dark"
              ? "Switch to light mode"
              : "Switch to dark mode"
          }
        >
          {resolvedTheme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
