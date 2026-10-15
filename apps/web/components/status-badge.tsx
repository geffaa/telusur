import type { VersionStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABELS: Record<VersionStatus, string> = {
  queued: "Antre",
  parsing: "Membaca",
  embedding: "Indexing",
  ready: "Siap",
  failed: "Gagal",
};

const DOT: Record<VersionStatus, string> = {
  queued: "bg-muted-foreground/50",
  parsing: "bg-blue-500 animate-pulse",
  embedding: "bg-violet-500 animate-pulse",
  ready: "bg-emerald-500",
  failed: "bg-red-500",
};

export function StatusBadge({ status }: { status: VersionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        status === "failed" ? "text-red-700 dark:text-red-400" : "text-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[status])} aria-hidden />
      {LABELS[status]}
    </span>
  );
}
