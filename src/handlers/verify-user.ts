import { Composer } from "grammy";

// SCAFFOLD — generated from the bot blueprint BEFORE the agent runs.
// Keep a LIVE registration (.command / .callbackQuery / …) so this feature is
// never an empty stub. Replace the reply body with real logic + copy; if you
// change the user-facing text, update tests/specs to match EXACTLY.
// Do NOT rewrite src/bot.ts — buildBot() already auto-loads this module.
// Menu: wire this into /start via registerMainMenuItem({ label: "Verify me", data: "verify:user" }) if the toolkit exposes it.

const composer = new Composer();

composer.callbackQuery("verify:user", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Initiate verification process for new members");
});

export default composer;
