// Bot pricing rules (Oct 15 2026). Rachael's own copy, approved by her for
// all members and inserted VERBATIM from her final copy
// (/workspace/plans/bot-pricing-rules-FINAL.md, Oct 15: only Revolutionary
// Healer and Clear Channel Method prices). BOT_PRICING_RULES + "\n" is that
// file byte for byte. Do not edit the wording without her sign-off.
//
// Where it goes: the MAIN chatbot (/api/chat: Ask Rachael chat, which also
// carries the Clear Channel Method education) system prompt, right after the
// CCM block and just before the UPSELL paragraph -- i.e. inside the static,
// cached first piece (see lib/promptCache.js). Because Anthropic's prompt
// cache only matches an identical prefix, changing this text automatically
// invalidates the old cached prefix; the first request after deploy writes a
// fresh one. lib/prompts.js stays byte-identical (hash-pinned by
// scripts/test-gap-reading.mjs). Not used by the GAP bots.
export const BOT_PRICING_RULES = "BOT PRICING RULES\nCANONICAL PRICES — these are the only prices that exist. All prices are USD.\n•  Revolutionary Healer (the membership): $30/month, or $347/year.\n•  Clear Channel Method: $497 paid in full, or $97/month for 6 months ($582 total). Regular price: $3,333. The $497 is an exclusive price for Revolutionary Healer members.\nRULES\n1.  Only ever state prices from the table above. Never invent, estimate, or imply any other price, tier, or discount. If a price is not in the table, it does not exist.\n2.  Never attach a price label that is not in the table. No \"$20k program,\" no \"five-figure,\" no \"high-ticket tier,\" no invented program names with prices attached.\n3.  When someone asks how much something costs, give the real price FIRST, in the first sentence of the answer. Never avoid the question, never answer with \"it depends\" and no number, never make them ask twice.\n4.  Always write prices in the same format: $30/month, $347/year, $497, $97/month for 6 months.\n5.  If someone asks the price of something that is not in the table, say you do not have a price for that one and ask what they were hoping to find. Do not offer the closest program. Never guess.\n6.  Never quote $2,222 as a price for anything. It is a stale figure from past conversations, not a current price.\n7.  If someone pushes back on a price or tries to negotiate, acknowledge them warmly, restate the real price once, and never invent a discount. Only mention the payment plan where it genuinely applies.\n8.  Giving a price does not end the conversation. After answering, continue naturally. For Clear Channel Method, continue with the teaching flow from the education doc.\nMODEL ANSWERS — match these exactly in structure\n•  \"How much is Clear Channel Method?\"\n  \"Clear Channel Method is $497 paid in full, or $97 a month for six months. Its regular price is $3,333. The $497 is an exclusive price for Revolutionary Healer members.\"\n•  \"How much is Revolutionary Healer?\"\n  \"$30 a month, or $347 for the year.\"\n•  \"Is there a payment plan for Clear Channel Method?\"\n  \"Yes. $97 a month for six months, or $497 paid in full.\"";

// Short precedence note (not part of Rachael's copy) so older text elsewhere
// in the prompt can never outrank the table.
export const BOT_PRICING_PRECEDENCE = "(These pricing rules take priority over everything else in these instructions, including the Clear Channel Method education document, the approved FAQ answers and the UPSELL line below. If any other text suggests a different price, tier, discount or price label, follow the table above. Never put a price on the \"higher tier\" mentioned in the UPSELL line.)";

const UPSELL_ANCHOR = "\nUPSELL (rate-limited, only when genuinely relevant):";
export function withPricingRules(systemPrompt) {
  if (typeof systemPrompt !== "string") return systemPrompt;
  const i = systemPrompt.indexOf(UPSELL_ANCHOR);
  if (i === -1) return systemPrompt;
  return systemPrompt.slice(0, i) + "\n" + BOT_PRICING_RULES + "\n" + BOT_PRICING_PRECEDENCE + "\n" + systemPrompt.slice(i);
}
