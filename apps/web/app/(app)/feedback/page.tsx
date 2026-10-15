"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, REASON_LABEL, type FeedbackItem } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";

type Filter = "all" | "1" | "-1";

export default function FeedbackPage() {
  const [filter, setFilter] = useState<Filter>("-1");
  const { data, isLoading } = useQuery({
    queryKey: ["feedback", filter],
    queryFn: () =>
      api<{ positive: number; negative: number; items: FeedbackItem[] }>(
        `/feedback${filter === "all" ? "" : `?rating=${filter}`}`,
      ),
  });
  const total = data ? data.positive + data.negative : 0;
  const rate = total ? Math.round((data!.positive / total) * 100) : null;

  return (
    <>
      <PageHeader
        title="Feedback jawaban"
        description="Penilaian karyawan atas jawaban asisten. Mulai dari yang tidak membantu: biasanya tanda dokumen kurang jelas atau usang."
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="segmented" role="tablist">
          {(
            [
              ["-1", "Tidak membantu", data?.negative],
              ["1", "Membantu", data?.positive],
              ["all", "Semua", total],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} <span className="tabular-nums opacity-60">{n ?? ""}</span>
            </button>
          ))}
        </div>
        {rate !== null && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">
              {rate}%
            </span>{" "}
            jawaban dinilai membantu dari {total} penilaian
          </p>
        )}
      </div>

      {isLoading && <Skeleton className="h-48 rounded-lg" />}
      {data?.items.length === 0 && (
        <p className="surface px-6 py-12 text-center text-sm text-muted-foreground">
          Belum ada feedback di kategori ini.
        </p>
      )}
      <ul className="divide-y surface empty:hidden">
        {data?.items.map((f) => (
          <li
            key={f.id}
            className="grid gap-x-6 gap-y-2 px-4 py-4 lg:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <div className="text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                {f.rating === 1 ? (
                  <ThumbsUp className="size-3.5" />
                ) : (
                  <ThumbsDown className="size-3.5 text-danger" />
                )}
                {f.rating === 1
                  ? "Membantu"
                  : f.reason
                    ? REASON_LABEL[f.reason]
                    : "Tidak membantu"}
              </p>
              <p className="text-xs text-muted-foreground">
                {f.user_name ?? "Pengguna dihapus"} ·{" "}
                <span title={formatDate(f.created_at)}>
                  {timeAgo(f.created_at)}
                </span>
              </p>
            </div>
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-medium">{f.question}</p>
              <p className="line-clamp-3 text-muted-foreground">{f.answer}</p>
              {f.rating === -1 && <ToCase feedbackId={f.id} />}
              {f.comment && (
                <p className="border-l-2 border-brand/40 pl-3">
                  <span className="text-xs text-muted-foreground">
                    Komentar:{" "}
                  </span>
                  {f.comment}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ToCase({ feedbackId }: { feedbackId: string }) {
  const router = useRouter();
  const create = useMutation({
    mutationFn: () =>
      api(`/eval/cases/from-feedback/${feedbackId}`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Kasus uji dibuat", {
        description: "Pilih dokumen sumbernya lalu verifikasi.",
      });
      router.push("/evaluation?tab=cases");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="float-right ml-3"
      onClick={() => create.mutate()}
      disabled={create.isPending}
    >
      <FlaskConical className="size-3.5" /> Jadikan kasus uji
    </Button>
  );
}
