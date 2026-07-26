import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now, readGroup, writeGroup } from "../moderation.js";
import { registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Verify me", data: "verify:user", order: 10 });
const composer = new Composer<Ctx>();

composer.callbackQuery("verify:user", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.chat || !ctx.from) return;
  const group = await readGroup(ctx.chat.id);
  const member = group?.members[String(ctx.from.id)];
  if (!group || !member) { await ctx.reply("There’s no verification waiting for you. Ask an admin to add you again if needed."); return; }
  if (member.trusted || member.verificationState === "verified") { await ctx.reply("You’re already verified."); return; }
  if (now() - member.joinTime >= 30 * 60 * 1000) { member.verificationState = "expired"; await writeGroup(ctx.chat.id, group); await ctx.reply("Your verification window has closed. Ask an admin to re-add you."); return; }
  member.verificationState = "verified";
  await writeGroup(ctx.chat.id, group);
  await ctx.reply("You’re verified. Thanks for keeping the group safe.");
});

export default composer;
