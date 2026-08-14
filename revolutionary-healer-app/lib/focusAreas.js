// Focus-area registry: name, description, prompt, sources.
// Spec ref: SPEC.md §4.1. Rachael can add/edit these by writing a prompt and tagging
// transcripts -- this static list is the Phase-1 seed; Phase 2+ can read overrides
// from the FocusAreas Airtable table instead (see lib/airtable.js listActiveFocusAreas).

// Set DECIDED Aug 3 -- narrowed from an earlier 4-area draft (Intuition, Soul-Led
// Practice, Business, Prosperity) down to 3 at Rachael's request. Business and
// Soul-Led Practice were merged into one area: her own Kajabi catalog and voice
// profile (rachael-voice-and-audience-profile.md) treat business/leadership as a
// single theme ("Soul-Led Empire", "Leadership Vortex", "Business Empire
// Mentorships" are all the same cluster), while Intuition/Channeling and
// Prosperity each carry their own dedicated vocabulary and product line
// (Activation Hub / Spirit Connections vs. 5D Money Magnet / ProsperityPortal /
// "wealth energetics"), so those two stayed distinct.
export const FOCUS_AREAS = [
  {
    // Added Aug 14 (bug fix): the homepage hero chat box (public/app.html's
    // sendHeroChat) has always posted focusAreaSlug: "general" -- there was
    // never a matching entry here, so getFocusAreaBySlug() returned null and
    // /api/chat/route.ts's `if (!focusArea) return 404` rejected every single
    // message sent from the home page before it ever reached Claude. This is
    // the open-ended entry point (not tied to one of the three focus areas
    // below), so it gets a general-purpose description rather than a narrow one.
    slug: "general",
    name: "Open Coaching",
    description: "Whatever's live for you right now -- not tied to one specific focus area.",
    starterPrompts: [
      "I feel heavy after my last session, help me clear it.",
      "What's the GAP I'm not seeing right now?",
    ],
  },
  {
    slug: "intuition-channeling",
    name: "Intuition & Channeling Development",
    description: "Clearing the distortion behind self-doubt so you fully trust your own gifts and channel.",
    starterPrompts: [
      "How do I develop my intuition further?",
      "What's a practice to open up channeling safely?",
    ],
  },
  {
    slug: "soul-led-business",
    name: "Soul-Led Business & Leadership",
    description: "Stepping into visible, sovereign leadership -- building a practice that carries your mission, not just your income.",
    starterPrompts: [
      "I feel weird charging for this work, help me reframe it.",
      "Help me structure my next offer without overcomplicating it.",
    ],
  },
  {
    slug: "prosperity",
    name: "Prosperity",
    description: "Wealth energetics -- clearing the distortion around receiving so abundance can actually reach you.",
    starterPrompts: [
      "I feel guilty charging what I'm worth, help me shift that.",
      "Give me a money mindset reset before I send an invoice.",
    ],
  },
];

export function getFocusAreaBySlug(slug) {
  return FOCUS_AREAS.find((fa) => fa.slug === slug) ?? null;
}
