"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Source } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Assistant answer as Markdown, with [n] markers turned into clickable source chips. */
export function Answer({
  content,
  sources,
  activeMarker,
  onCite,
}: {
  content: string;
  sources: Source[];
  activeMarker?: number | null;
  onCite: (marker: number) => void;
}) {
  const linked = content.replace(/\[(\d+)\]/g, (_, n) => `[${n}](#cite-${n})`);
  return (
    <div className="prose-answer text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            const marker = href?.startsWith("#cite-") ? Number(href.slice(6)) : null;
            if (marker === null) {
              return (
                <a href={href} target="_blank" rel="noreferrer" className="underline">
                  {children}
                </a>
              );
            }
            const source = sources.find((s) => s.marker === marker);
            return (
              <button
                type="button"
                onClick={() => onCite(marker)}
                title={source ? `${source.title} · hal. ${source.page_start}` : undefined}
                className={cn(
                  "mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded border px-1 align-middle font-mono text-[11px] leading-none text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  activeMarker === marker && "border-foreground bg-foreground text-background hover:text-background",
                )}
              >
                {marker}
              </button>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-md border">
                <table className="w-full text-sm">{children}</table>
              </div>
            );
          },
          th: ({ children }) => <th className="border-b bg-muted/50 px-3 py-1.5 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b px-3 py-1.5 tabular-nums">{children}</td>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
          h2: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
          h3: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}
