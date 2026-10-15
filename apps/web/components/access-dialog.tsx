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
import { useT } from "@/lib/i18n";

type Mode = "inherit" | "everyone" | "groups";

/** Summary used on buttons: "All employees", "HR, Manager", "Admins only". */
export function accessSummary(
  access: Access | undefined,
  groups: Group[] | undefined,
  t: ReturnType<typeof useT>["t"],
) {
  if (!access) return "…";
  if (access.everyone) return t("access.everyone");
  const names = access.group_ids.map((id) => groups?.find((g) => g.id === id)?.name).filter(Boolean);
  return names.length ? names.join(", ") : t("access.adminsOnly");
}

export function AccessDialog({ path, kind, name }: { path: string; kind: "collection" | "document"; name: string }) {
  const queryClient = useQueryClient();
  const { t } = useT();
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
      toast.success(t("access.updated"), { description: t("access.updatedHint") });
    },
    onError: (e) => toast.error(e.message),
  });

  const restricted = access && !access.everyone;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {restricted ? <Lock className="size-4" /> : <Users className="size-4" />}
          <span className="max-w-48 truncate">{accessSummary(access, groups, t)}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("access.title")}</DialogTitle>
          <DialogDescription>
            {kind === "collection" ? t("access.collectionHint", { name }) : t("access.documentHint", { name })}{" "}
            {t("access.adminNote")}
          </DialogDescription>
        </DialogHeader>
        {!access || !groups ? (
          <Skeleton className="h-32" />
        ) : (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
            {kind === "document" && (
              <Option value="inherit" label={t("access.inherit")} hint={t("access.inheritHint")} />
            )}
            <Option value="everyone" label={t("access.everyone")} hint={t("access.everyoneHint")} />
            <Option value="groups" label={t("access.groups")} hint={t("access.groupsHint")} />
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
                    <span className="text-xs text-muted-foreground">{t("access.members", { n: g.member_count })}</span>
                  </Label>
                ))}
                {selected.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("access.noGroups")}</p>
                )}
              </div>
            )}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !access}>
            {t("common.save")}
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
