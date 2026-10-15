"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AccessDialog } from "@/components/access-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";
import { api, canManage, IN_PROGRESS, type Collection, type DocumentItem } from "@/lib/api";
import { formatBytes, timeAgo } from "@/lib/format";

const ACCEPT = ".pdf,.docx,.md,.markdown,.txt";
type Filter = "all" | "ready" | "processing" | "failed";

function bucket(d: DocumentItem): Exclude<Filter, "all"> {
  const s = d.latest?.status;
  if (s === "ready") return "ready";
  if (s === "failed") return "failed";
  return "processing";
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const admin = canManage(me?.role);

  const { data: collection } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => api<Collection>(`/collections/${id}`),
  });
  const { data: docs, isLoading } = useQuery({
    queryKey: ["documents", id],
    queryFn: () => api<DocumentItem[]>(`/collections/${id}/documents`),
    // Poll only while something is still being ingested.
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.latest && IN_PROGRESS.includes(d.latest.status)) ? 1500 : false,
  });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => {
    const c = { all: docs?.length ?? 0, ready: 0, processing: 0, failed: 0 };
    docs?.forEach((d) => c[bucket(d)]++);
    return c;
  }, [docs]);
  const visible = docs?.filter(
    (d) =>
      (filter === "all" || bucket(d) === filter) &&
      (d.title + " " + (d.latest?.filename ?? "")).toLowerCase().includes(query.toLowerCase()),
  );

  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const dragging = useWindowDrop(admin, (files) => upload(files));

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    let ok = 0;
    await Promise.all(
      list.map(async (file) => {
        const form = new FormData();
        form.append("file", file);
        try {
          await api(`/collections/${id}/documents`, { method: "POST", body: form });
          ok++;
        } catch (e) {
          toast.error(file.name, { description: (e as Error).message });
        } finally {
          setUploading((n) => n - 1);
          queryClient.invalidateQueries({ queryKey: ["documents", id] });
        }
      }),
    );
    if (ok) toast.success(`${ok} dokumen diunggah dan sedang diproses`);
    setFilter("all");
    ["collections", "collections-health", "overview"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
  }

  const retry = useMutation({
    mutationFn: (docId: string) => api(`/documents/${docId}/retry`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", id] }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/collections", label: "Collections" }]}
        title={collection?.name ?? <Skeleton className="h-7 w-48" />}
        description={collection?.description}
        actions={
          admin && (
            <>
              <AccessDialog path={`/collections/${id}/access`} kind="collection" name={collection?.name ?? ""} />
              <Button onClick={() => input.current?.click()} disabled={uploading > 0}>
                <Upload className="size-4" />
                {uploading > 0 ? `Mengunggah ${uploading}…` : "Upload"}
              </Button>
              <input
                ref={input}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari judul atau nama file"
            className="pl-8"
          />
        </div>
        <div className="segmented" role="tablist">
          {(
            [
              ["all", "Semua"],
              ["ready", "Siap"],
              ["processing", "Diproses"],
              ["failed", "Gagal"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} <span className="tabular-nums opacity-60">{counts[key]}</span>
            </button>
          ))}
        </div>
        {admin && (
          <p className="ml-auto hidden text-xs text-muted-foreground lg:block">
            Tarik file ke halaman ini untuk upload · PDF, DOCX, MD, TXT · maks. 50 MB
          </p>
        )}
      </div>

      <div className="overflow-x-auto surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[40%]">Dokumen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Versi</TableHead>
              <TableHead className="text-right">Halaman</TableHead>
              <TableHead className="text-right">Potongan</TableHead>
              <TableHead className="text-right">Ukuran</TableHead>
              <TableHead className="text-right">Diperbarui</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
            {visible?.map((d) => {
              const v = d.latest;
              return (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(`/documents/${d.id}`)}>
                  <TableCell className="max-w-0">
                    <Link
                      href={`/documents/${d.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-medium"
                    >
                      {d.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{v?.filename}</p>
                  </TableCell>
                  <TableCell>
                    {v && <StatusBadge status={v.status} />}
                    {v?.status === "failed" && (
                      <div className="mt-1 flex items-center gap-2">
                        <p className="max-w-56 truncate text-xs text-danger" title={v.error ?? ""}>
                          {v.error}
                        </p>
                        {admin && (
                          <button
                            className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              retry.mutate(d.id);
                            }}
                          >
                            <RotateCw className="size-3" /> Coba lagi
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">v{v?.version}</TableCell>
                  <TableCell className="text-right tabular-nums">{v?.pages ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{v?.chunk_count || "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {v && formatBytes(v.size_bytes)}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                    {v && timeAgo(v.updated_at)}
                  </TableCell>
                </TableRow>
              );
            })}
            {docs && visible?.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-muted-foreground">
                  {docs.length === 0 ? (
                    <>
                      <p>Collection ini belum berisi dokumen.</p>
                      {admin && (
                        <Button size="sm" className="mt-3" onClick={() => input.current?.click()}>
                          <Upload className="size-4" /> Upload dokumen
                        </Button>
                      )}
                    </>
                  ) : (
                    "Tidak ada dokumen yang cocok dengan filter."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-foreground/30 px-10 py-8 text-center">
            <Upload className="mx-auto mb-2 size-6" />
            <p className="font-medium">Lepas untuk upload ke {collection?.name}</p>
            <p className="text-sm text-muted-foreground">PDF, DOCX, Markdown, TXT</p>
          </div>
        </div>
      )}
    </>
  );
}

/** Accept files dropped anywhere on the page; returns whether a file is being dragged over. */
function useWindowDrop(enabled: boolean, onDrop: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onDrop);
  handler.current = onDrop;

  useEffect(() => {
    if (!enabled) return;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setDragging(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) handler.current(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);

  return dragging;
}
