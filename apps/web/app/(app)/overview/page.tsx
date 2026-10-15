"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  FileCheck2,
  FileWarning,
  FolderOpen,
  HelpCircle,
  Loader,
  MessagesSquare,
  RotateCw,
  ThumbsUp,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Metric } from "@/components/metric";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { api, canManage, type Overview, type RecentDocument } from "@/lib/api";
import { formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { docErrorText, useT } from "@/lib/i18n";

export default function OverviewPage() {
  const { data: me } = useMe();
  const { t } = useT();
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
        title={t("overview.title")}
        description={t("overview.subtitle")}
        actions={
          admin && (
            <Button asChild variant="outline">
              <Link href="/collections">
                <Upload className="size-4" /> {t("overview.upload")}
              </Link>
            </Button>
          )
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          icon={FileCheck2}
          tone="success"
          label={t("overview.ready")}
          value={data?.documents.ready}
          hint={data && t("overview.readyHint", { total, chunks: formatNumber(data.chunks) })}
        />
        <Metric
          icon={Loader}
          tone="info"
          label={t("overview.processing")}
          value={data?.documents.processing}
          hint={data?.documents.processing ? t("overview.processingHint") : t("overview.queueEmpty")}
        />
        <Metric
          icon={FileWarning}
          tone={data?.documents.failed ? "danger" : "neutral"}
          label={t("overview.failed")}
          value={data?.documents.failed}
          hint={data?.documents.failed ? t("overview.failedHint") : t("overview.noProblems")}
        />
        <Metric
          icon={FolderOpen}
          tone="brand"
          label={t("overview.collections")}
          value={data?.collections}
          href="/collections"
          hint={t("overview.collectionsHint")}
        />
      </section>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{t("overview.usage")}</h2>
      </div>
      <section className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric
          icon={MessagesSquare}
          tone="brand"
          label={t("overview.answered")}
          value={data && data.questions_7d - data.refused_7d}
          hint={data && t("overview.answeredHint", { n: data.questions_7d })}
        />
        <Metric
          icon={HelpCircle}
          tone={data?.open_gaps ? "warning" : "neutral"}
          label={t("overview.unanswered")}
          value={data?.refused_7d}
          hint={data && t("overview.unansweredHint", { n: data.open_gaps })}
          href="/gaps"
        />
        <Metric
          icon={ThumbsUp}
          tone="success"
          label={t("overview.helpful")}
          value={
            data &&
            (data.feedback_positive + data.feedback_negative
              ? Math.round(
                  (data.feedback_positive / (data.feedback_positive + data.feedback_negative)) * 100,
                )
              : 0)
          }
          suffix="%"
          hint={data && t("overview.helpfulHint", { n: data.feedback_positive + data.feedback_negative })}
          href="/feedback"
        />
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("overview.recent")}</h2>
          <div className="surface">
            {isLoading && <Rows />}
            {data?.recent.length === 0 && (
              <Empty admin={admin} text={t("overview.empty")} />
            )}
            <ul className="divide-y">
              {data?.recent.map((d) => (
                <DocRow key={d.id} doc={d} />
              ))}
            </ul>
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("overview.attention")}</h2>
          <div className="surface">
            {isLoading && <Rows />}
            {data && data.attention.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("overview.allProcessed")}
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

function DocRow({ doc }: { doc: RecentDocument }) {
  return (
    <li>
      <Link
        href={`/documents/${doc.id}`}
        className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-brand-soft/40 sm:grid-cols-[1fr_auto_7rem]"
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
  const { t } = useT();
  const retry = useMutation({
    mutationFn: () => api(`/documents/${doc.id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("overview.requeued", { title: doc.title }));
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {doc.status === "failed" ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
      ) : (
        <span className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-info" />
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
            doc.status === "failed" ? "text-danger" : "text-muted-foreground",
          )}
        >
          {doc.status === "failed" ? (
            docErrorText(doc.error, t)
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
          <RotateCw className="size-3.5" /> {t("common.retry")}
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
  const { t } = useT();
  return (
    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
      <p>{text}</p>
      {admin && (
        <Button asChild size="sm" className="mt-3">
          <Link href="/collections">{t("overview.uploadFirst")}</Link>
        </Button>
      )}
    </div>
  );
}
