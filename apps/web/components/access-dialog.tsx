"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Access, type Group } from "@/lib/api";

type Mode = "inherit" | "everyone" | "groups";

/** Summary used on buttons: "Semua karyawan", "HR, Manager", "Hanya admin". */
export function accessSummary(access: Access | undefined, groups: Group[] | undefined) {
  if (!access) return "…";
  if (access.everyone) return "Semua karyawan";
  const names = access.group_ids.map((id) => groups?.find((g) => g.id === id)?.name).filter(Boolean);
  return names.length ? names.join(", ") : "Hanya admin";
}

export function AccessDialog({ path, kind, name }: { path: string; kind: "collection" | "document"; name: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: access } = useQuery({ queryKey: ["access", path], queryFn: () => api<Access>(path) });
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: () => api<Group[]>("/groups") });

  const [mode, setMode] = useState<Mode>("everyone");
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (!access || !open) return;
    setMode(access.inherit ? "inherit" : access.everyone ? "everyone" : "groups");
    setSelected(access.group_ids);
  }, [access, open]);

  const save = useMutation({
    mutationFn: () =>
      api<Access>(path, {
        method: "PUT",
        body: JSON.stringify({
          inherit: mode === "inherit",
          everyone: mode === "everyone",
          group_ids: mode === "groups" ? selected : [],
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["access", path], data);
      setOpen(false);
      toast.success("Akses diperbarui", { description: "Berlaku untuk pertanyaan berikutnya." });
    },
    onError: (e) => toast.error(e.message),
  });

  const restricted = access && !access.everyone;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {restricted ? <Lock className="size-4" /> : <Users className="size-4" />}
          <span className="max-w-48 truncate">{accessSummary(access, groups)}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Siapa yang bisa membaca</DialogTitle>
          <DialogDescription>
            {kind === "collection"
              ? `Berlaku untuk semua dokumen di "${name}", kecuali dokumen yang punya pengaturan sendiri.`
              : `Mengatur akses "${name}" saja.`}{" "}
            Admin selalu bisa mengelola, tetapi jawaban chat tetap mengikuti aturan ini.
          </DialogDescription>
        </DialogHeader>
        {!access || !groups ? (
          <Skeleton className="h-32" />
        ) : (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
            {kind === "document" && (
              <Option value="inherit" label="Ikuti collection" hint="Akses sama dengan collection-nya." />
            )}
            <Option value="everyone" label="Semua karyawan" hint="Setiap akun di workspace ini." />
            <Option value="groups" label="Grup tertentu" hint="Hanya anggota grup yang dipilih." />
            {mode === "groups" && (
              <div className="ml-7 space-y-2 rounded-md border p-3">
                {groups.map((g) => (
                  <Label key={g.id} className="flex items-center gap-2 font-normal">
                    <Checkbox
                      checked={selected.includes(g.id)}
                      onCheckedChange={(on) =>
                        setSelected((s) => (on ? [...s, g.id] : s.filter((id) => id !== g.id)))
                      }
                    />
                    <span className="flex-1">{g.name}</span>
                    <span className="text-xs text-muted-foreground">{g.member_count} orang</span>
                  </Label>
                ))}
                {selected.length === 0 && (
                  <p className="text-xs text-muted-foreground">Tanpa grup, hanya admin yang bisa melihat.</p>
                )}
              </div>
            )}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !access}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Option({ value, label, hint }: { value: Mode; label: string; hint: string }) {
  return (
    <Label className="flex items-start gap-3 font-normal">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </Label>
  );
}
