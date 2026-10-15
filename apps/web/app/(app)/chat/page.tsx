"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Baby,
  FileText,
  Laptop,
  Loader2,
  MessageSquarePlus,
  Plane,
  Receipt,
  SearchX,
  Square,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand";
import { Answer } from "@/components/chat/answer";
import { FeedbackButtons } from "@/components/chat/feedback";
import { SourcePanel } from "@/components/chat/source-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, streamChat, type ChatMessage, type ConversationItem, type Source } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Stage = "rewriting" | "searching" | "answering";

interface Pending {
  question: string;
  content: string;
  sources: Source[];
  stage: Stage | null;
  error: string | null;
}

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const router = useRouter();
  const { t } = useT();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const conversationId = params.get("c");

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<ConversationItem[]>("/conversations"),
  });
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => api<ChatMessage[]>(`/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
  });

  const { data: myFeedback } = useQuery({
    queryKey: ["my-feedback", conversationId],
    queryFn: () => api<Record<string, 1 | -1>>(`/messages/feedback?conversation_id=${conversationId}`),
    enabled: !!conversationId,
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<{ messageId: string; marker: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busy = pending !== null && pending.error === null;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, pending?.content, pending?.stage]);

  useEffect(() => {
    setPanel(null);
  }, [conversationId]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setPanel(null);
    setPending({ question, content: "", sources: [], stage: "searching", error: null });
    const controller = new AbortController();
    abort.current = controller;
    let convo = conversationId;
    try {
      for await (const { event, data } of streamChat(question, convo, controller.signal)) {
        if (event === "conversation") {
          if (convo !== data.id) {
            convo = data.id;
            router.replace(`/chat?c=${data.id}`, { scroll: false });
          }
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        } else if (event === "status") setPending((p) => p && { ...p, stage: data.stage });
        else if (event === "sources") setPending((p) => p && { ...p, sources: data });
        else if (event === "delta") setPending((p) => p && { ...p, stage: null, content: p.content + data.text });
        else if (event === "done") {
          await queryClient.invalidateQueries({ queryKey: ["messages", convo] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          setPending(null);
        } else if (event === "error") setPending((p) => p && { ...p, stage: null, error: data.message });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setPending(null);
        if (convo) queryClient.invalidateQueries({ queryKey: ["messages", convo] });
      } else setPending((p) => p && { ...p, stage: null, error: t("chat.connectionLost") });
    } finally {
      abort.current = null;
      textarea.current?.focus();
    }
  }

  async function remove(id: string) {
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (id === conversationId) router.replace("/chat");
  }

  const panelSources = panel
    ? panel.messageId === "pending"
      ? (pending?.sources ?? [])
      : (messages?.find((m) => m.id === panel.messageId)?.citations ?? [])
    : [];
  const showEmpty = !conversationId && !pending;
  // The question is saved before the answer streams; don't show it twice meanwhile.
  const last = messages?.at(-1);
  const shown =
    pending && last?.role === "user" && last.content === pending.question ? messages?.slice(0, -1) : messages;

  return (
    <div
      className={cn(
        "grid h-[calc(100dvh-7.5rem)] min-h-0 md:h-dvh",
        panel ? "lg:grid-cols-[240px_minmax(0,1fr)_440px]" : "lg:grid-cols-[240px_minmax(0,1fr)]",
      )}
    >
      {/* Conversation history */}
      <aside className="hidden min-h-0 flex-col border-r bg-card lg:flex">
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              router.push("/chat");
              textarea.current?.focus();
            }}
          >
            <MessageSquarePlus className="size-4" /> {t("chat.newConversation")}
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {conversations?.length === 0 && (
            <li className="px-2 py-4 text-xs text-muted-foreground">{t("chat.noConversations")}</li>
          )}
          {conversations?.map((c) => (
            <li key={c.id} className="group relative">
              <button
                onClick={() => router.push(`/chat?c=${c.id}`)}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 pr-8 text-left transition-colors",
                  c.id === conversationId ? "bg-brand-soft text-brand-strong" : "hover:bg-muted",
                )}
              >
                <span className="block truncate text-sm">{c.title}</span>
                <span className="block text-xs text-muted-foreground">{timeAgo(c.updated_at)}</span>
              </button>
              <button
                onClick={() => remove(c.id)}
                className="absolute top-2 right-1.5 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-foreground focus:opacity-100"
                aria-label={t("chat.deleteConversation", { title: c.title })}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversation */}
      <section className="flex min-h-0 min-w-0 flex-col">
        {conversationId && (
          <div className="flex justify-end border-b px-4 py-2 lg:hidden">
            <Button variant="ghost" size="sm" onClick={() => router.push("/chat")}>
              <MessageSquarePlus className="size-4" /> {t("chat.newConversation")}
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
            {showEmpty && <EmptyState onPick={send} />}
            {conversationId && messagesLoading && <Skeleton className="h-24 rounded-lg" />}
            <div className="space-y-6">
              {shown?.map((m) =>
                m.role === "user" ? (
                  <UserBubble key={m.id} text={m.content} />
                ) : (
                  <AssistantBlock
                    key={m.id}
                    refused={m.refused}
                    sources={m.citations}
                    activeMarker={panel?.messageId === m.id ? panel.marker : null}
                    onCite={(marker) => setPanel({ messageId: m.id, marker })}
                    footer={
                      conversationId && (
                        <FeedbackButtons
                          messageId={m.id}
                          conversationId={conversationId}
                          rating={myFeedback?.[m.id]}
                        />
                      )
                    }
                  >
                    {m.content}
                  </AssistantBlock>
                ),
              )}
              {pending && (
                <>
                  <UserBubble text={pending.question} />
                  <div>
                    {pending.stage && (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> {t(`chat.stage.${pending.stage}`)}
                      </p>
                    )}
                    {pending.content && (
                      <AssistantBlock
                        sources={pending.sources}
                        activeMarker={panel?.messageId === "pending" ? panel.marker : null}
                        onCite={(marker) => setPanel({ messageId: "pending", marker })}
                      >
                        {pending.content}
                      </AssistantBlock>
                    )}
                    {pending.error && (
                      <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
                        <span className="flex-1">{pending.error}</span>
                        <Button size="sm" variant="outline" onClick={() => send(pending.question)}>
                          {t("common.retry")}
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div ref={bottom} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto w-full max-w-3xl px-4 pb-4 md:px-6"
        >
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-[0_2px_10px_-4px_rgb(0_0_0/0.08)] transition focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-brand/10">
            <textarea
              ref={textarea}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={t("chat.placeholder")}
              className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {busy ? (
              <Button type="button" size="icon" variant="outline" onClick={() => abort.current?.abort()} aria-label={t("chat.stop")}>
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label={t("chat.sendQuestion")}>
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 px-1 text-xs text-muted-foreground">
            {t("chat.disclaimer")}
          </p>
        </form>
      </section>

      {/* Sources */}
      {panel && panelSources.length > 0 && (
        <aside className="fixed inset-0 z-40 min-h-0 bg-background lg:static lg:z-auto lg:border-l">
          <SourcePanel
            sources={panelSources}
            active={panel.marker}
            onSelect={(marker) => setPanel({ ...panel, marker })}
            onClose={() => setPanel(null)}
          />
        </aside>
      )}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-foreground">{text}</p>
    </div>
  );
}

function AssistantBlock({
  children,
  sources,
  refused,
  activeMarker,
  onCite,
  footer,
}: {
  children: string;
  sources: Source[];
  refused?: boolean;
  activeMarker: number | null;
  onCite: (marker: number) => void;
  footer?: React.ReactNode;
}) {
  // If the model forgot citation markers, still show what the answer was based on.
  const marked = sources.filter((s) => s.cited !== false);
  const cited = marked.length || refused ? marked : sources;
  const { t } = useT();
  return (
    <div>
      {refused ? (
        <div className="flex gap-3 rounded-xl border border-warning/25 bg-warning-soft/60 px-4 py-3 text-sm">
          <SearchX className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{children}</span>
        </div>
      ) : (
        <Answer content={children} sources={sources} activeMarker={activeMarker} onCite={onCite} />
      )}
      {cited.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {cited.map((s) => (
            <li key={s.marker}>
              <button
                onClick={() => onCite(s.marker)}
                className={cn(
                  "flex max-w-72 items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-left text-xs transition-colors hover:border-brand/40",
                  activeMarker === s.marker && "border-brand/50 bg-brand-soft",
                )}
              >
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-brand-soft font-mono text-[10px] font-semibold text-brand-strong">
                  {s.marker}
                </span>
                <FileText className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.available === false ? t("chat.accessRevoked") : s.title}</span>
                <span className="shrink-0 text-muted-foreground">{t("common.page", { n: s.page_start })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
}

const EXAMPLE_ICONS = [Plane, Baby, Receipt, Laptop];

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const { t } = useT();
  const examples = [t("chat.example1"), t("chat.example2"), t("chat.example3"), t("chat.example4")];
  return (
    <div className="pt-[10vh]">
      <BrandMark className="size-11 rounded-xl" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("chat.empty.title")}</h1>
      <p className="mt-1.5 max-w-lg text-[15px] text-muted-foreground">
        {t("chat.empty.subtitle")}
      </p>
      <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
        {examples.map((q, i) => {
          const Icon = EXAMPLE_ICONS[i % EXAMPLE_ICONS.length];
          return (
            <li key={q}>
              <button
                onClick={() => onPick(q)}
                className="surface flex h-full w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/30"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-brand" />
                {q}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
