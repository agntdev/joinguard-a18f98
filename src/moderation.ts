import type { Context } from "grammy";
import type { StorageAdapter } from "grammy";
import { defaultRedisStorage, MemorySessionStorage } from "./toolkit/index.js";

export type VerificationState = "pending" | "verified" | "expired";
export interface Member {
  userId: number;
  joinTime: number;
  verificationState: VerificationState;
  trusted: boolean;
  recentMessages: Array<{ text: string; at: number }>;
}
export interface ActionLog {
  timestamp: number;
  issuer: number;
  target: number;
  actionType: "warn" | "mute" | "kick" | "ban" | "spam_kick" | "verification_kick" | "trust";
  reason: string;
}
export interface GroupData {
  members: Record<string, Member>;
  memberIds: number[];
  logs: ActionLog[];
  welcome: string;
  rules: string;
  updatedAt: number;
}

const DEFAULT_WELCOME = "Welcome to the group. Tap Verify me within 30 minutes to keep access.";
const EMPTY = (): GroupData => ({ members: {}, memberIds: [], logs: [], welcome: DEFAULT_WELCOME, rules: "", updatedAt: now() });

/** Injectable clock seam for all verification and retention decisions. */
let clock: () => number = () => Date.now();
export const now = () => clock();
export const setClockForTests = (next?: () => number) => { clock = next ?? (() => Date.now()); };

const isVitest = typeof process !== "undefined" && (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
let harnessStorage: StorageAdapter<GroupData> | undefined;
const productionStorage = typeof process !== "undefined" && process.env.REDIS_URL
  ? defaultRedisStorage<GroupData>(process.env.REDIS_URL)
  : isVitest
    ? new MemorySessionStorage<GroupData>()
    : undefined;

/**
 * The tokenless replay harness has no Redis service. Keep its storage explicit
 * so production never silently falls back to process memory.
 */
export function useHarnessModerationStorage(): void {
  harnessStorage = new MemorySessionStorage<GroupData>();
}

function activeStorage(): StorageAdapter<GroupData> | undefined {
  return harnessStorage ?? productionStorage;
}

function key(chatId: number | string) { return `groupguard:group:${chatId}`; }

export async function readGroup(chatId: number | string): Promise<GroupData | undefined> {
  const storage = activeStorage();
  if (!storage) return undefined;
  return (await storage.read(key(chatId))) ?? EMPTY();
}
export async function writeGroup(chatId: number | string, group: GroupData): Promise<void> {
  const storage = activeStorage();
  if (!storage) return;
  group.logs = group.logs.filter((entry) => entry.timestamp >= now() - 90 * 24 * 60 * 60 * 1000);
  group.updatedAt = now();
  await storage.write(key(chatId), group);
}
export function ensureMember(group: GroupData, userId: number, joinedAt = now()): Member {
  const existing = group.members[String(userId)];
  if (existing) return existing;
  const member: Member = { userId, joinTime: joinedAt, verificationState: "pending", trusted: false, recentMessages: [] };
  group.members[String(userId)] = member;
  group.memberIds.push(userId);
  return member;
}
export function appendLog(group: GroupData, entry: ActionLog): void { group.logs.push(entry); }
export function hasLink(text: string): boolean { return /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i.test(text); }
export function isSpam(member: Member, text: string): boolean {
  const cutoff = now() - 2 * 60 * 1000;
  member.recentMessages = member.recentMessages.filter((m) => m.at >= cutoff);
  member.recentMessages.push({ text, at: now() });
  const repeats = member.recentMessages.filter((m) => m.text.trim().toLowerCase() === text.trim().toLowerCase()).length;
  const links = (text.match(/(?:https?:\/\/|www\.|t\.me\/)/gi) ?? []).length;
  // A new account needs both a suspicious link pattern and repetition; this avoids single-message false positives.
  return (links >= 2 || repeats >= 3) && now() - member.joinTime < 24 * 60 * 60 * 1000;
}
export async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.from || !ctx.chat) return false;
  if (ctx.chat.type === "private") return true;
  try {
    const member = await ctx.getChatMember(ctx.from.id);
    return member.status === "creator" || member.status === "administrator";
  } catch { return false; }
}
export async function kick(ctx: Context, userId: number): Promise<void> {
  if (!ctx.chat) return;
  await ctx.api.banChatMember(ctx.chat.id, userId);
  await ctx.api.unbanChatMember(ctx.chat.id, userId, { only_if_banned: true });
}
export function commandTarget(ctx: Context): { target?: number; reason: string } {
  const replyTarget = ctx.message?.reply_to_message?.from?.id;
  const rest = ((ctx as Context & { match?: string }).match)?.trim() ?? "";
  const match = rest.match(/^(\d+)\s*(.*)$/s);
  return { target: replyTarget ?? (match ? Number(match[1]) : undefined), reason: (replyTarget ? rest : match?.[2] ?? rest).trim() };
}
export async function expirePending(ctx: Context, group: GroupData): Promise<number> {
  let expired = 0;
  for (const id of group.memberIds) {
    const member = group.members[String(id)];
    if (!member || member.trusted || member.verificationState !== "pending" || now() - member.joinTime < 30 * 60 * 1000) continue;
    member.verificationState = "expired";
    try { await kick(ctx, id); } catch { continue; }
    appendLog(group, { timestamp: now(), issuer: 0, target: id, actionType: "verification_kick", reason: "Verification was not completed within 30 minutes." });
    expired++;
  }
  return expired;
}
