import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { appendLog, commandTarget, isAdmin, now, readGroup, writeGroup } from "../moderation.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Moderate", data: "moderation:menu", order: 30 });
const composer = new Composer<Ctx>();

composer.command("warn", async (ctx) => {
  if (!await isAdmin(ctx)) { await ctx.reply("Only group admins can issue warnings."); return; }
  const { target, reason } = commandTarget(ctx);
  if (!target || !ctx.chat || !ctx.from) { await ctx.reply("Reply to a member with /warn and an optional reason."); return; }
  const group = await readGroup(ctx.chat.id);
  if (!group) { await ctx.reply("Moderation storage isn't set up yet."); return; }
  appendLog(group, { timestamp: now(), issuer: ctx.from.id, target, actionType: "warn", reason: reason || "No reason provided." });
  await writeGroup(ctx.chat.id, group);
  await ctx.reply(reason ? "Warning recorded with the reason you provided." : "Warning recorded.");
});

composer.callbackQuery("moderation:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Use the admin actions below, or reply to a member with /warn.", { reply_markup: inlineKeyboard([[inlineButton("View audit log", "log:view")], [inlineButton("Back to menu", "menu:main")]]) });
});

export default composer;
