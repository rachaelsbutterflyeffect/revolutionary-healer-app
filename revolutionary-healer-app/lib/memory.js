// Chat summarization, member-memory extraction, and title generation.
// Spec ref: Rachael's Aug 13 Chat History + Memory Architecture doc, PART 6-13.
//
// Two distinct jobs live here, both "best effort" -- neither is allowed to
// throw and break a chat response, since they're secondary to the actual
// reply. Callers should treat every export here as safe to await inline.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

// -----------------------------------------------------------------------
// Member memory (persistent, cross-chat) -- PART 9-13.
// -----------------------------------------------------------------------
// Extraction never auto-saves an AI guess as confirmed fact (PART 11's
// explicit rule): everything is written with a status of "confirmed" or
// "hypothesis" depending on whether she actually said/agreed to it, and
// callers elsewhere (not built yet -- future work) can promote/resolve a
// hypothesis once it's echoed back or acted on in a later chat.

// Type values here MUST exactly match the MemberMemories.type singleSelect
// choices already configured in Airtable (created alongside the table) --
// the airtable npm client rejects an unrecognized singleSelect value outright
// rather than silently accepting it, so this list is not just documentation.
const VALID_MEMORY_TYPES = [
  "identity",
  "active_work",
  "recurring_pattern",
  "activation_history",
  "method_progress",
  "preference",
  "realization",
];

const EXTRACTION_SYSTEM = `You extract durable facts about a coaching member from a single chat exchange, for a persistent cross-conversation memory system.

Only extract something if it is a genuinely meaningful, likely-to-still-matter-later fact.

Return strict JSON only, no markdown fences: {"memories": [{"type": "identity"|"active_work"|"recurring_pattern"|"activation_history"|"method_progress"|"preference"|"realization", "topic": "short label", "statement": "one sentence, third person, e.g. 'She is rebuilding her coaching business after a divorce.'", "status": "confirmed"|"hypothesis"}]}

Type meanings: "identity" = who she is / her Divine Identity or defining traits. "active_work" = what she's currently working on or focused on. "recurring_pattern" = a pattern she's named or that's shown up more than once. "activation_history" = an Activation or practice she's done and how it landed. "method_progress" = where she is in the GAP Method or another guided Method. "preference" = a stated preference about how she likes to be coached or what does/doesn't work for her. "realization" = a specific insight or realization she landed on in this conversation.

Do NOT extract: small talk, one-off venting with no lasting pattern, anything the coach said, anything she explicitly disagreed with or corrected, speculation she didn't confirm, anything that doesn't cleanly fit one of the seven types above.

status "confirmed" only if she stated it directly or clearly agreed with it. "hypothesis" if it's a reasonable read but she didn't explicitly confirm it. If nothing qualifies, return {"memories": []}. Never invent facts.`;

export async function extractMemoriesFromExchange({ email, chatId, userText, assistantText }) {
  const { createMemory } = await import("./airtable");
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: EXTRACTION_SYSTEM,
      messages: [
        { role: "user", content: `Member said: ${userText}\n\nCoach replied: ${assistantText}` },
      ],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    const memories = Array.isArray(parsed.memories) ? parsed.memories : [];
    const saved = [];
    for (const m of memories) {
      if (!m || !m.statement || !m.topic) continue;
      if (!VALID_MEMORY_TYPES.includes(m.type)) continue;
      const record = await createMemory({
        email,
        type: m.type,
        topic: m.topic,
        statement: m.statement,
        status: m.status === "confirmed" ? "confirmed" : "hypothesis",
        sourceChatId: chatId,
      });
      saved.push(record);
    }
    return saved;
  } catch (err) {
    // Memory extraction is best-effort -- never break the chat response over it.
    console.error("extractMemoriesFromExchange failed", err);
    return [];
  }
}

// Returns a short, prompt-ready block of the member's most relevant active
// memories. For now: all active memories, most recently updated first,
// capped -- a real relevance ranker (embeddings / keyword match against the
// current message) is future work, per the spec's own P8 priority ("relevant
// retrieval" is explicitly called out as a later step than basic storage).
export async function getRelevantMemoriesForPrompt(email, { limit = 12 } = {}) {
  const { listActiveMemoriesByEmail } = await import("./airtable");
  try {
    const records = await listActiveMemoriesByEmail(email);
    if (!records.length) return "";
    const top = records.slice(0, limit);
    return top
      .map((r) => {
        const f = r.fields;
        const tag = f.status === "confirmed" ? "" : " (unconfirmed)";
        return `- [${f.type}] ${f.statement}${tag}`;
      })
      .join("\n");
  } catch (err) {
    console.error("getRelevantMemoriesForPrompt failed", err);
    return "";
  }
}

// -----------------------------------------------------------------------
// Rolling chat summary (internal, keeps long threads' prompt small) -- PART 7.
// -----------------------------------------------------------------------

const SUMMARY_SYSTEM = `You maintain a short rolling summary of an ongoing coaching conversation, for the coach's own internal context -- not shown to the member. Update the summary given the previous summary (may be empty) and the newest exchange. Keep it under 150 words, third person, factual: what she's working on, what's been named/confirmed, where the conversation left off. Do not include your own commentary or coaching language, just the facts of what happened. Return only the updated summary text, no preamble.`;

export async function updateRollingSummary({ previousSummary, userText, assistantText }) {
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Previous summary: ${previousSummary || "(none yet)"}\n\nNewest exchange:\nMember: ${userText}\nCoach: ${assistantText}`,
        },
      ],
    });
    return resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch (err) {
    console.error("updateRollingSummary failed", err);
    return previousSummary || "";
  }
}

// -----------------------------------------------------------------------
// Auto-title (first exchange of a new chat) -- PART 4/6.
// -----------------------------------------------------------------------

export async function generateChatTitle(userText) {
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 20,
      system: `Generate a short chat title (3-6 words, no quotes, no trailing punctuation) summarizing what this coaching conversation is about, based on the member's first message. Return only the title.`,
      messages: [{ role: "user", content: userText }],
    });
    const title = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return title.replace(/^["']|["']$/g, "").slice(0, 60) || "New Chat";
  } catch (err) {
    console.error("generateChatTitle failed", err);
    return "New Chat";
  }
}
