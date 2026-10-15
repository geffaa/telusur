"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type GapCluster } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function GapsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["gaps"],
    queryFn: () => api<GapCluster[]>("/knowledge-gaps"),
  });
  const resolve = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ resolved: number }>("/knowledge-gaps/resolve", { method: "POST", body: JSON.stringify({ gap_ids: ids }) }),
    onSuccess: (r) => {
      toast.success(`${r.resolved} pertanyaan ditandai selesai`);
      queryClient.invalidateQueries({ queryKey: ["gaps"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Pertanyaan tak terjawab"
        description="Pertanyaan yang tidak bisa dijawab dari dokumen, dikelompokkan per topik. Unggah dokumen yang menjawabnya, lalu tandai selesai."
      />
      {isLoading && <Skeleton className="h-48 rounded-lg" />}
      {data?.length === 0 && (
        <div className="surface px-6 py-14 text-center">
          <p className="font-medium">Tidak ada pertanyaan yang tertunda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Setiap pertanyaan yang tidak terjawab akan muncul di sini, dikelompokkan menurut maknanya.
          </p>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="overflow-hidden surface">
          <div className="hidden grid-cols-[minmax(0,1fr)_6rem_6rem_9rem_8rem] gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Topik (pertanyaan terbaru)</span>
            <span className="text-right">Penanya</span>
            <span className="text-right">Pertanyaan</span>
            <span className="text-right">Terakhir</span>
            <span />
          </div>
          <ul className="divide-y">
            {data.map((c) => (
              <GapRow key={c.gap_ids[0]} cluster={c} onResolve={() => resolve.mutate(c.gap_ids)} busy={resolve.isPending} />
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Pertanyaan dikelompokkan otomatis berdasarkan kemiripan makna. Penanya dihitung per orang, bukan per pertanyaan.{" "}
        <Link href="/collections" className="underline">
          Unggah dokumen
        </Link>
      </p>
    </>
  );
}

function GapRow({ cluster, onResolve, busy }: { cluster: GapCluster; onResolve: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const more = cluster.examples.length > 1;
  return (
    <li>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_6rem_6rem_9rem_8rem]">
        <button
          onClick={() => more && setOpen((o) => !o)}
          className={cn("flex min-w-0 items-start gap-2 text-left", !more && "cursor-default")}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
              !more && "invisible",
            )}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{cluster.label}</span>
            <span className="block text-xs text-muted-foreground md:hidden">
              {cluster.askers} penanya · {cluster.count} pertanyaan · {timeAgo(cluster.last_asked)}
            </span>
          </span>
        </button>
        <span className="hidden text-right text-sm tabular-nums md:block">{cluster.askers}</span>
        <span className="hidden text-right text-sm tabular-nums md:block">{cluster.count}</span>
        <span className="hidden text-right text-sm text-muted-foreground md:block" title={formatDate(cluster.last_asked)}>
          {timeAgo(cluster.last_asked)}
        </span>
        <div className="row-span-2 flex justify-end md:row-span-1">
          <Button size="sm" variant="outline" onClick={onResolve} disabled={busy}>
            <Check className="size-3.5" /> Selesai
          </Button>
        </div>
      </div>
      {open && (
        <ul className="space-y-1 border-t bg-muted/40 px-4 py-3 pl-10 text-sm">
          {cluster.examples.map((e) => (
            <li key={e.id} className="flex justify-between gap-4">
              <span>{e.query}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
            </li>
          ))}
          {cluster.count > cluster.examples.length && (
            <li className="text-xs text-muted-foreground">dan {cluster.count - cluster.examples.length} lainnya</li>
          )}
        </ul>
      )}
    </li>
  );
}
