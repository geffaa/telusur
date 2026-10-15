import { cn } from "@/lib/utils";

// Soft tones that read well on white and in dark mode; picked by a stable hash of the name.
const TONES = [
  "bg-brand-soft text-brand-strong",
  "bg-info-soft text-info",
  "bg-warning-soft text-warning",
  "bg-success-soft text-success",
  "bg-danger-soft text-danger",
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const tone = TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length];
  return (
    <span
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", tone, className)}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
