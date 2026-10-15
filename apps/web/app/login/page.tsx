"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

const DEMO_USERS = [
  ["hr", "Knowledge Admin (HR)"],
  ["manager", "Manager"],
  ["staff", "Staff"],
  ["direksi", "Direksi"],
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
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Telusur</CardTitle>
          <CardDescription>Asisten pengetahuan internal perusahaan Anda</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace">Workspace</Label>
              <Input id="workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Masuk..." : "Masuk"}
            </Button>
          </form>
          <div className="mt-6 space-y-2 border-t pt-4 text-xs text-muted-foreground">
            <p>Akun demo (password telusur123):</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_USERS.map(([user, label]) => (
                <button
                  key={user}
                  type="button"
                  className="rounded border px-2 py-1 hover:bg-accent"
                  onClick={() => setEmail(`${user}@${workspace}.test`)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
