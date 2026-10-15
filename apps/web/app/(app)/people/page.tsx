"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";
import { api, type Group, type Role, type UserItem } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";

const ROLES: Role[] = ["employee", "knowledge_admin", "tenant_admin"];

export default function PeoplePage() {
  const { data: me } = useMe();
  const editable = me?.role === "tenant_admin";
  const { t } = useT();
  const [tab, setTab] = useState<"users" | "groups">("users");
  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api<UserItem[]>("/users") });
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: () => api<Group[]>("/groups") });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [query, setQuery] = useState("");
  const groupName = (id: string) => groups?.find((g) => g.id === id)?.name ?? "…";
  const visible = users?.filter((u) => (u.name + u.email).toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <PageHeader
        title={t("people.title")}
        description={
          editable
            ? t("people.editableHint")
            : t("people.readonlyHint")
        }
        actions={
          editable &&
          tab === "users" && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {t("people.add")}
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="segmented" role="tablist">
          {(
            [
              ["users", t("people.users"), users?.length],
              ["groups", t("people.groupsTab"), groups?.length],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label} <span className="tabular-nums opacity-60">{n ?? ""}</span>
            </button>
          ))}
        </div>
        {tab === "users" && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("people.search")}
            className="w-full sm:w-64"
          />
        )}
      </div>

      {tab === "users" ? (
        <div className="overflow-x-auto surface">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("people.col.name")}</TableHead>
                <TableHead>{t("people.col.role")}</TableHead>
                <TableHead>{t("people.col.groups")}</TableHead>
                <TableHead className="text-right">{t("people.col.joined")}</TableHead>
                {editable && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              )}
              {visible?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {u.name}
                          {u.id === me?.id && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("people.you")}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.group_ids.length ? (
                      u.group_ids.map(groupName).sort().join(", ")
                    ) : (
                      <span className="text-muted-foreground">{t("people.noGroups")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                    {timeAgo(u.created_at)}
                  </TableCell>
                  {editable && (
                    <TableCell>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(u)} aria-label={t("people.edit", { name: u.name })}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <GroupsTab groups={groups} editable={editable} />
      )}

      {groups && (
        <>
          <UserDialog
            key={editing?.id ?? "new"}
            open={creating || !!editing}
            user={editing}
            groups={groups}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        </>
      )}
    </>
  );
}

function UserDialog({
  open,
  user,
  groups,
  onClose,
}: {
  open: boolean;
  user: UserItem | null;
  groups: Group[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "employee");
  const [selected, setSelected] = useState<string[]>(user?.group_ids ?? []);
  const [password, setPassword] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (user) {
        return api<UserItem>(`/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ role, group_ids: selected }),
        });
      }
      return api<UserItem & { temporary_password: string }>("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, role, group_ids: selected }),
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      const created = result as Partial<{ temporary_password: string }>;
      if (created.temporary_password) setPassword(created.temporary_password);
      else {
        toast.success(t("people.saved"));
        onClose();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {password ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("people.created")}</DialogTitle>
              <DialogDescription>
                {t("people.createdHint", { name })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="flex-1 font-mono text-sm">{password}</code>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  navigator.clipboard.writeText(password);
                  toast.success(t("people.copied"));
                }}
                aria-label={t("people.copy")}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t("people.done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{user ? t("people.edit", { name: user.name }) : t("people.add")}</DialogTitle>
              {user && <DialogDescription>{user.email}</DialogDescription>}
            </DialogHeader>
            {!user && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">{t("people.name")}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("people.email")}</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>{t("people.role")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`role.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(`people.role.${role}`)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("people.groups")}</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                {groups.map((g) => (
                  <Label key={g.id} className="flex items-center gap-2 font-normal">
                    <Checkbox
                      checked={selected.includes(g.id)}
                      onCheckedChange={(on) => setSelected((s) => (on ? [...s, g.id] : s.filter((id) => id !== g.id)))}
                    />
                    {g.name}
                  </Label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {user ? t("common.save") : t("people.create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GroupsTab({ groups, editable }: { groups?: Group[]; editable: boolean }) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const [name, setName] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["groups"] });
  const create = useMutation({
    mutationFn: () => api("/groups", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      setName("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/groups/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl">
      {editable && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("people.newGroup")} />
          <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
            <Plus className="size-4" /> {t("people.addGroup")}
          </Button>
        </form>
      )}
      <ul className="divide-y surface">
        {groups?.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-1 text-sm font-medium">{g.name}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{t("people.members", { n: g.member_count })}</span>
            {editable && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                onClick={() => remove.mutate(g.id)}
                aria-label={t("people.deleteGroup", { name: g.name })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
