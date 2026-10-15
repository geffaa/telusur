"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Lock, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ROLE_LABEL, type AccessCheckResult, type UserItem } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AccessCheckPage() {
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api<UserItem[]>("/users") });
  const [userId, setUserId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const check = useMutation({
    mutationFn: () =>
      api<AccessCheckResult>("/access-check", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, question: question.trim() || null }),
      }),
    onError: (e) => toast.error(e.message),
  });
  const result = check.data;
  const readable = result?.documents.filter((d) => d.readable) ?? [];
  const hidden = result?.documents.filter((d) => !d.readable) ?? [];

  return (
    <>
      <PageHeader
        title="Cek akses"
        description="Lihat dokumen apa yang bisa dibaca seseorang, dan sumber apa yang akan dipakai untuk menjawab pertanyaannya. Tidak memanggil AI dan tidak mengubah apa pun."
      />
      <form
        className="mb-6 grid gap-3 surface p-4 md:grid-cols-[16rem_minmax(0,1fr)_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (userId) check.mutate();
        }}
      >
        <div className="space-y-2">
          <Label>Sebagai pengguna</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih pengguna" />
            </SelectTrigger>
            <SelectContent>
              {users?.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABEL[u.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="q">Pertanyaan (opsional)</Label>
          <Input
            id="q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="mis. Berapa gaji pokok direktur utama?"
          />
        </div>
        <Button type="submit" disabled={!userId || check.isPending}>
          <Search className="size-4" /> {check.isPending ? "Memeriksa…" : "Periksa"}
        </Button>
      </form>

      {result && (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section>
            <h2 className="text-sm font-medium">
              {result.user.name} bisa membaca {readable.length} dari {result.documents.length} dokumen
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Grup: {result.groups.length ? result.groups.join(", ") : "tidak ada"}
            </p>
            <ul className="divide-y surface text-sm">
              {[...readable, ...hidden].map((d) => (
                <li key={d.id} className={cn("flex items-center gap-3 px-3 py-2", !d.readable && "text-muted-foreground")}>
                  {d.readable ? (
                    <Check className="size-4 shrink-0 text-success" />
                  ) : (
                    <Lock className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{d.collection}</span>
                </li>
              ))}
            </ul>
          </section>
          {result.retrieval && (
            <section>
              <h2 className="text-sm font-medium">Hasil pencarian untuk pertanyaan ini</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                {result.retrieval.would_refuse
                  ? `Asisten akan menjawab "tidak menemukan" (relevansi tertinggi ${result.retrieval.top_score}, di bawah ambang).`
                  : `Asisten akan menjawab memakai sumber teratas (relevansi tertinggi ${result.retrieval.top_score}).`}
              </p>
              <ol className="divide-y surface">
                {result.retrieval.passages.map((p, i) => (
                  <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{p.score.toFixed(3)}</span>
                    <span className="min-w-0">
                      <span className="block font-medium">{p.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.heading_path} · hal. {p.page}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-muted-foreground">{p.preview}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </>
  );
}
