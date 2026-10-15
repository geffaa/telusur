"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import { api, canManage, type Collection, type CollectionHealth } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export default function CollectionsPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api<Collection[]>("/collections"),
  });
  const { data: health } = useQuery({
    queryKey: ["collections-health"],
    queryFn: () => api<CollectionHealth[]>("/collections-health"),
  });
  const byId = new Map(health?.map((h) => [h.collection_id, h]));

  return (
    <>
      <PageHeader
        title="Collections"
        description="Dokumen dikelompokkan per collection. Hak akses nantinya diatur di level ini."
        actions={canManage(me?.role) && <CreateCollectionDialog />}
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[45%]">Nama</TableHead>
              <TableHead className="text-right">Dokumen</TableHead>
              <TableHead>Kondisi</TableHead>
              <TableHead className="text-right">Terakhir diperbarui</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
            {data?.map((c) => {
              const h = byId.get(c.id);
              return (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/collections/${c.id}`)}
                >
                  <TableCell className="max-w-0">
                    <Link
                      href={`/collections/${c.id}`}
                      className="block truncate font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{c.description || "Tanpa deskripsi"}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.document_count}</TableCell>
                  <TableCell>
                    <Health counts={h?.counts} />
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                    {h?.updated_at ? timeAgo(h.updated_at) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  Belum ada collection.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function Health({ counts }: { counts?: CollectionHealth["counts"] }) {
  if (!counts) return <span className="text-sm text-muted-foreground">Kosong</span>;
  const parts = [
    counts.failed > 0 && <span key="f" className="text-red-700 dark:text-red-400">{counts.failed} gagal</span>,
    counts.processing > 0 && <span key="p">{counts.processing} diproses</span>,
    counts.ready > 0 && <span key="r" className="text-muted-foreground">{counts.ready} siap</span>,
  ].filter(Boolean);
  return <span className="flex flex-wrap gap-x-3 text-sm whitespace-nowrap">{parts}</span>;
}

function CreateCollectionDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<Collection>("/collections", { method: "POST", body: JSON.stringify({ name, description }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      setOpen(false);
      setName("");
      setDescription("");
      toast.success("Collection dibuat");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Collection baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Collection baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name">Nama</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
