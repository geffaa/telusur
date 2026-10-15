"use client";

import type { VersionStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const STYLES: Record<VersionStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  parsing: "bg-info-soft text-info",
  embedding: "bg-info-soft text-info",
  ready: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
};

export function StatusBadge({ status, className }: { status: VersionStatus; className?: string }) {
  const { t } = useT();
  const busy = status === "parsing" || status === "embedding" || status === "queued";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STYLES[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", busy && "animate-pulse")} aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}
