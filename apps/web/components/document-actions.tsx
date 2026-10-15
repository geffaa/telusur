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
import { useT } from "@/lib/i18n";

const ACCEPT = ".pdf,.docx,.md,.markdown,.txt";

export function DocumentActions({ doc, busy }: { doc: DocumentItem; busy: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useT();
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
      toast.success(t("document.versionProcessing", { n: updated.latest?.version ?? "" }), {
        description: t("document.versionProcessingHint"),
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
      toast.success(t("document.deleted", { title: doc.title }));
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
        title={busy ? t("document.waitProcessing") : undefined}
      >
        <FileUp className="size-4" /> {uploading ? t("document.uploadingVersion") : t("document.newVersion")}
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
          <Button variant="ghost" size="icon" aria-label={t("document.moreActions")}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> {t("document.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("document.deleteTitle", { title: doc.title })}</DialogTitle>
            <DialogDescription>
              {t("document.deleteHint")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
