"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, Download } from "lucide-react";
import { Fragment, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL, api, type AuditItem } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Login",
  "query.asked": "Bertanya",
  "document.uploaded": "Unggah dokumen",
  "document.version_uploaded": "Unggah versi baru",
  "document.deleted": "Hapus dokumen",
  "document.reprocessed": "Proses ulang dokumen",
  "collection.created": "Buat collection",
  "acl.changed": "Ubah akses",
  "user.created": "Tambah pengguna",
  "user.role_changed": "Ubah peran",
  "user.groups_changed": "Ubah grup pengguna",
  "group.created": "Buat grup",
  "group.deleted": "Hapus grup",
  "gap.resolved": "Tutup pertanyaan tak terjawab",
  "access.checked": "Cek akses",
};

const label = (action: string) => ACTION_LABEL[action] ?? action;

function filters(action: string, q: string) {
  const p = new URLSearchParams();
  if (action !== "all") p.set("action", action);
  if (q.trim()) p.set("q", q.trim());
  return p;
}

export default function AuditPage() {
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data: actions } = useQuery({ queryKey: ["audit-actions"], queryFn: () => api<string[]>("/audit-logs/actions") });
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["audit", action, q],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = filters(action, q);
      if (pageParam) p.set("before", pageParam);
      return api<{ items: AuditItem[]; next_before: string | null }>(`/audit-logs?${p}`);
    },
    getNextPageParam: (last) => last.next_before,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Catatan permanen siapa melakukan apa. Tidak dapat diubah atau dihapus, termasuk oleh admin."
        actions={
          <Button variant="outline" asChild>
            <a href={`${API_URL}/audit-logs/export.csv?${filters(action, q)}`}>
              <Download className="size-4" /> Ekspor CSV
            </a>
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-3">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua aksi</SelectItem>
            {actions?.map((a) => (
              <SelectItem key={a} value={a}>
                {label(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari pelaku atau target"
          className="w-full sm:w-72"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium whitespace-nowrap">Waktu</th>
              <th className="px-4 py-2 font-medium">Pelaku</th>
              <th className="px-4 py-2 font-medium">Aksi</th>
              <th className="px-4 py-2 font-medium">Target</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-4">
                  <Skeleton className="h-24" />
                </td>
              </tr>
            )}
            {items.map((item) => {
              const expanded = open === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(expanded ? null : item.id)}>
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{item.actor_name ?? "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{label(item.action)}</td>
                    <td className="max-w-md truncate px-4 py-2" title={item.target_label ?? ""}>
                      {item.target_label ?? "—"}
                    </td>
                    <td className="pr-3">
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-muted/20">
                      <td colSpan={5} className="px-4 py-3">
                        <Detail item={item} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Tidak ada catatan untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Memuat…" : "Muat lebih banyak"}
          </Button>
        </div>
      )}
    </>
  );
}

function Detail({ item }: { item: AuditItem }) {
  const meta = Object.entries(item.meta ?? {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length));
  return (
    <div className="grid gap-4 text-xs md:grid-cols-3">
      {(item.before || item.after) && (
        <div className="md:col-span-2">
          <p className="mb-1 font-medium text-muted-foreground">Perubahan</p>
          <div className="grid grid-cols-2 gap-2">
            <pre className="overflow-x-auto rounded border bg-background p-2">{JSON.stringify(item.before, null, 2) ?? "—"}</pre>
            <pre className="overflow-x-auto rounded border bg-background p-2">{JSON.stringify(item.after, null, 2) ?? "—"}</pre>
          </div>
        </div>
      )}
      {meta.length > 0 && (
        <dl className="space-y-1 md:col-span-2">
          {meta.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <dl className="space-y-1">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">IP</dt>
          <dd>{item.ip ?? "—"}</dd>
        </div>
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">Target</dt>
          <dd className="break-all">
            {item.target_type} {item.target_id}
          </dd>
        </div>
      </dl>
    </div>
  );
}
