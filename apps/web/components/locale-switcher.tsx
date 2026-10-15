"use client";

import { LOCALES, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useT();
  return (
    <div className={cn("segmented text-xs", className)} role="radiogroup" aria-label={t("common.language")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          onClick={() => setLocale(l)}
          className="px-2! py-0.5! font-medium"
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
