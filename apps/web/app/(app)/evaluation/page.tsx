"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Play, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  api,
  MODE_LABEL,
  type DocumentItem,
  type EvalCaseItem,
  type EvalMetrics,
  type EvalResultItem,
  type EvalRunItem,
  type RetrievalMode,
} from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Column = {
  key: keyof EvalMetrics;
  label: string;
  hint: string;
  lowerIsBetter?: boolean;
  ms?: boolean;
};

const COLUMNS: Column[] = [
  {
    key: "recall_at_1",
    label: "Recall@1",
    hint: "Sumber yang benar ada di peringkat pertama",
  },
  {
    key: "recall_at_5",
    label: "Recall@5",
    hint: "Sumber yang benar ada di 5 teratas",
  },
  { key: "mrr", label: "MRR", hint: "Rata-rata 1/peringkat sumber yang benar" },
  {
    key: "refusal_accuracy",
    label: "Tolak benar",
    hint: "Pertanyaan tanpa jawaban/terlarang yang ditolak",
  },
  {
    key: "false_refusal_rate",
    label: "Tolak keliru",
    hint: "Pertanyaan yang bisa dijawab tetapi ditolak",
    lowerIsBetter: true,
  },
  {
    key: "faithfulness",
    label: "Faithfulness",
    hint: "Klaim jawaban didukung sumber (dinilai juri LLM)",
  },
  {
    key: "correctness",
    label: "Correctness",
    hint: "Jawaban sesuai jawaban acuan (dinilai juri LLM)",
  },
  {
    key: "retrieval_ms_p50",
    label: "Latensi p50",
    hint: "Median waktu pencarian",
    lowerIsBetter: true,
    ms: true,
  },
];

const KIND_LABEL = {
  answerable: "Bisa dijawab",
  unanswerable: "Tanpa jawaban",
  restricted: "Terlarang",
};

function fmt(col: Column, v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return col.ms ? `${Math.round(v)} ms` : v.toFixed(2);
}

export default function EvaluationPage() {
  return (
    <Suspense>
      <Evaluation />
    </Suspense>
  );
}

function Evaluation() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"results" | "cases">(
    params.get("tab") === "cases" ? "cases" : "results",
  );
  const [starting, setStarting] = useState(false);
  const { data: runs } = useQuery({
    queryKey: ["eval-runs"],
    queryFn: () => api<EvalRunItem[]>("/eval/runs"),
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === "queued" || r.status === "running")
        ? 2000
        : false,
  });
  const active = runs?.find(
    (r) => r.status === "queued" || r.status === "running",
  );
  // Latest finished run per configuration, in a stable order.
  const latest = useMemo(() => {
    const byName = new Map<string, EvalRunItem>();
    runs
      ?.filter((r) => r.status === "done")
      .forEach((r) => !byName.has(r.name) && byName.set(r.name, r));
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [runs]);

  return (
    <>
      <PageHeader
        title="Evaluasi kualitas"
        description="Mengukur apakah asisten menemukan sumber yang benar, menolak saat seharusnya, dan menjawab sesuai dokumen."
        actions={
          <Button onClick={() => setStarting(true)} disabled={!!active}>
            <Play className="size-4" /> Jalankan evaluasi
          </Button>
        }
      />

      {active && (
        <div className="mb-6 surface px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>
              Menjalankan <span className="font-medium">{active.name}</span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {active.progress}/{active.case_count || "…"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{
                width: `${active.case_count ? (active.progress / active.case_count) * 100 : 2}%`,
              }}
            />
          </div>
          {active.config.answers && (
            <p className="mt-2 text-xs text-muted-foreground">
              Evaluasi jawaban mengikuti batas token per menit layanan AI
              gratis, jadi berjalan perlahan.
            </p>
          )}
        </div>
      )}

      <ComparisonTable runs={latest} />

      <div
        className="segmented mt-8 mb-3"
        role="tablist"
      >
        {(
          [
            ["results", "Hasil per pertanyaan"],
            ["cases", "Kasus uji"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "results" ? (
        <Results runs={runs?.filter((r) => r.status === "done") ?? []} />
      ) : (
        <Cases />
      )}

      <StartDialog open={starting} onClose={() => setStarting(false)} />
    </>
  );
}

function ComparisonTable({ runs }: { runs: EvalRunItem[] }) {
  if (!runs.length) {
    return (
      <p className="surface px-6 py-10 text-center text-sm text-muted-foreground">
        Belum ada hasil. Jalankan evaluasi untuk melihat angka.
      </p>
    );
  }
  const best = (col: Column) => {
    const values = runs
      .map((r) => r.metrics[col.key])
      .filter((v): v is number => typeof v === "number");
    // Refusal metrics only mean something with the reranker; latency is shown, not ranked.
    if (!values.length || col.ms) return null;
    return col.lowerIsBetter ? Math.min(...values) : Math.max(...values);
  };
  const reference = runs.find(
    (r) => r.config.mode === "hybrid_rerank",
  )?.metrics;
  return (
    <section>
      <div className="overflow-x-auto surface">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Konfigurasi</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-right font-medium whitespace-nowrap"
                  title={c.hint}
                >
                  {c.label}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Dijalankan</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="font-medium">
                    {MODE_LABEL[r.config.mode]}
                  </span>
                  {r.config.answers && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      + jawaban
                    </span>
                  )}
                  {r.config.translate === false && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      tanpa terjemahan
                    </span>
                  )}
                  {r.config.rerank_candidates !== undefined && r.config.rerank_candidates !== 20 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">rerank {r.config.rerank_candidates}</span>
                  )}
                </td>
                {COLUMNS.map((c) => {
                  const v = r.metrics[c.key] as number | undefined;
                  const refusal =
                    c.key === "refusal_accuracy" ||
                    c.key === "false_refusal_rate";
                  const meaningful =
                    !refusal || r.config.mode === "hybrid_rerank";
                  const isBest = meaningful && v !== undefined && v === best(c);
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        isBest && "font-semibold",
                        !meaningful && "text-muted-foreground/50",
                      )}
                    >
                      {meaningful ? fmt(c, v) : "n/a"}
                    </td>
                  );
                })}
                <td
                  className="px-4 py-2.5 text-right text-xs whitespace-nowrap text-muted-foreground"
                  title={formatDate(r.created_at)}
                >
                  {timeAgo(r.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tebal = terbaik di kolomnya. Penolakan hanya berlaku untuk konfigurasi
        dengan reranker (skor lain tidak sebanding dengan ambang).
        {reference?.suggested_threshold != null &&
          ` Ambang saat ini ${reference.threshold}; ambang yang disarankan dari data ini ${reference.suggested_threshold}.`}
      </p>
    </section>
  );
}

function rankLabel(r: EvalResultItem) {
  if (r.kind !== "answerable")
    return r.refused ? "Ditolak ✓" : "Tidak ditolak ✗";
  if (r.refused) return "Ditolak ✗";
  return r.hit_rank
    ? `#${r.hit_rank}`
    : r.doc_hit_rank
      ? `dok #${r.doc_hit_rank}`
      : "tidak ketemu";
}

function failed(r: EvalResultItem) {
  if (r.kind !== "answerable") return !r.refused;
  return (
    r.refused ||
    r.hit_rank !== 1 ||
    (r.correctness !== null && r.correctness < 1)
  );
}

function Results({ runs }: { runs: EvalRunItem[] }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string>("none");
  const [onlyFailed, setOnlyFailed] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const current = runId ?? runs[0]?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["eval-results", current],
    queryFn: () => api<EvalResultItem[]>(`/eval/runs/${current}/results`),
    enabled: !!current,
  });
  const { data: base } = useQuery({
    queryKey: ["eval-results", baseId],
    queryFn: () => api<EvalResultItem[]>(`/eval/runs/${baseId}/results`),
    enabled: baseId !== "none",
  });
  const baseBy = new Map(base?.map((r) => [r.case_id, r]));
  const changed = (r: EvalResultItem) => {
    const b = baseBy.get(r.case_id);
    return b && (failed(b) !== failed(r) || b.hit_rank !== r.hit_rank);
  };
  const rows = data?.filter((r) =>
    baseId !== "none" ? changed(r) : !onlyFailed || failed(r),
  );
  const runLabel = (r: EvalRunItem) => `${r.name} · ${timeAgo(r.created_at)}`;

  if (!runs.length) return null;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select value={current} onValueChange={setRunId}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {runs.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {runLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={baseId} onValueChange={setBaseId}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Tanpa pembanding</SelectItem>
            {runs
              .filter((r) => r.id !== current)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  Bandingkan dengan {runLabel(r)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {baseId === "none" && (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={onlyFailed}
              onCheckedChange={(v) => setOnlyFailed(!!v)}
            />{" "}
            Hanya yang gagal
          </Label>
        )}
        <span className="text-sm text-muted-foreground">
          {rows?.length ?? 0} pertanyaan
        </span>
      </div>

      {isLoading && <Skeleton className="h-40 rounded-lg" />}
      <div className="overflow-x-auto surface">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2 font-medium">Pertanyaan</th>
              <th className="px-3 py-2 font-medium">Jenis</th>
              {baseId !== "none" && (
                <th className="px-3 py-2 text-right font-medium">Sebelumnya</th>
              )}
              <th className="px-3 py-2 text-right font-medium">Hasil</th>
              <th className="px-3 py-2 text-right font-medium">Skor</th>
              <th className="px-3 py-2 text-right font-medium">Benar</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows?.map((r) => {
              const b = baseBy.get(r.case_id);
              const expanded = open === r.case_id;
              return (
                <Fragment key={r.case_id}>
                  <tr
                    className="cursor-pointer hover:bg-brand-soft/40"
                    onClick={() => setOpen(expanded ? null : r.case_id)}
                  >
                    <td className="max-w-xl px-4 py-2">{r.question}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                      {KIND_LABEL[r.kind]}
                    </td>
                    {baseId !== "none" && (
                      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                        {b && rankLabel(b)}
                      </td>
                    )}
                    <td
                      className={cn(
                        "px-3 py-2 text-right whitespace-nowrap",
                        failed(r) && "text-danger",
                      )}
                    >
                      {rankLabel(r)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.top_score.toFixed(3)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.correctness === null ? "—" : r.correctness.toFixed(1)}
                    </td>
                    <td className="pr-3">
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-muted/40">
                      <td colSpan={7} className="px-4 py-3">
                        <ResultDetail r={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows?.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {baseId !== "none"
                    ? "Tidak ada perubahan dibanding run pembanding."
                    : "Semua pertanyaan lolos."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultDetail({ r }: { r: EvalResultItem }) {
  return (
    <div className="grid gap-4 text-xs lg:grid-cols-2">
      <div className="space-y-2">
        <p>
          <span className="text-muted-foreground">
            Sumber yang diharapkan:{" "}
          </span>
          {r.expected_document_title ??
            (r.kind === "unanswerable" ? "tidak ada (harus ditolak)" : "—")}
          {r.expected_heading && (
            <span className="text-muted-foreground">
              {" "}
              › {r.expected_heading.split(" > ").at(-1)}
            </span>
          )}
        </p>
        {r.expected_answer && (
          <p>
            <span className="text-muted-foreground">Jawaban acuan: </span>
            {r.expected_answer}
          </p>
        )}
        {r.answer && (
          <p className="whitespace-pre-wrap">
            <span className="text-muted-foreground">Jawaban asisten: </span>
            {r.answer}
          </p>
        )}
        {r.judge_notes && (
          <p>
            <span className="text-muted-foreground">Catatan juri: </span>
            {r.judge_notes}
            {r.faithfulness !== null &&
              ` (faithfulness ${r.faithfulness.toFixed(1)})`}
          </p>
        )}
      </div>
      <ol className="space-y-1">
        {r.retrieved.map((p, i) => (
          <li
            key={i}
            className="grid grid-cols-[2rem_3.5rem_minmax(0,1fr)] gap-2"
          >
            <span className="text-muted-foreground">#{i + 1}</span>
            <span className="font-mono tabular-nums">{p.score.toFixed(3)}</span>
            <span className="truncate" title={p.heading_path}>
              {p.title}{" "}
              <span className="text-muted-foreground">
                › {p.heading_path.split(" > ").at(-1)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Cases() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["eval-cases"],
    queryFn: () => api<EvalCaseItem[]>("/eval/cases"),
  });
  const { data: docs } = useQuery({
    queryKey: ["all-documents"],
    queryFn: async () => {
      const cols = await api<{ id: string }[]>("/collections");
      const lists = await Promise.all(
        cols.map((c) => api<DocumentItem[]>(`/collections/${c.id}/documents`)),
      );
      return lists.flat().sort((a, b) => a.title.localeCompare(b.title));
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api<EvalCaseItem>(`/eval/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (updated) =>
      queryClient.setQueryData<EvalCaseItem[]>(["eval-cases"], (old) =>
        old?.map((c) => (c.id === updated.id ? updated : c)),
      ),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/eval/cases/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) =>
      queryClient.setQueryData<EvalCaseItem[]>(["eval-cases"], (old) =>
        old?.filter((c) => c.id !== id),
      ),
  });
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const verified = data?.filter((c) => c.verified).length ?? 0;
  const rows = data?.filter((c) => filter === "all" || !c.verified);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="segmented" role="tablist">
          {(
            [
              ["todo", "Perlu ditinjau", (data?.length ?? 0) - verified],
              ["all", "Semua", data?.length ?? 0],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} <span className="tabular-nums opacity-60">{n}</span>
            </button>
          ))}
        </div>
        <span className="text-muted-foreground">
          {verified} dari {data?.length ?? 0} sudah diverifikasi. Kasus dibuat
          otomatis dari dokumen; periksa sebelum memercayai angkanya.
        </span>
      </div>
      {isLoading && <Skeleton className="h-40 rounded-lg" />}
      <ul className="divide-y surface empty:hidden">
        {rows?.map((c) => (
          <li
            key={c.id}
            className="grid gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_18rem_auto]"
          >
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">{c.question}</p>
              {c.expected_answer && (
                <p className="text-muted-foreground">{c.expected_answer}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {KIND_LABEL[c.kind]} · ditanya sebagai {c.ask_as}
                {c.source === "feedback" && " · dari feedback"}
              </p>
            </div>
            <div className="text-xs">
              {c.kind === "answerable" ? (
                <Select
                  value={c.expected_document_id ?? undefined}
                  onValueChange={(v) =>
                    patch.mutate({
                      id: c.id,
                      body: { expected_document_id: v },
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Pilih dokumen sumber" />
                  </SelectTrigger>
                  <SelectContent>
                    {docs?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-muted-foreground">
                  {c.kind === "restricted"
                    ? `Harus ditolak (${c.expected_document_title})`
                    : "Harus ditolak"}
                </p>
              )}
              {c.expected_heading && (
                <p
                  className="mt-1 truncate text-muted-foreground"
                  title={c.expected_heading}
                >
                  › {c.expected_heading.split(" > ").at(-1)}
                </p>
              )}
            </div>
            <div className="flex items-start gap-1">
              <Button
                size="sm"
                variant={c.verified ? "secondary" : "outline"}
                onClick={() =>
                  patch.mutate({ id: c.id, body: { verified: !c.verified } })
                }
                disabled={c.kind === "answerable" && !c.expected_document_id}
              >
                <Check className="size-3.5" />{" "}
                {c.verified ? "Terverifikasi" : "Verifikasi"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground"
                onClick={() => remove.mutate(c.id)}
                aria-label="Hapus kasus uji"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StartDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<RetrievalMode>("hybrid_rerank");
  const [answers, setAnswers] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const start = useMutation({
    mutationFn: () =>
      api("/eval/runs", {
        method: "POST",
        body: JSON.stringify({
          mode,
          answers: answers && mode === "hybrid_rerank",
          verified_only: verifiedOnly,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eval-runs"] });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jalankan evaluasi</DialogTitle>
          <DialogDescription>
            Hasilnya muncul di tabel perbandingan begitu selesai.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Metode pencarian</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as RetrievalMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as RetrievalMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABEL[m]}
                    {m === "hybrid_rerank" && " (produksi)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Label className="flex items-start gap-2 font-normal">
            <Checkbox
              checked={answers && mode === "hybrid_rerank"}
              disabled={mode !== "hybrid_rerank"}
              onCheckedChange={(v) => setAnswers(!!v)}
              className="mt-0.5"
            />
            <span>
              Nilai juga kualitas jawaban
              <span className="block text-xs text-muted-foreground">
                Memanggil AI untuk menjawab dan menilai setiap pertanyaan.
                Sekitar 20–30 menit di layanan gratis.
              </span>
            </span>
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={verifiedOnly}
              onCheckedChange={(v) => setVerifiedOnly(!!v)}
            />{" "}
            Hanya kasus terverifikasi
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            <Play className="size-4" /> Mulai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
