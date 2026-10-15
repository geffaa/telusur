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
import { Avatar } from "@/components/avatar";
import { Wordmark } from "@/components/brand";
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
    <div className="min-h-screen md:grid md:grid-cols-[236px_1fr]">
      <aside className="border-b bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-4 md:pt-5 md:pb-4">
          <Link href="/" className="min-w-0">
            <Wordmark subtitle={me ? me.tenant_name : <Skeleton className="mt-1 h-3 w-28" />} />
          </Link>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={logout} aria-label="Keluar">
            <LogOut className="size-4" />
          </Button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:gap-0 md:overflow-y-auto md:pb-0">
          {sections.map((section, i) => (
            <div key={i} className="flex gap-1 md:mb-4 md:flex-col md:gap-0.5">
              {section.title && (
                <p className="hidden px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase md:block">
                  {section.title}
                </p>
              )}
              {section.items.map(({ href, label, icon: Icon, match }) => {
                const active = (match ?? [href]).some((m) => pathname.startsWith(m));
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-card font-medium text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] ring-1 ring-border"
                        : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", active && "text-brand")} /> {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto hidden p-3 md:block">
          {me && (
            <div className="flex items-center gap-2.5 surface bg-card p-2.5">
              <Avatar name={me.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{me.name}</p>
                <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[me.role]}</p>
              </div>
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={logout} aria-label="Keluar">
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>
      {pathname.startsWith("/chat") ? (
        <main className="min-w-0">{children}</main>
      ) : (
        <main className="min-w-0 px-4 py-6 md:px-10 md:py-9">
          <div className="mx-auto w-full max-w-[1360px]">{children}</div>
        </main>
      )}
    </div>
  );
}
