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
import { useT } from "@/lib/i18n";

export default function CollectionsPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { t } = useT();
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
        title={t("collections.title")}
        description={t("collections.subtitle")}
        actions={canManage(me?.role) && <CreateCollectionDialog />}
      />
      <div className="overflow-x-auto surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[45%]">{t("collections.name")}</TableHead>
              <TableHead className="text-right">{t("collections.documents")}</TableHead>
              <TableHead>{t("collections.health")}</TableHead>
              <TableHead className="text-right">{t("collections.updated")}</TableHead>
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
                    <p className="truncate text-xs text-muted-foreground">{c.description || t("collections.noDescription")}</p>
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
                  {t("collections.none")}
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
  const { t } = useT();
  if (!counts) return <span className="text-sm text-muted-foreground">{t("collections.empty")}</span>;
  const parts = [
    counts.failed > 0 && <span key="f" className="text-danger">{t("collections.failedCount", { n: counts.failed })}</span>,
    counts.processing > 0 && <span key="p">{t("collections.processingCount", { n: counts.processing })}</span>,
    counts.ready > 0 && <span key="r" className="text-muted-foreground">{t("collections.readyCount", { n: counts.ready })}</span>,
  ].filter(Boolean);
  return <span className="flex flex-wrap gap-x-3 text-sm whitespace-nowrap">{parts}</span>;
}

function CreateCollectionDialog() {
  const queryClient = useQueryClient();
  const { t } = useT();
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
      toast.success(t("collections.created"));
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {t("collections.new")}
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
            <DialogTitle>{t("collections.new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name">{t("collections.name")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("collections.description")}</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
