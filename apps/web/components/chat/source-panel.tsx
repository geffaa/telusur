"use client";

import { ExternalLink, FileText, Lock, X } from "lucide-react";
import { Answer } from "@/components/chat/answer";
import { PdfQuote } from "@/components/chat/pdf-quote";
import { Button } from "@/components/ui/button";
import { API_URL, type Source } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

function pages(s: Source, t: ReturnType<typeof useT>["t"]) {
  return s.page_start === s.page_end
    ? t("common.page", { n: s.page_start })
    : t("common.pages", { from: s.page_start, to: s.page_end });
}

export function SourcePanel({
  sources,
  active,
  onSelect,
  onClose,
}: {
  sources: Source[];
  active: number;
  onSelect: (marker: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const source = sources.find((s) => s.marker === active) ?? sources[0];
  if (!source) return null;
  const isPdf = source.mime === "application/pdf";
  const fileUrl = `${API_URL}/documents/${source.document_id}/file?version=${source.version}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="text-sm font-medium">{t("source.title")}</p>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("source.close")}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b px-3 py-2">
        {sources.map((s) => (
          <button
            key={s.marker}
            onClick={() => onSelect(s.marker)}
            className={cn(
              "shrink-0 rounded px-2 py-1 font-mono text-xs",
              s.marker === source.marker ? "bg-brand text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              s.cited === false && s.marker !== source.marker && "opacity-50",
            )}
            title={s.title}
          >
            {s.marker}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-scroll>
        <div className="space-y-3 px-4 py-4">
          {source.available === false ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" /> {t("source.revoked")}
            </p>
          ) : (
            <>
              <div>
                <p className="flex items-start gap-2 font-medium">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {source.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.heading_path && <>{source.heading_path} · </>}
                  {pages(source, t)} · {t("common.version", { n: source.version })}
                </p>
                {source.cited === false && (
                  <p className="mt-1 text-xs text-muted-foreground">{t("source.notCited")}</p>
                )}
              </div>
              <blockquote className="border-l-2 border-brand/40 pl-3 text-[13px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                {/* Quotes can be Markdown tables; render them the same way answers are. */}
                <Answer content={source.quote ?? ""} sources={[]} onCite={() => {}} />
              </blockquote>
              <Button variant="outline" size="sm" asChild>
                <a href={isPdf ? `${fileUrl}#page=${source.page_start}` : fileUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" /> {isPdf ? t("source.openPage", { pages: pages(source, t) }) : t("source.openDocument")}
                </a>
              </Button>
            </>
          )}
        </div>
        {isPdf && source.available !== false && source.quote && (
          <div className="border-t">
            <PdfQuote url={fileUrl} page={source.page_start} quote={source.quote} />
          </div>
        )}
      </div>
    </div>
  );
}
