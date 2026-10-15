import { currentLocale, translate } from "@/lib/i18n";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept-Language", currentLocale());
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(res.status, message);
  }
  // 204 No Content (feedback, deletes) has no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type Role = "employee" | "knowledge_admin" | "tenant_admin";
export type VersionStatus = "queued" | "parsing" | "embedding" | "ready" | "failed";

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenant_name: string;
  tenant_slug: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  document_count: number;
  created_at: string;
}

export interface Version {
  id: string;
  version: number;
  filename: string;
  size_bytes: number;
  pages: number | null;
  chunk_count: number;
  status: VersionStatus;
  error: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentItem {
  id: string;
  collection_id: string;
  title: string;
  created_at: string;
  current: Version | null;
  latest: Version | null;
  versions: Version[];
}

export interface ChunkItem {
  id: number;
  ordinal: number;
  kind: "text" | "table";
  content: string;
  heading_path: string;
  page_start: number;
  page_end: number;
  token_count: number;
}

export const canManage = (role?: Role) => role === "knowledge_admin" || role === "tenant_admin";

export const IN_PROGRESS: VersionStatus[] = ["queued", "parsing", "embedding"];

export interface StatusCounts {
  ready: number;
  processing: number;
  failed: number;
}

export interface RecentDocument {
  id: string;
  title: string;
  collection_id: string;
  collection_name: string;
  status: VersionStatus;
  error: string | null;
  updated_at: string;
}

export interface Overview {
  documents: StatusCounts;
  chunks: number;
  collections: number;
  attention: RecentDocument[];
  recent: RecentDocument[];
  open_gaps: number;
  questions_7d: number;
  refused_7d: number;
  feedback_positive: number;
  feedback_negative: number;
}

export interface CollectionHealth {
  collection_id: string;
  counts: StatusCounts;
  updated_at: string | null;
}

export interface Source {
  marker: number;
  document_id: string;
  version: number;
  mime: string;
  title: string;
  heading_path: string;
  page_start: number;
  page_end: number;
  quote: string | null;
  score: number;
  cited?: boolean;
  available?: boolean;
}

export interface ConversationItem {
  id: string;
  title: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  refused: boolean;
  created_at: string;
  latency_ms?: number | null;
  citations: Source[];
}

export interface Group {
  id: string;
  name: string;
  member_count: number;
}

export interface Access {
  everyone: boolean;
  group_ids: string[];
  inherit: boolean;
}

export type ChatEvent =
  | { event: "conversation"; data: { id: string; title: string } }
  | { event: "status"; data: { stage: "rewriting" | "searching" | "answering" } }
  | { event: "sources"; data: Source[] }
  | { event: "delta"; data: { text: string } }
  | {
      event: "done";
      data: { message_id: string; content: string; cited: number[]; refused: boolean; latency_ms: number };
    }
  | { event: "error"; data: { message: string } };

/** POST /chat and yield Server-Sent Events as they arrive. */
export async function* streamChat(
  message: string,
  conversationId: string | null,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "Accept-Language": currentLocale() },
    body: JSON.stringify({ message, conversation_id: conversationId }),
    signal,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    return;
  }
  if (!res.ok || !res.body) throw new ApiError(res.status, translate(currentLocale(), "chat.sendFailed"));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let split;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) } as ChatEvent;
    }
  }
}

export interface GapCluster {
  label: string;
  count: number;
  askers: number;
  last_asked: string;
  gap_ids: string[];
  examples: { id: string; query: string; created_at: string }[];
}

export type FeedbackReason = "wrong" | "incomplete" | "wrong_source" | "other";

export interface FeedbackItem {
  id: string;
  rating: 1 | -1;
  reason: FeedbackReason | null;
  comment: string | null;
  created_at: string;
  user_name: string | null;
  question: string;
  answer: string;
  message_id: string;
  conversation_id: string;
}

export interface AuditItem {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  ip: string | null;
}

export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  group_ids: string[];
  created_at: string;
}

export interface AccessCheckResult {
  user: { id: string; name: string; role: Role };
  groups: string[];
  documents: { id: string; title: string; collection: string; readable: boolean }[];
  retrieval: {
    would_refuse: boolean;
    top_score: number;
    passages: { title: string; heading_path: string; page: number; score: number; preview: string }[];
  } | null;
}



export type EvalKind = "answerable" | "unanswerable" | "restricted";
export type RetrievalMode = "vector" | "lexical" | "hybrid" | "hybrid_rerank";

export interface EvalCaseItem {
  id: string;
  kind: EvalKind;
  question: string;
  expected_answer: string | null;
  expected_document_id: string | null;
  expected_document_title: string | null;
  expected_heading: string | null;
  ask_as: string;
  source: "generated" | "feedback" | "manual";
  verified: boolean;
  created_at: string;
}

export interface EvalMetrics {
  cases?: number;
  answerable?: number;
  negative?: number;
  recall_at_1?: number;
  recall_at_5?: number;
  doc_recall_at_5?: number;
  mrr?: number;
  refusal_accuracy?: number;
  restricted_leaks?: number;
  false_refusal_rate?: number;
  faithfulness?: number;
  correctness?: number;
  citation_rate?: number;
  retrieval_ms_p50?: number;
  retrieval_ms_p95?: number;
  answer_ms_p50?: number;
  tokens?: number;
  threshold?: number;
  suggested_threshold?: number | null;
}

export interface EvalRunItem {
  id: string;
  name: string;
  config: {
    mode: RetrievalMode;
    answers: boolean;
    verified_only: boolean;
    translate?: boolean;
    rerank_candidates?: number;
  };
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  case_count: number;
  metrics: EvalMetrics;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface EvalResultItem {
  case_id: string;
  kind: EvalKind;
  question: string;
  expected_document_title: string | null;
  expected_heading: string | null;
  expected_answer: string | null;
  hit_rank: number | null;
  doc_hit_rank: number | null;
  top_score: number;
  refused: boolean;
  retrieved: { title: string; heading_path: string; score: number; document_id: string }[];
  answer: string | null;
  faithfulness: number | null;
  correctness: number | null;
  judge_notes: string | null;
}

