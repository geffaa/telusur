"use client";

import {
  FolderOpen,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  ThumbsUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { api, canManage, ROLE_LABEL, type Role } from "@/lib/api";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof FolderOpen; match?: string[] };
type Section = { title?: string; visible: (role?: Role) => boolean; items: Item[] };

const SECTIONS: Section[] = [
  { visible: () => true, items: [{ href: "/chat", label: "Tanya", icon: MessageSquare }] },
  {
    title: "Pengetahuan",
    visible: canManage,
    items: [
      { href: "/overview", label: "Ringkasan", icon: LayoutDashboard },
      { href: "/collections", label: "Collections", icon: FolderOpen, match: ["/collections", "/documents"] },
      { href: "/gaps", label: "Tak terjawab", icon: HelpCircle },
      { href: "/feedback", label: "Feedback", icon: ThumbsUp },
      { href: "/evaluation", label: "Evaluasi", icon: Gauge },
    ],
  },
  {
    visible: (role) => !canManage(role),
    items: [{ href: "/collections", label: "Dokumen", icon: FolderOpen, match: ["/collections", "/documents"] }],
  },
  {
    title: "Administrasi",
    visible: canManage,
    items: [
      { href: "/people", label: "Pengguna & grup", icon: Users },
      { href: "/access-check", label: "Cek akses", icon: ShieldCheck },
    ],
  },
  {
    visible: (role) => role === "tenant_admin",
    items: [{ href: "/audit", label: "Audit log", icon: ScrollText }],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const sections = me ? SECTIONS.filter((s) => s.visible(me.role)) : [];

  return (
    <div className="min-h-screen md:grid md:grid-cols-[224px_1fr]">
      <aside className="border-b bg-muted/40 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:block md:py-4">
          <div className="min-w-0">
            <p className="font-semibold tracking-tight">Telusur</p>
            {me ? (
              <p className="truncate text-xs text-muted-foreground">{me.tenant_name}</p>
            ) : (
              <Skeleton className="mt-1 h-3 w-28" />
            )}
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={logout} aria-label="Keluar">
            <LogOut className="size-4" />
          </Button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0 md:overflow-y-auto md:pb-0">
          {sections.map((section, i) => (
            <div key={i} className="flex gap-1 md:mb-3 md:flex-col md:gap-0.5">
              {section.title && (
                <p className="hidden px-2.5 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase md:block">
                  {section.title}
                </p>
              )}
              {section.items.map(({ href, label, icon: Icon, match }) => {
                const active = (match ?? [href]).some((m) => pathname.startsWith(m));
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                      active
                        ? "bg-background font-medium shadow-xs ring-1 ring-border"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" /> {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto hidden border-t p-3 md:block">
          {me && (
            <div className="mb-2 px-1">
              <p className="truncate text-sm font-medium">{me.name}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABEL[me.role]}</p>
            </div>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
            <LogOut className="size-4" /> Keluar
          </Button>
        </div>
      </aside>
      {pathname.startsWith("/chat") ? (
        <main className="min-w-0">{children}</main>
      ) : (
        <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      )}
    </div>
  );
}
