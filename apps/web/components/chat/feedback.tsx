"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, REASON_LABEL, type FeedbackReason } from "@/lib/api";
import { cn } from "@/lib/utils";

export function FeedbackButtons({
  messageId,
  conversationId,
  rating,
}: {
  messageId: string;
  conversationId: string;
  rating?: 1 | -1;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState("");

  async function send(value: 1 | -1, why?: FeedbackReason | null, note?: string) {
    try {
      await api(`/messages/${messageId}/feedback`, {
        method: "PUT",
        body: JSON.stringify({ rating: value, reason: why ?? null, comment: note || null }),
      });
      queryClient.setQueryData<Record<string, number>>(["my-feedback", conversationId], (old) => ({
        ...old,
        [messageId]: value,
      }));
      if (value === -1) toast.success("Terima kasih, masukan diteruskan ke admin pengetahuan.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        <button
          onClick={() => {
            setAsking(false);
            send(1);
          }}
          className={cn("rounded p-1.5 hover:bg-muted hover:text-foreground", rating === 1 && "text-foreground")}
          aria-label="Jawaban membantu"
          aria-pressed={rating === 1}
        >
          <ThumbsUp className={cn("size-3.5", rating === 1 && "fill-current")} />
        </button>
        <button
          onClick={() => setAsking((a) => !a)}
          className={cn("rounded p-1.5 hover:bg-muted hover:text-foreground", rating === -1 && "text-foreground")}
          aria-label="Jawaban tidak membantu"
          aria-pressed={rating === -1}
        >
          <ThumbsDown className={cn("size-3.5", rating === -1 && "fill-current")} />
        </button>
      </div>
      {asking && (
        <form
          className="mt-1 max-w-lg space-y-2 surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(-1, reason, comment);
            setAsking(false);
          }}
        >
          <p className="text-sm">Apa yang kurang?</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(REASON_LABEL) as FeedbackReason[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  reason === r ? "border-brand bg-brand text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Jawaban yang benar seharusnya… (opsional)"
            className="w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Batal
            </Button>
            <Button type="submit" size="sm" aria-label="Kirim feedback">
              Kirim
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
