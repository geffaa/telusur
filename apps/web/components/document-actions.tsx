"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FileUp, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type DocumentItem } from "@/lib/api";

const ACCEPT = ".pdf,.docx,.md,.markdown,.txt";

export function DocumentActions({ doc, busy }: { doc: DocumentItem; busy: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function uploadVersion(file: File) {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const updated = await api<DocumentItem>(`/documents/${doc.id}/versions`, { method: "POST", body: form });
      queryClient.setQueryData(["document", doc.id], updated);
      toast.success(`Versi ${updated.latest?.version} sedang diproses`, {
        description: "Versi aktif tetap dipakai sampai versi baru siap.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/documents/${doc.id}`, { method: "DELETE" });
      ["collections", "collections-health", "overview", "documents"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      );
      toast.success(`"${doc.title}" dihapus`);
      router.push(`/collections/${doc.collection_id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => input.current?.click()}
        disabled={uploading || busy}
        title={busy ? "Tunggu versi yang sedang diproses selesai" : undefined}
      >
        <FileUp className="size-4" /> {uploading ? "Mengunggah…" : "Versi baru"}
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadVersion(file);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Aksi lain">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Hapus dokumen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus &ldquo;{doc.title}&rdquo;?</DialogTitle>
            <DialogDescription>
              Dokumen langsung berhenti dipakai untuk menjawab. Riwayat dan audit log tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
