import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title?: string;
  message?: string;
  onReset?: () => void;
  resetLabel?: string;
}

export function EmptyState({
  title = "No data found",
  message = "No data matches your current filters. Try adjusting your filters or resetting them.",
  onReset,
  resetLabel = "Reset filters",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <SearchX className="size-12 text-muted-foreground/50 mb-4" />
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{message}</p>
      {onReset && (
        <Button variant="outline" onClick={onReset}>
          {resetLabel}
        </Button>
      )}
    </div>
  );
}
