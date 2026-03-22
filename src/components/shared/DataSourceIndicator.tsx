import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useData } from "@/contexts/DataContext";
import { getBankDisplayName } from "@/constants/banks";

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function DataSourceIndicator() {
  const { bankData, error, isLoading, refresh } = useData();
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.lastScrape) setLastSync(data.lastScrape);
      })
      .catch(() => {});
  }, [bankData]);

  const connectedBanks = bankData.filter((b) => b.result.success);
  const failedBanks = bankData.filter((b) => !b.result.success);
  const hasConnected = connectedBanks.length > 0;
  const hasFailures = failedBanks.length > 0;

  const badgeState = isLoading
    ? "loading"
    : error
      ? "error"
      : hasFailures && !hasConnected
        ? "error"
        : hasFailures
          ? "partial"
          : hasConnected
            ? "ok"
            : "error";

  const badgeStyles = {
    loading: "border-blue-500/50 text-blue-700 dark:text-blue-400",
    error: "border-red-500/50 text-red-700 dark:text-red-400",
    partial: "border-amber-500/50 text-amber-700 dark:text-amber-400",
    ok: "border-green-500/50 text-green-700 dark:text-green-400",
  };

  const dotStyles = {
    loading: "bg-blue-500 animate-pulse",
    error: "bg-red-500",
    partial: "bg-amber-500",
    ok: "bg-green-500",
  };

  const badgeLabel = isLoading
    ? "Scraping..."
    : error
      ? "No Data"
      : `${connectedBanks.length}/${bankData.length} Connected`;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={badgeStyles[badgeState]}>
              <span
                className={`inline-block size-2 rounded-full ${dotStyles[badgeState]}`}
              />
              {badgeLabel}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {isLoading ? (
              <span>Fetching bank data (may take 1-2 minutes)...</span>
            ) : error ? (
              <span>{error}</span>
            ) : (
              <div className="space-y-1 text-xs">
                {connectedBanks.map((b) => (
                  <div key={b.bankId} className="flex items-center gap-1.5">
                    <span className="inline-block size-1.5 rounded-full bg-green-500" />
                    {getBankDisplayName(b.bankId)}
                  </div>
                ))}
                {failedBanks.map((b) => (
                  <div key={b.bankId} className="flex items-center gap-1.5">
                    <span className="inline-block size-1.5 rounded-full bg-red-500" />
                    <span>
                      {getBankDisplayName(b.bankId)}
                      {b.result.errorType && (
                        <span className="text-muted-foreground">
                          {" — "}{b.result.errorType.replace(/_/g, " ").toLowerCase()}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TooltipContent>
        </Tooltip>

        {lastSync && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Synced {formatSyncTime(lastSync)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Last scrape: {new Date(lastSync).toLocaleString("he-IL")}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={refresh}
              disabled={isLoading}
              aria-label="Refresh data"
            >
              <RefreshCw
                className={`size-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
