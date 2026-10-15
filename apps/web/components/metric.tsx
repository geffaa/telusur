import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Tone = "brand" | "success" | "info" | "warning" | "danger" | "neutral";

const ICON_TONE: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
};

export function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  suffix,
  href,
}: {
  label: string;
  value?: number;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  suffix?: string;
  href?: string;
}) {
  const body = (
    <div className="flex h-full flex-col items-start gap-3 p-4 sm:flex-row">
      <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-1.5 h-7 w-14" />
        ) : (
          <p className={cn("mt-0.5 text-2xl font-semibold tracking-tight tabular-nums", tone === "danger" && "text-danger")}>
            {formatNumber(value)}
            {suffix && <span className="ml-0.5 text-base font-medium text-muted-foreground">{suffix}</span>}
          </p>
        )}
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="surface block transition-colors hover:border-brand/40">
      {body}
    </Link>
  ) : (
    <div className="surface">{body}</div>
  );
}
