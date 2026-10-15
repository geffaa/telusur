"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RotateCw, Search } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDialog } from "@/components/access-dialog";
import { DocumentActions } from "@/components/document-actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import {
  API_URL,
  api,
  canManage,
  IN_PROGRESS,
  type ChunkItem,
  type Collection,
  type DocumentItem,
} from "@/lib/api";
import { formatBytes, formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const admin = canManage(me?.role);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const { data: doc } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api<DocumentItem>(`/documents/${id}`),
    refetchInterval: (q) =>
      q.state.data?.latest && IN_PROGRESS.includes(q.state.data.latest.status)
        ? 1500
        : false,
  });
  const { data: collection } = useQuery({
    queryKey: ["collection", doc?.collection_id],
    queryFn: () => api<Collection>(`/collections/${doc!.collection_id}`),
    enabled: !!doc,
  });
  const version = selected ?? doc?.current?.version ?? doc?.latest?.version;
  const shown = doc?.versions.find((v) => v.version === version);
  const { data: chunks, isLoading: chunksLoading } = useQuery({
    queryKey: ["chunks", id, version, shown?.status],
    queryFn: () =>
      api<ChunkItem[]>(`/documents/${id}/chunks?version=${version}`),
    enabled: admin && shown?.status === "ready",
  });
  const retry = useMutation({
    mutationFn: () => api(`/documents/${id}/retry`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["document", id] }),
    onError: (e) => toast.error(e.message),
  });

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? chunks?.filter((c) =>
        (c.heading_path + " " + c.content).toLowerCase().includes(needle),
      )
    : chunks;

  if (!doc) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/collections", label: "Collections" },
          {
            href: `/collections/${doc.collection_id}`,
            label: collection?.name ?? "…",
          },
        ]}
        title={doc.title}
        description={
          shown && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge status={shown.status} />
              <span>{shown.filename}</span>
              <span>{formatBytes(shown.size_bytes)}</span>
              {shown.pages && <span>{shown.pages} halaman</span>}
              <span title={formatDate(shown.updated_at)}>
                diperbarui {timeAgo(shown.updated_at)}
              </span>
            </span>
          )
        }
        actions={
          <>
            {admin && (
              <AccessDialog
                path={`/documents/${doc.id}/access`}
                kind="document"
                name={doc.title}
              />
            )}
            {doc.current && (
              <Button variant="outline" asChild>
                <a
                  href={`${API_URL}/documents/${doc.id}/file?version=${version}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" /> Buka file
                </a>
              </Button>
            )}
            {admin && (
              <DocumentActions
                doc={doc}
                busy={doc.versions.some((v) => IN_PROGRESS.includes(v.status))}
              />
            )}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-8">
          <h2 className="mb-2 text-sm font-medium">Versi</h2>
          <ul className="space-y-1">
            {[...doc.versions].reverse().map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => setSelected(v.version)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm",
                    v.version === version
                      ? "border-brand/40 bg-brand-soft"
                      : "border-transparent hover:bg-brand-soft/40",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      v{v.version}
                      {v.is_current && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          aktif
                        </span>
                      )}
                    </span>
                    <StatusBadge status={v.status} />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {v.chunk_count} potongan · {timeAgo(v.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Hanya versi aktif yang dipakai untuk menjawab pertanyaan.
          </p>
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Potongan terindeks</h2>
              <p className="text-xs text-muted-foreground">
                Teks yang dicari saat menjawab, beserta section dan halaman
                untuk sitasi.
              </p>
            </div>
            {chunks && chunks.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Cari di ${chunks.length} potongan`}
                  className="pl-8"
                />
              </div>
            )}
          </div>

          {!admin && (
            <Notice>
              Hanya Knowledge Admin yang dapat melihat potongan teks.
            </Notice>
          )}
          {admin && shown?.status === "failed" && (
            <Notice tone="bad">
              <span className="min-w-0 flex-1">{shown.error}</span>
              {shown.id === doc.latest?.id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retry.mutate()}
                  disabled={retry.isPending}
                >
                  <RotateCw className="size-3.5" /> Coba lagi
                </Button>
              )}
            </Notice>
          )}
          {admin && shown && IN_PROGRESS.includes(shown.status) && (
            <Notice>
              Dokumen sedang diproses. Halaman ini diperbarui otomatis.
            </Notice>
          )}
          {chunksLoading && <Skeleton className="h-40 rounded-lg" />}
          {needle && visible?.length === 0 && (
            <Notice>Tidak ada potongan yang mengandung “{query}”.</Notice>
          )}

          <ol className="divide-y surface empty:hidden">
            {visible?.map((c) => (
              <li
                key={c.id}
                className="grid gap-x-4 px-4 py-3 md:grid-cols-[9rem_minmax(0,1fr)]"
              >
                <div className="mb-1 flex gap-3 text-xs text-muted-foreground md:block md:space-y-0.5">
                  <p className="font-mono">#{c.ordinal}</p>
                  <p>
                    hal. {c.page_start}
                    {c.page_end !== c.page_start && `–${c.page_end}`}
                  </p>
                  <p>{c.token_count} token</p>
                  {c.kind === "table" && (
                    <p className="font-medium text-foreground">tabel</p>
                  )}
                </div>
                <div className="min-w-0">
                  {c.heading_path && (
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {c.heading_path}
                    </p>
                  )}
                  {c.kind === "table" ? (
                    <MarkdownTable source={c.content} />
                  ) : (
                    <p className="text-sm leading-relaxed">
                      <Highlight text={c.content} needle={needle} />
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "bad";
}) {
  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "bad"
          ? "border-danger/20 bg-danger-soft text-danger"
          : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle) return text;
  const parts = text.split(
    new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
  );
  return parts.map((p, i) =>
    p.toLowerCase() === needle ? (
      <mark
        key={i}
        className="rounded-sm bg-warning-soft px-0.5 text-foreground"
      >
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

/** Chunks store tables as Markdown; show them as a real table so admins can check extraction. */
function MarkdownTable({ source }: { source: string }) {
  const rows = source
    .split("\n")
    .filter(
      (l) => l.trim().startsWith("|") && !/^\|?[\s:|-]+\|?$/.test(l.trim()),
    )
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim()),
    );
  if (rows.length === 0)
    return <pre className="text-sm whitespace-pre-wrap">{source}</pre>;
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {head.map((h, i) => (
              <th
                key={i}
                className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
