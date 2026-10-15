"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Words shared with the quote, ignoring case, punctuation and table pipes. */
function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[|*_#`>\-–—:;,.()[\]"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A text run on the page belongs to the quote when its normalized text appears in the
 * normalized quote. Short phrases can match by coincidence elsewhere on the page (a table
 * cell that repeats words from the paragraph), so only the largest contiguous block of
 * matches is kept, plus other blocks long enough not to be accidental.
 */
function matches(items: string[], quote: string) {
  const q = normalize(quote);
  const norm = items.map(normalize);
  const hit = norm.map((n) => n.length >= 4 && q.includes(n));
  // Short runs ("1", "Rp") count only next to a real match.
  norm.forEach((n, i) => {
    if (!hit[i] && n.length > 0 && n.length < 4 && q.includes(n) && (hit[i - 1] || hit[i + 1])) hit[i] = true;
  });

  // Group matches into blocks; whitespace-only items do not break a block.
  const blocks: { items: number[]; chars: number }[] = [];
  let current: { items: number[]; chars: number } | null = null;
  norm.forEach((n, i) => {
    if (hit[i]) {
      current ??= { items: [], chars: 0 };
      current.items.push(i);
      current.chars += n.length;
    } else if (n.length > 0 && current) {
      blocks.push(current);
      current = null;
    }
  });
  if (current) blocks.push(current);
  if (!blocks.length) return hit.map(() => false);

  const largest = Math.max(...blocks.map((b) => b.chars));
  const keep = new Set(blocks.filter((b) => b.chars === largest || b.chars >= 60).flatMap((b) => b.items));
  return items.map((_, i) => keep.has(i));
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Renders the cited PDF page with PDF.js and highlights the passage the answer came from.
 * PDF.js is loaded on demand so it never weighs on the rest of the app.
 */
export function PdfQuote({ url, page, quote }: { url: string; page: number; quote: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState(false);
  const { t } = useT();

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    setBoxes([]);
    setSize(null);
    setError(false);

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
      const pdfPage = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
      if (cancelled || !wrap.current || !canvas.current) return;

      const cssWidth = wrap.current.clientWidth;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: cssWidth / base.width });
      const ratio = window.devicePixelRatio || 1;
      const el = canvas.current;
      el.width = Math.floor(viewport.width * ratio);
      el.height = Math.floor(viewport.height * ratio);
      el.style.width = `${viewport.width}px`;
      el.style.height = `${viewport.height}px`;
      const render = pdfPage.render({
        canvasContext: el.getContext("2d")!,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      task = render;
      await render.promise;
      if (cancelled) return;
      setSize({ width: viewport.width, height: viewport.height });

      const content = await pdfPage.getTextContent();
      const items = content.items.filter((it): it is (typeof content.items)[number] & { str: string; transform: number[]; width: number; height: number } => "str" in it);
      const lit = matches(items.map((it) => it.str), quote);
      const found: Box[] = [];
      items.forEach((it, i) => {
        if (!lit[i] || !it.str.trim()) return;
        const [, , , d, e, f] = it.transform;
        const height = it.height || Math.abs(d);
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([e, f, e + it.width, f + height]);
        found.push({
          left: Math.min(x1, x2) - 1,
          top: Math.min(y1, y2) - 2,
          width: Math.abs(x2 - x1) + 2,
          height: Math.abs(y2 - y1) + 4,
        });
      });
      setBoxes(found);
      if (found.length) {
        const top = Math.min(...found.map((b) => b.top));
        wrap.current?.closest("[data-scroll]")?.scrollTo({
          top: (wrap.current?.offsetTop ?? 0) + top - 80,
          behavior: "smooth",
        });
      }
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException") setError(true);
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, page, quote]);

  return (
    <div ref={wrap} className="relative w-full bg-muted/40">
      {!size && !error && <Skeleton className="aspect-[1/1.41] w-full rounded-none" />}
      {error && <p className="px-4 py-6 text-sm text-muted-foreground">{t("source.pdfError")}</p>}
      <canvas ref={canvas} className={cn("block", !size && "absolute opacity-0")} aria-label={t("source.pageHighlighted", { n: page })} />
      {size &&
        boxes.map((b, i) => (
          <span
            key={i}
            className="pointer-events-none absolute rounded-[3px] bg-warning/30 mix-blend-multiply ring-1 ring-warning/50"
            style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
            aria-hidden
          />
        ))}
      {size && (
        <p className="border-t bg-card px-4 py-2 text-xs text-muted-foreground">
          {boxes.length ? t("source.pageHighlighted", { n: page }) : t("source.pageNotFound", { n: page })}
        </p>
      )}
    </div>
  );
}
