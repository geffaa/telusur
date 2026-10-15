import { core } from "./core";
import { admin } from "./admin";
import { docs } from "./docs";

// Add each namespace here; keys are prefixed ("chat.…", "admin.…") so they never collide.
const namespaces = [core, docs, admin] as const;

type En = (typeof namespaces)[number]["en"];
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
export type MessageKey = keyof UnionToIntersection<En>;

export const messages = {
  en: Object.assign({}, ...namespaces.map((n) => n.en)) as Record<MessageKey, string>,
  id: Object.assign({}, ...namespaces.map((n) => n.id)) as Record<MessageKey, string>,
};
