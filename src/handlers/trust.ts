import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { appendLog, commandTarget, ensureMember, isAdmin, now, readGroup, writeGroup } from "../moderation.js";
import { registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Admin dashboard", data: "admin:dashboard", order: 20 });
const composer = new Composer<Ctx>();

composer.command("trust", async (ctx) => {
  if (!await isAdmin(ctx)) { await ctx.reply("Only group admins can manage trusted members."); return; }
  const { target } = commandTarget(ctx);
  if (!target || !ctx.chat || !ctx.from) { await ctx.reply("Reply to a member with /trust to add or remove their trusted status."); return; }
  const group = await readGroup(ctx.chat.id);
  if (!group) { await ctx.reply("Moderation storage isn't set up yet."); return; }
  const member = ensureMember(group, target);
  member.trusted = !member.trusted;
  if (member.trusted) member.verificationState = "verified";
  appendLog(group, { timestamp: now(), issuer: ctx.from.id, target, actionType: "trust", reason: member.trusted ? "Trusted status enabled." : "Trusted status removed." });
  await writeGroup(ctx.chat.id, group);
  await ctx.reply(member.trusted ? "That member is now trusted and exempt from automated actions." : "That member is no longer trusted.");
});

export default composer;
