import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { appendLog, commandTarget, isAdmin, kick, now, readGroup, writeGroup } from "../moderation.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const back = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);
type SettingsStep = "awaiting_welcome" | "awaiting_rules";
function getStep(ctx: Ctx): SettingsStep | undefined {
  return (ctx.session as { step?: SettingsStep }).step;
}
function setStep(ctx: Ctx, step?: SettingsStep): void {
  (ctx.session as { step?: SettingsStep }).step = step;
}

function dashboard() {
  return inlineKeyboard([
    [inlineButton("Welcome message", "admin:welcome"), inlineButton("Group rules", "admin:rules")],
    [inlineButton("Audit log", "log:view"), inlineButton("Summary", "report:summary")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}
async function requireAdmin(ctx: Ctx): Promise<boolean> {
  if (await isAdmin(ctx)) return true;
  await ctx.reply("Only group admins can change moderation settings.");
  return false;
}

composer.callbackQuery("admin:dashboard", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await requireAdmin(ctx)) return;
  await ctx.editMessageText("Manage the group’s welcome message, rules, and audit records.", { reply_markup: dashboard() });
});
composer.callbackQuery("admin:welcome", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await requireAdmin(ctx)) return;
  setStep(ctx, "awaiting_welcome");
  await ctx.reply("Send the welcome message you want new members to see.");
});
composer.callbackQuery("admin:rules", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await requireAdmin(ctx)) return;
  setStep(ctx, "awaiting_rules");
  await ctx.reply("Send the group rules you want members to see.");
});

async function saveSetting(ctx: Ctx, kind: "welcome" | "rules", text: string) {
  if (!await requireAdmin(ctx) || !ctx.chat) return;
  if (!text.trim()) { await ctx.reply("That message is empty. Send the text you want to save."); return; }
  const group = await readGroup(ctx.chat.id);
  if (!group) { await ctx.reply("Moderation storage isn't set up yet."); return; }
  group[kind] = text.trim().slice(0, 3500);
  await writeGroup(ctx.chat.id, group);
  setStep(ctx);
  await ctx.reply(kind === "welcome" ? "Your welcome message is saved." : "Your group rules are saved.");
}
composer.command("set_welcome", async (ctx) => saveSetting(ctx, "welcome", ((ctx as Ctx & { match?: string }).match ?? "")));
composer.command("set_rules", async (ctx) => saveSetting(ctx, "rules", ((ctx as Ctx & { match?: string }).match ?? "")));
composer.on("message:text", async (ctx, next) => {
  const step = getStep(ctx);
  if (ctx.message.text.startsWith("/") || !step) return next();
  await saveSetting(ctx, step === "awaiting_welcome" ? "welcome" : "rules", ctx.message.text);
});

composer.callbackQuery("log:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await requireAdmin(ctx) || !ctx.chat) return;
  const group = await readGroup(ctx.chat.id);
  if (!group || group.logs.length === 0) { await ctx.editMessageText("No moderation actions have been recorded yet.", { reply_markup: back }); return; }
  const latest = group.logs.slice(-10).reverse().map((entry) => `${entry.actionType.replace("_", " ")}: ${entry.reason}`).join("\n");
  await ctx.editMessageText(`Latest moderation activity:\n${latest}`, { reply_markup: back });
});
composer.command("view_log", async (ctx) => {
  if (!await requireAdmin(ctx) || !ctx.chat) return;
  const group = await readGroup(ctx.chat.id);
  const count = group?.logs.length ?? 0;
  await ctx.reply(count ? `There are ${count} audit entries. Tap Admin dashboard, then Audit log to review them.` : "No moderation actions have been recorded yet.");
});
composer.callbackQuery("report:summary", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!await requireAdmin(ctx) || !ctx.chat) return;
  const group = await readGroup(ctx.chat.id);
  if (!group) { await ctx.editMessageText("Moderation storage isn't set up yet.", { reply_markup: back }); return; }
  const pending = group.memberIds.filter((id) => group.members[String(id)]?.verificationState === "pending").length;
  const verified = group.memberIds.filter((id) => group.members[String(id)]?.verificationState === "verified").length;
  const spam = group.logs.filter((entry) => entry.actionType === "spam_kick").length;
  await ctx.editMessageText(`Group summary: ${verified} verified, ${pending} awaiting verification, and ${spam} spam removals in the retained audit log.`, { reply_markup: back });
});
composer.command("report_summary", async (ctx) => {
  if (!await requireAdmin(ctx) || !ctx.chat) return;
  const group = await readGroup(ctx.chat.id);
  const verified = group?.memberIds.filter((id) => group.members[String(id)]?.verificationState === "verified").length ?? 0;
  await ctx.reply(`Group summary: ${verified} verified members. Tap Admin dashboard for the full summary.`);
});

for (const action of ["mute", "kick", "ban"] as const) {
  composer.command(action, async (ctx) => {
    if (!await requireAdmin(ctx) || !ctx.chat || !ctx.from) return;
    const { target, reason } = commandTarget(ctx);
    if (!target) { await ctx.reply(`Reply to a member with /${action} and an optional reason.`); return; }
    const group = await readGroup(ctx.chat.id);
    if (!group) { await ctx.reply("Moderation storage isn't set up yet."); return; }
    try {
      if (action === "mute") await ctx.api.restrictChatMember(ctx.chat.id, target, { can_send_messages: false });
      else if (action === "kick") await kick(ctx, target);
      else await ctx.api.banChatMember(ctx.chat.id, target);
      appendLog(group, { timestamp: now(), issuer: ctx.from.id, target, actionType: action, reason: reason || "No reason provided." });
      await writeGroup(ctx.chat.id, group);
      await ctx.reply(`${action[0].toUpperCase() + action.slice(1)} recorded in the audit log.`);
    } catch { await ctx.reply(`I couldn’t ${action} that member. Check my admin permissions and try again.`); }
  });
}

export default composer;
