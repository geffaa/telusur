"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FileSearch, Lock, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { BrandMark, Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const DEMO_USERS = [
  { user: "hr", name: "Dewi HR", role: "Knowledge Admin", hint: "Unggah dokumen, atur akses" },
  { user: "staff", name: "Sari Staff", role: "Karyawan", hint: "Bertanya; dokumen direksi tertutup" },
  { user: "direksi", name: "Hendra Direksi", role: "Direksi", hint: "Bisa membaca dokumen remunerasi" },
  { user: "admin", name: "Rina Admin", role: "Tenant Admin", hint: "Pengguna, grup, audit log" },
];

const POINTS = [
  { icon: FileSearch, title: "Jawaban dengan sumber", text: "Setiap jawaban menunjuk halaman dokumen yang dikutip." },
  { icon: Lock, title: "Hanya yang boleh dibaca", text: "Hak akses per dokumen ikut berlaku di setiap jawaban." },
  { icon: ScrollText, title: "Tercatat dan terukur", text: "Audit log permanen dan evaluasi kualitas berangka." },
];

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = useState("nusantara");
  const [email, setEmail] = useState("hr@nusantara.test");
  const [password, setPassword] = useState("telusur123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ workspace, email, password }) });
      queryClient.removeQueries();
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-strong p-10 text-primary-foreground lg:flex">
        {/* Faint document-line pattern: texture without decoration for its own sake. */}
        <svg className="pointer-events-none absolute -top-10 -right-24 w-[380px] opacity-[0.07]" viewBox="0 0 200 200" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x="10" y={12 + i * 15} width={180 - (i % 4) * 30} height="6" rx="3" fill="currentColor" />
          ))}
        </svg>
        <div className="flex items-center gap-2.5">
          <BrandMark className="bg-primary-foreground/15 shadow-none ring-1 ring-primary-foreground/25" />
          <span className="text-lg font-semibold tracking-tight">Telusur</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">
            Jawaban dari kebijakan perusahaan, lengkap dengan halaman sumbernya.
          </h1>
          <ul className="mt-8 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/12 ring-1 ring-primary-foreground/20">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-primary-foreground/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-primary-foreground/60">Data demo fiktif · PT Nusantara Sejahtera</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Masuk</h2>
          <p className="mt-1 text-sm text-muted-foreground">Gunakan akun workspace perusahaan Anda.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="workspace">Workspace</Label>
              <Input id="workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" className="h-10 w-full" disabled={loading}>
              {loading ? "Masuk…" : "Masuk"}
            </Button>
          </form>

          <div className="mt-8">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Coba sebagai (password telusur123)</p>
            <ul className="grid gap-1.5">
              {DEMO_USERS.map((d) => {
                const value = `${d.user}@${workspace}.test`;
                return (
                  <li key={d.user}>
                    <button
                      type="button"
                      onClick={() => setEmail(value)}
                      aria-pressed={email === value}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-brand/40",
                        email === value && "border-brand bg-brand-soft/60 ring-1 ring-brand/30",
                      )}
                    >
                      <Avatar name={d.name} className="size-7 text-[11px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{d.role}</span>
                        <span className="block truncate text-xs text-muted-foreground">{d.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
