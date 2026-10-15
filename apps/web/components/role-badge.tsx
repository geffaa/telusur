"use client";

import type { Role } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const STYLES: Record<Role, string> = {
  employee: "bg-muted text-muted-foreground",
  knowledge_admin: "bg-brand-soft text-brand-strong",
  tenant_admin: "bg-info-soft text-info",
};

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", STYLES[role])}>
      {t(`role.${role}`)}
    </span>
  );
}
