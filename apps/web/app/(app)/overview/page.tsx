"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, RotateCw, Upload } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { api, canManage, type Overview, type RecentDocument } from "@/lib/api";
import { formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api<Overview>("/overview"),
    refetchInterval: (q) =>
      (q.state.data?.documents.processing ?? 0) > 0 ? 2000 : false,
  });
  const admin = canManage(me?.role);
  const total = data
    ? data.documents.ready + data.documents.processing + data.documents.failed
    : 0;

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description="Kondisi basis pengetahuan workspace ini."
        actions={
          admin && (
            <Button asChild variant="outline">
              <Link href="/collections">
                <Upload className="size-4" /> Upload dokumen
              </Link>
            </Button>
          )
        }
      />

      <section className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
        <Metric
          label="Dokumen siap dijawab"
          value={data?.documents.ready}
          hint={data && `dari ${total} dokumen`}
        />
        <Metric
          label="Sedang diproses"
          value={data?.documents.processing}
          hint={
            data?.documents.processing
              ? "diperbarui otomatis"
              : "antrean kosong"
          }
        />
        <Metric
          label="Gagal diproses"
          value={data?.documents.failed}
          tone={data?.documents.failed ? "bad" : undefined}
          hint={data?.documents.failed ? "lihat di bawah" : "tidak ada masalah"}
        />
        <Metric
          label="Potongan terindeks"
          value={data?.chunks}
          hint={data && `${data.collections} collection`}
        />
      </section>

      <h2 className="mb-3 text-sm font-medium">Pemakaian 7 hari terakhir</h2>
      <section className="mb-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
        <Metric
          label="Pertanyaan dijawab"
          value={data && data.questions_7d - data.refused_7d}
          hint={data && `${data.questions_7d} pertanyaan masuk`}
        />
        <LinkMetric href="/gaps">
          <Metric
            label="Tidak terjawab"
            value={data?.refused_7d}
            hint={data && `${data.open_gaps} menunggu tindak lanjut →`}
            tone={data?.open_gaps ? "bad" : undefined}
          />
        </LinkMetric>
        <LinkMetric href="/feedback">
          <Metric
            label="Dinilai membantu"
            value={
              data &&
              (data.feedback_positive + data.feedback_negative
                ? Math.round(
                    (data.feedback_positive /
                      (data.feedback_positive + data.feedback_negative)) *
                      100,
                  )
                : 0)
            }
            suffix="%"
            hint={data && `${data.feedback_negative} penilaian negatif →`}
          />
        </LinkMetric>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <h2 className="mb-3 text-sm font-medium">Aktivitas terbaru</h2>
          <div className="rounded-lg border">
            {isLoading && <Rows />}
            {data?.recent.length === 0 && (
              <Empty admin={admin} text="Belum ada dokumen di workspace ini." />
            )}
            <ul className="divide-y">
              {data?.recent.map((d) => (
                <DocRow key={d.id} doc={d} />
              ))}
            </ul>
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium">Perlu perhatian</h2>
          <div className="rounded-lg border">
            {isLoading && <Rows />}
            {data && data.attention.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Semua dokumen sudah diproses.
              </p>
            )}
            <ul className="divide-y">
              {data?.attention.map((d) => (
                <AttentionRow key={d.id} doc={d} admin={admin} />
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

function LinkMetric({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block bg-background hover:bg-muted/40 [&>div]:bg-transparent"
    >
      {children}
    </Link>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
  suffix,
}: {
  label: string;
  value?: number;
  hint?: React.ReactNode;
  tone?: "bad";
  suffix?: string;
}) {
  return (
    <div className="bg-background px-4 py-4 md:px-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "bad" && "text-red-600",
          )}
        >
          {formatNumber(value)}
          {suffix}
        </p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">{hint ?? " "}</p>
    </div>
  );
}

function DocRow({ doc }: { doc: RecentDocument }) {
  return (
    <li>
      <Link
        href={`/documents/${doc.id}`}
        className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-muted/50 sm:grid-cols-[1fr_auto_7rem]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {doc.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {doc.collection_name}
          </span>
        </span>
        <StatusBadge status={doc.status} />
        <span className="hidden text-right text-xs text-muted-foreground sm:block">
          {timeAgo(doc.updated_at)}
        </span>
      </Link>
    </li>
  );
}

function AttentionRow({ doc, admin }: { doc: RecentDocument; admin: boolean }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api(`/documents/${doc.id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success(`${doc.title} diantrekan ulang`);
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {doc.status === "failed" ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
      ) : (
        <span className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={`/documents/${doc.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {doc.title}
        </Link>
        <p
          className={cn(
            "line-clamp-2 text-xs",
            doc.status === "failed" ? "text-red-700" : "text-muted-foreground",
          )}
        >
          {doc.status === "failed" ? (
            doc.error
          ) : (
            <StatusBadge status={doc.status} />
          )}
        </p>
      </div>
      {admin && doc.status === "failed" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
        >
          <RotateCw className="size-3.5" /> Coba lagi
        </Button>
      )}
    </li>
  );
}

function Rows() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-8" />
      ))}
    </div>
  );
}

function Empty({ admin, text }: { admin: boolean; text: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
      <p>{text}</p>
      {admin && (
        <Button asChild size="sm" className="mt-3">
          <Link href="/collections">Upload dokumen pertama</Link>
        </Button>
      )}
    </div>
  );
}
