import { cn } from "@/lib/utils";

/** Telusur mark: a magnifier over document lines, drawn so it stays crisp at 20-40px. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[60%]" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M4 6h9M4 10.5h5M4 15h4" />
        <circle cx="15.5" cy="13.5" r="4" />
        <path d="m18.5 16.5 2.5 2.5" />
      </svg>
    </span>
  );
}

export function Wordmark({ subtitle }: { subtitle?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-semibold tracking-tight">Telusur</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  );
}
