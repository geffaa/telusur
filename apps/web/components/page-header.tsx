import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface Crumb {
  href: string;
  label: string;
}

export function PageHeader({
  title,
  description,
  crumbs = [],
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <nav className="mb-1 flex items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c) => (
              <span key={c.href} className="flex items-center gap-1">
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
                <ChevronRight className="size-3.5" />
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
