import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { appendLog, ensureMember, expirePending, hasLink, isSpam, kick, now, readGroup, writeGroup } from "../moderation.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.on("message:new_chat_members", async (ctx) => {
  if (!ctx.chat) return;
  const group = await readGroup(ctx.chat.id);
  if (!group) { await ctx.reply("Moderation storage isn't set up yet. Ask the owner to connect it before using GroupGuard."); return; }
  for (const newcomer of ctx.message.new_chat_members) ensureMember(group, newcomer.id, now());
  await writeGroup(ctx.chat.id, group);
  await ctx.reply(group.welcome, { reply_markup: inlineKeyboard([[inlineButton("Verify me", "verify:user")]]) });
});

composer.on("message:text", async (ctx, next) => {
  if (!ctx.chat || !ctx.from || ctx.chat.type === "private" || ctx.message.text.startsWith("/")) return next();
  const group = await readGroup(ctx.chat.id);
  if (!group) return;
  await expirePending(ctx, group);
  const member = ensureMember(group, ctx.from.id);
  if (!member.trusted && member.verificationState === "pending" && !hasLink(ctx.message.text)) {
    member.verificationState = "verified";
    await ctx.reply("You’re verified. Thanks for keeping the group safe.");
  }
  if (!member.trusted && isSpam(member, ctx.message.text)) {
    try {
      await kick(ctx, member.userId);
      appendLog(group, { timestamp: now(), issuer: 0, target: member.userId, actionType: "spam_kick", reason: "Repeated or link-heavy messages from a new account." });
      await ctx.reply("A member was removed for suspected spam. The action was recorded in the audit log.");
    } catch { await ctx.reply("Spam was detected, but I couldn’t remove that member. Check my admin permissions."); }
  }
  await writeGroup(ctx.chat.id, group);
});

export default composer;
