Rachel's Healer App — Product & Technical Specification
Client: Rachael (a healer who helps other healers) Prepared for: Rachael's Cowork (build agent) + Sarah Reference build: MoneyBot / House of Money (Sarah's live app) Working title: The Healer's Companion (name + domain TBD, see §14) Status: v1 spec — ready to build in Rachael's own Claude Last updated: August 2, 2026

-
0. How to read this document
This spec has two halves that share one structure. Sections 1–6 are the product and business spec (what the app is, who it's for, how it makes money). Sections 7–14 are the build spec (architecture, data model, deployment, roadmap). It is deliberately modeled on MoneyBot / House of Money, Sarah's live, revenue-generating app, so we reuse every already-solved decision instead of reinventing it. Those parallels are marked ↳ From MoneyBot.

The whole build will be executed inside Rachael's own Claude (Cowork), connected to Rachael's own accounts (already set up: Claude desktop + folder, Anthropic Console + API key, GitHub, Airtable; still to do: Vercel + domain, see §13).

-
1. Executive summary
Rachael's app is an AI companion that delivers Rachael's healing methodology on demand to other healers and practitioners. A member opens a chat, picks a Focus Area (a coaching lens), and gets guidance, quick practices ("energy hacks"), and guided activations/healings drawn directly from Rachael's recorded trainings. The bot is trained on Rachael's transcripts, so it speaks in her voice and teaches only her method.

It is an email-gated membership product held the same way House of Money is. A base membership gives ongoing access to the chat, focus areas, activations, and hacks. An optional higher tier can layer on live calls and a community (Telegram), exactly like the Prosperity Portal, if Rachael wants one.

The stack is identical to MoneyBot to keep risk low and launch fast: Next.js on Vercel, the Claude API for the chat, Airtable for users + content, email-based access gating, and GitHub → Vercel push-to-deploy.

-
2. The reference build: what we're copying from MoneyBot
MoneyBot is the template; understanding it makes the rest obvious.

↳ From MoneyBot — architecture in one paragraph. It's a Next.js app on Vercel. The front end (app/page.tsx) is a chat UI with selectable focus areas, each backed by its own system prompt. Messages hit a serverless route (app/api/chat/route.ts) that calls the Claude API with the focus area's system prompt plus the member's history and (optionally) a small per-member memory block so the bot remembers past chats. Users and content live in Airtable. Access is gated by member email. Config (model, keys, offer ids, checkout URLs) lives in Vercel env vars so behavior changes without a redeploy.

One-to-one mapping to Rachael's app:

MoneyBot concept
Rachael's equivalent
Energy Focus Areas
Healer Focus Areas (see §4.1)
System prompt per focus area
Same, built from Rachael's transcripts
MoneyBot base membership
Base healer membership
Prosperity Portal (add-on)
Optional higher tier (live calls + community), if desired
Full Energy Audit → upsell
Healer Calibration → upsell (see §4.4)
Activations (audio in chat)
Healings / attunements in chat
Energy hacks
Quick practices for healers
Cross-device chat memory
Same (server-side, keyed by email)
Email-gated access
Same

The genuinely new-vs-generic pieces carrying the most build risk are the same two as MoneyBot: media in chat (audio healings) and, only if Rachael wants it, the community tier. Everything else is a re-skin of a known-good system.

-
3. Product vision & positioning — DECIDED (Aug 3, Rachael's own words)
A Revolutionary Healer already knows they're here to revolutionize the world through their gifts, their consciousness, and their frequency. They see things differently than the average person. They can feel that they've been blessed with a mission and a purpose, and they're ready to reach their full potential and serve a larger community and impact — work that is heart-led, God-led, and in service of love, peace, and harmony for all.

They're at different stages of their awakening. Some are just learning about 5D ascension, consciousness, energy, and the quantum field. Others have spent years developing and activating their spiritual gifts and are ready to fully serve others through their work. Wherever they are, they are still running distortion in their field — often without knowing it. That's the real reason they aren't getting where they want to be yet, why it feels like they're only getting so far. It shows up as self-doubt, not trusting their own gifts, visibility issues, sensitivity to the collective frequency, ascension symptoms, and leaning on one-off activations or card pulls instead of their own inner wisdom.

The Revolutionary Healer exists to bring them back to themselves: to help them see the distortion running in their field, and help them feel empowered to move forward and revolutionize the world through their gifts and their mission. This is where healers come to fully activate their power, their spiritual gifts, and their mission — not a generic self-help tool, and not for beginners looking to discover they're intuitive. It's for practitioners who already know they're gifted and are looking for precision, leadership, and results.

This is not end-consumer positioning — it's mentorship between sessions, on demand: how to clear the distortion in their own field, how to hold space, how to read energy, how to lead a soul-led business, how to receive abundance without resistance. A healer who is depleted after a session, second-guessing what they picked up, or preparing to work with a client can open the chat and get a focused, on-method intervention in under a minute — one that names the distortion, not just soothes the symptom.

It wins on the same three things MoneyBot does: it is always available and always on-method (trained only on Rachael's material, so it never drifts into generic spiritual advice); it is action-shaped (every reply ends with something that moves the member toward fully activating their gifts and mission, not just information); and it is a funnel (free → base → optional higher tier is built into the experience).

-
4. Core concepts
4.1 Healer Focus Areas (the "modes") — DECIDED (Aug 3)
Each focus area is a distinct coaching lens with its own system prompt, tone, and slice of Rachael's material. Narrowed from an earlier 6-area draft, then a 4-area draft, down to 3 final areas, per Rachael — the 4→3 cut merged Business into Soul-Led Practice, since Rachael's own Kajabi catalog and voice/audience profile (rachael-voice-and-audience-profile.md) treat business and leadership as one theme ("Soul-Led Empire," "Leadership Vortex," "Business Empire Mentorships" are all the same cluster), while Intuition/Channeling and Prosperity each have their own dedicated vocabulary and product line and stayed separate:

Intuition & Channeling Development — strengthening the healer's own gifts, discernment, and channel.
Soul-Led Business & Leadership — clients, visibility, offers, and leading your practice from an aligned, sovereign place.
Prosperity — wealth energetics: money mindset, receiving, and abundance as a healer.

Each definition includes: a name + short description (shown in the UI), a system prompt (Rachael's voice + rules for that lens), the source transcripts it may draw from, a starter prompt or two, and any associated healings/practices. As in MoneyBot, focus areas are data + a prompt, not code — Rachael can add one by writing a prompt and tagging transcripts. Implemented in lib/focusAreas.js.

4.1a Guided Processes (new, Aug 3)
Distinct from a Focus Area: a Process is a named, scripted walkthrough Rachael already teaches, that the bot runs step-by-step rather than responding freeform. Selecting one immediately drops its starter prompt into the chat and begins it — "just choose it and start."

Quick-start (surfaced as chips right under the chatbox): GAP Method (button label, was "3 Step Gap Method"), 2.5 Second Shifts, Talk to Rachael (an unstructured, direct conversation in Rachael's voice — not a scripted method, and not a substitute for a real 1-1). These three are the ONLY things the bot itself is coded to run.

Implemented in lib/processes.js: each process has a chatPrompt (the trigger message, sent to the API but not shown to the member) and a promptAddendum (appended to the system prompt so Claude runs that specific process instead of generic focus-area coaching — see lib/prompts.js buildSystemPrompt and app/api/chat/route.ts's processSlug handling). GAP Method's real script is DONE (see §4.1c below, GAP_METHOD_SCRIPT_MEMBER) — 2.5 Second Shifts is still a placeholder (TODO in the code) pending Rachael's real material, same as the focus-area system prompts.

4.1c The 3 Step GAP Method / Divine Identity Framework — DECIDED (Aug 4, Rachael's full framework doc)
The GAP Method's content lives in a new registry, lib/divineIdentities.js (the 7 Divine Identities, Current Frequencies, GAP explanations, highest-leverage shifts, deep-dive questions, and Personalized Activations). This is an AI-guided frequency identification and transformation experience, not open coaching or a personality quiz.

Core rule, non-negotiable: the person is not becoming their Divine Identity — they already are it. The work is identifying and shifting the frequency preventing them from fully accessing, trusting, embodying, or expressing it. "You are not the Current Frequency. Your Divine Identity is who you are. The Current Frequency simply reveals the GAP that is ready to shift." This messaging philosophy applies throughout the Gap Method AND everywhere else in the app's bots (see lib/prompts.js's DIVINE IDENTITY TERMINOLOGY block, in every system prompt, not only the process addendum).

Terminology (customer-facing, never violate): Your Divine Identity (never "archetype," "personality type," "character type," "label," or "diagnosis") · Your Current Frequency · Your GAP · Your Highest-Leverage Shift · Your Personalized Frequency Diagnostic · Your Personalized Activation. Internal identity slugs (guardian, wayshower, leader, messenger, creator, healer, expander) are for code only and must never surface to a member.

The seven Divine Identities, each with a permanent identity + a corresponding temporary Current Frequency + a GAP explanation + a highest-leverage shift + a named Personalized Activation (full detail in lib/divineIdentities.js):
- The Guardian → Over-Responsibility → Nervous System Recalibration
- The Wayshower → Doubt → Removing the Frequency of Doubt
- The Leader → Hiddenness → Expansion Activation: Become Visible & Seen As You Expand Your Light
- The Messenger → Channel Interference → Activating Your Gifts
- The Creator → Control → Freedom Timeline Activation
- The Healer → Disconnection → NOT a single fixed activation (see note below)
- The Expander → Restriction → Success Code Activation

DISCONNECTION IS NOT ONE ACTIVATION (Aug 15, Rachael's explicit request) — Spirit
Connection Activation is retired and must never be recommended again, anywhere,
for any reason. The Healer does not automatically equal Disconnection, and
Disconnection does not automatically receive one preset activation -- Divine
Identity describes who she naturally is, the conversation determines what she is
currently experiencing, and the actual expression of that pattern determines the
activation. When the Healer's Disconnection is the active pattern, which
activation is recommended depends on how it is actually presenting:
- Disconnection from self / soul / identity / her own deeper knowing → Remembrance Activation
- Disconnection from spiritual gifts / gifts feel inaccessible or dormant → Activating Your Gifts Activation
- Difficulty trusting guidance that IS already coming through → Removing the Frequency of Doubt
- A specific desire to develop intuitive knowing → Intuition Activation
- Specific visual / psychic development → Third Eye Activation or Clairvoyance Activation
This logic lives in lib/divineIdentities.js (healer.recommendationLanguage /
personalizedActivation, for the main Revolutionary Healer chatbot), in
lib/processes.js (the DISCONNECTION SUB-PATTERN rule inside the GAP Method system
prompt, which has the Step 2 AI emit an invisible [[SUB_ACTIVATION: key]] marker),
and in public/gap-method.html (DISCONNECTION_SUB_ACTIVATIONS, read by setupDay3()
in place of the old static ARCHETYPES.disconnected.activation). The old
"gap-method-healer" entries in lib/activations.js's GAP_METHOD_ACTIVATIONS and in
public/app.html's GAP Method Activations card grid / ACTIVATION_DETAILS have been
removed entirely, not repurposed.

TWO SEPARATE GAP METHOD BOTS (corrected Aug 5) — Rachael was explicit these are two different experiences that must not be conflated:

A. The in-app, member-facing GAP Method (the LIVE one, wired into this app) — for members who ALREADY pay $30/mo or $347/yr, so it never sells anything. Button label is exactly "GAP Method" (lib/processes.js's PROCESSES entry, was "3 Step Gap Method"). Scripted in lib/processes.js GAP_METHOD_SCRIPT_MEMBER, and this is what app/page.tsx actually calls today.
- Auto-start: clicking the button begins the walkthrough automatically — the member never types or sees a starter prompt. app/page.tsx's startProcess() sends the trigger message to the API but only renders the assistant's reply, so it reads as the bot opening the conversation on its own. It also now carries this session's message history along (previously always empty), so if a member re-clicks the button mid-session the model can tell and use the "welcome back" acknowledgment rather than starting cold. Cross-session/device memory of a completed diagnostic is not built yet (Phase 2, see §7) — same limitation as the rest of chat memory.
- Opening script (verbatim in intent): "Welcome to the 3 Step GAP Method. We're going to identify the energetic GAP between who you divinely are and the frequency you're currently operating through. I'll guide you through three simple steps so we can uncover what is maintaining the pattern, identify your Highest-Leverage Shift and select the activation that will support you in closing the GAP. Let's begin with Step 1. I'm going to ask you a few short questions, one at a time. Answer with what feels most true for you right now. Question 1: When you think about the area of your life where you feel most stuck right now, what feels closest to your experience?" — with answer options in the same message.
- Step 1 (Identify the GAP): ~5–8 one-at-a-time multiple-choice/simple-answer questions, using WEIGHTED reasoning across the full answer set, not a mechanical one-answer-to-one-identity match (e.g. overworking from feeling unsafe → Guardian; overworking because money requires struggle → Expander; overworking to prove worth → Leader; overworking across too many ideas → Creator — same behavior, different root pattern). Never reveals the scoring system or which identity an answer maps to. Ends with a "Step 1 Complete" recognition moment (identity, frequency, 2–3 sentence GAP explanation, 3 recognizable patterns, a "this is not who you are" close), then immediately begins Step 2.
- Step 2 (Deepen the Diagnostic): 2–4 adaptive one-at-a-time deep-dive questions (per-identity question bank in lib/divineIdentities.js's deepDiveQuestions), then generates the FULL "Your Personalized Frequency Diagnostic" for free — Divine Identity, Current Frequency, The GAP, What Is Maintaining the GAP (non-absolute language only — "your answers suggest," never certainty), How the Pattern Is Appearing (3–5 examples personalized to their actual answers), Your Highest-Leverage Shift, and a Divine Identity Reminder.
- Step 3 (Recommend the Activation): no paid offer of any kind. Recommends the already-unlocked activation matching their diagnosed identity (Rachael's exact recommendation language per identity, in lib/divineIdentities.js's recommendationLanguage field) and offers to add it to their collection / listen now / save for later / explore another. TODO: there's no real "activations collection" data model yet (no Airtable field tracking which activations a member has added/completed) and the chat UI has no interactive buttons yet — the bot presents these as plain-text choices for now; both are flagged as follow-up build work, not solved here.
- Completion + restart handling: a short reconnect-to-the-shift message after the activation is opened, an invitation to come back and reflect, and — critically — every re-run is a fresh diagnostic (Current Frequency and active GAP can change even though Divine Identity tends to stay consistent); it briefly acknowledges a same-session repeat rather than assuming the old result still holds.

B. The pre-purchase / lead-gen funnel bot ("Step 2" in Rachael's own words — a different, NOT-yet-live experience for prospects who don't have Revolutionary Healer access yet) — kept as GAP_METHOD_SCRIPT_FUNNEL_UPSELL in lib/processes.js for possible future reuse, but NOT wired into this app's PROCESSES registry or called by anything today. This is the version that ends with "Unlock Your Personalized Frequency Diagnostic — $9" and routes to the matching identity's real $9 Kajabi checkout (FREQUENCY_DIAGNOSTIC_PRICE, getFrequencyDiagnosticCheckoutUrl in lib/processes.js). Today the live pre-purchase funnel is a separate, static, non-AI mockup (the-3-step-shifting-method.html) — this script is reference material for if/when that becomes a real Claude-run chat outside the member app.

Correction (Aug 4): the $9 Personalized Frequency Diagnostic is NOT a new generic product — it turns out to be whichever of the 7 already-built $9 activation offers (step3-activation-products-reference.md) matches the member's diagnosed Divine Identity. Those 7 offers were built in an earlier session under legacy "archetype" internal names (Overworker, Doubter, Hidden One, Foggy Channel, Gripper, Disconnected Gift, Underearner) that map exactly 1:1 onto Guardian/Wayshower/Leader/Messenger/Creator/Healer/Expander — same activation names, same $9 price. Real checkout URLs are now wired per-identity in lib/divineIdentities.js (personalizedActivation.checkoutUrl), and lib/processes.js exposes getFrequencyDiagnosticCheckoutUrl(slug) to route Step 3's unlock button. Open TODO: all 7 offers are still Kajabi status "draft" (confirmed Aug 4 via get_offer) — Rachael needs to publish each one before this goes live. The $9 price also lines up exactly with the existing Quantum Dollars conversion (90 QD x $0.10 = $9), so a member who's banked one activation's worth can redeem it free — no new math needed there.

4.1d My Revolution — DECIDED (Aug 5, Rachael's full "My Revolution" doc; navigation split REVISED Aug 4 per her "My Revolution Navigation System" doc)
My Revolution REPLACES the earlier "Your Activations" section/concept everywhere in the app and both HTML mockups. Its job is not to store content — it's to make the member feel "I can see my own transformation unfolding." Members reach it from two places, each with a different job:

1. Home Screen Preview — the compact section beneath the AI chatbot (id="my-revolution" in both mockups). UNCHANGED per Rachael's explicit instruction: still shows Today's Focus, a Favorites row, a My Activations grid, and a My Shifts list, exactly as it was before this revision. Its job is quick access without leaving the chat. Never disappears — it's always on Home, not a page you navigate away from.

2. My Revolution (dedicated page) — new. The nav's "My Revolution" link now opens this page instead of scrolling to the Home preview (see hierarchy below). Same four sections, same fixed order, but framed as a complete overview rather than a preview: full Today's Focus card, a Favorites preview (2 shown here, full spec calls for ~4-6) with "View All Favorites →", a My Activations preview with "View All Activations →", and a My Shifts preview (2 shown, spec calls for ~3 most recent) with "View All Shifts →" — each link opening that section's own dedicated page.

Fixed section order in both the Home preview and the My Revolution page: 🌟 Today's Focus, ❤️ Favorites, 🎧 My Activations, ✨ My Shifts. Philosophy, load-bearing: Methods create awareness, Activations support integration, Favorites give quick access to what a member relies on most, My Shifts preserve transformational milestones, Today's Focus keeps the next step clear, My Revolution tells the story of who you're becoming — the member is building their Revolution, not collecting activations. Designed so future sections (📈 My Progress, 📖 Journal, 🎖 Achievements, ⚡ Quantum Dollar History, 🏆 Milestones) can be added to the dedicated page later without a navigation redesign — V1 ships with only the four above.

Navigation hierarchy (Home → My Revolution → {Favorites, My Activations, My Shifts}; Go Deeper is a sibling of My Revolution, reached directly from Home/nav, not nested under it): clicking the logo or a page's "← Back to Home" returns to Home; clicking "My Revolution" in the nav opens the dedicated page; Favorites/My Activations/My Shifts each have their own dedicated page reached via "View All ___ →" and return via "← Back to My Revolution." Implemented as client-side view-swapping today (showPage(pageId)/showMain(), .page-view/.page-view.active) — see §4.1b for the full navigation-implementation note.

REVISED (Aug 5, Rachael's follow-up): added a new "Activations" top-nav item, a sibling of My Revolution and Go Deeper (not nested under My Revolution). It opens the same dedicated page as My Revolution's "View All Activations" link (id="activations-page" in both mockups) — one page, two entry points, no duplicate page to maintain. That page was restructured from a single personal-library view into three sections in this fixed order: 🎧 My Activations (activations the member has completed — a small personal subset, not the full catalog), ✨ Recommended Activations (what's been suggested by the AI Guide, plus anything not-yet-started), and 📚 Activation Library (every activation in the app, the full 29-card grid from §4.3, with the search box + filter chips). The Home preview's compact "My Activations" widget (§4.1d point 1, unchanged) still blends completed + recommended into one small grid for quick access — its "See all →" now effectively lands on the top (My Activations) section of this same hub page rather than a personal-only page, which is a natural fit since that section is what appears first.

🌟 Today's Focus (always first, only one active at a time): the app auto-derives it as the most recent Shift still in "Shifting" status (i.e. the newest unfinished GAP Method result) — never an Embodied one. A member can manually pin a different Shift as their focus, which overrides the "newest" default. Displays Divine Identity, Current Frequency, status (🟡 Shifting / 🟢 Embodied), the recommended activation, and a "Continue Your Revolution" button that opens the full saved Shift. Also shows two small activity lines (Rachael's own addition, Aug 4): "Last activity: [what they last listened to] [when]" and "Next suggested step: [the next nudge, e.g. a Progress Check-In]" — present on the card everywhere it appears (Home preview and the dedicated page), since showing one version with this content and one without would read as a bug, not a deliberate difference. Pure derivation logic: lib/shifts.js deriveTodaysFocus(shifts, { manualFocusId }).

❤️ Favorites: a small, intentionally curated set of activations the member has heart-marked, for fast daily access — separate from ownership. Un-hearting removes something from Favorites only, never from My Activations, and never touches listening history. Dedicated Favorites page ("My Favorites"): every favorited activation, each with Remove Favorite alongside Listen Now, plus a search box and a sort control (Most Recently Favorited / Alphabetical / Most Listened) — visual-only in the current mockup, no real search/sort wired up yet.

🎧 My Activations: every activation personally connected to the member, regardless of how it got there (purchased, added manually, recommended through a Method, included with membership, unlocked through Quantum Dollars, or admin-granted). Each card shows a heart icon and an optional, visually subtle listening status — Not Started / In Progress / Completed (lib/shifts.js LISTENING_STATUS). The activation itself, not its status, stays the visual focus.

REVISED (Aug 5): "View All Activations →" no longer opens a personal-only library — it opens the same three-section "Activations" hub page reachable from the new top-level Activations nav item (see the navigation-hierarchy note above and §4.3). My Activations' own section within that page shows just the completed cards; a separate Recommended Activations section (sourced from the member's most recent Shift's recommended activation, formerly the page's "Recommended For You" subsection) sits next to it; the search box + category filter chips (All / Recently Added / Recently Played / Completed / Not Started — single-select, visual only, same non-functional treatment as the process chips) and Date Added field now live under the third section, Activation Library, since those controls make sense for browsing the full 29-activation catalog, not the small personal set.

✨ My Shifts: saved transformational milestones from guided Methods — today, only completed GAP Method results (future Methods may add more). Each Shift stores Method name, Divine Identity (always the largest, most prominent element — never title a Shift by date alone), Current Frequency, completion date, and a progress status (🟡 Shifting / 🟢 Embodied ONLY — never "Completed," "Finished," or "Done," since the point is integration, not task completion). Opening a Shift ("View Shift") shows the full saved diagnostic — Divine Identity, Current Frequency, the GAP, What Is Maintaining the GAP, Highest-Leverage Shift, Recommended Activation, Progress — plus actions: Listen Now / Add to My Activations / ❤️ Favorite / Update Progress / Begin the GAP Method Again. Dedicated My Shifts page: the complete history, newest first. The mockups now carry two example Shift records to make "newest first" and the dedicated page meaningful — the existing Leader/Hiddenness result (Aug 4, Shifting) plus a second, newer one Rachael gave as her own example: Messenger/Channel Interference (Aug 8, Embodied, content drawn from lib/divineIdentities.js's real Messenger data). The shift-modal is now data-driven (openShiftModal(id), a small SHIFTS array, renderShiftModal()) rather than hard-coded to a single result, so each row opens its own correct diagnostic; calling it with no id still defaults to the Leader/Hiddenness result so the untouched Home preview's existing onclick="openShiftModal()" calls keep working unchanged.

Progress check-ins: the AI may occasionally invite reflection on a Shift ("looking back over the last several days, how does this pattern feel now?") with four suggested replies mapped to a suggested status update (lib/shifts.js PROGRESS_CHECK_IN_OPTIONS / suggestProgressFromCheckIn) — "it still feels very active" / "beginning to shift" → Shifting, "significantly different" / "embodied" → Embodied. The AI must never change a member's progress status without their confirmation.

Implemented in lib/shifts.js (SHIFT_PROGRESS, SHIFT_PROGRESS_LABELS, LISTENING_STATUS, deriveTodaysFocus, sortShiftsNewestFirst, suggestProgressFromCheckIn — all pure, dependency-free, same pattern as lib/entitlements.js). TODO(build, not solved here): there is no write path yet from a completed GAP Method conversation to an actual saved Shift record — app/api/chat/route.ts doesn't currently parse or persist structured diagnostic output anywhere, so lib/shifts.js defines the shape and the read-side derivation logic only; an Airtable Shifts table (see §8) plus an endpoint that saves a completed diagnostic is separate, not-yet-built work, same category as the activations-collection/quick-reply-button gaps already flagged in §4.1c. The search/sort/filter controls on the Favorites and My Activations pages are likewise visual-only — no real query logic behind them yet. Visually rebuilt in both the-revolutionary-healer-mockup.html and -gated.html (Home preview untouched; new dedicated My Revolution and My Shifts pages; enriched Favorites and My Activations pages; a "View Shift" modal reusing the Quantum Dollars modal's pattern, now dynamic per-Shift).

4.1b "Go Deeper" page — REWRITTEN (Aug 4, Rachael's "Go Deeper Page Build Instructions"); REVISED (Aug 6)
Corrects an earlier, wrong assumption (see the struck-through framing this replaced): the "Go Deeper" programs are NOT bundled into Full Access membership. They are standalone paid programs and a standalone private experience, explicitly NOT included with app access, NOT included with membership, NOT part of the chatbot, NOT part of the Activations library, and NOT automatically unlocked at any tier — the copy and code must never imply otherwise.

Top nav: the toolbar item that used to link directly to the $555 booking checkout as "Book 1-1" is now "Go Deeper," and opens a dedicated Go Deeper page rather than exiting straight to checkout. ("My Revolution" stays the nav label for the member space — Rachael's literal spec text said "Activations" here, but that would regress the Aug 5 My Revolution rename; confirmed with Rachael to keep "My Revolution.")

REVISED (Aug 6): Distortion Decode Method and Identity Method have been removed from the Go Deeper page entirely, per Rachael — "People should either be going to clear channel method or to 1-1 with me." Only Clear Channel Method remains under "Master the Method" (subsection heading and copy updated to singular), now styled as the featured/highlighted card (`.offer-card.featured`), alongside the Quantum Recode Session 1:1 under "Work Directly With Rachael." This is a deletion, not a hide — the two removed programs' card markup, lib/programs.js entries, and GO_DEEPER_OFFERS JS references were all removed (not hidden via CSS), so if Rachael wants them back later they'd need to be re-added from scratch or pulled from git history.

Page structure, in order: header ("Go Deeper" + intro copy + a visible-but-not-dominant clarification note restating the "standalone, not included" point) → Master the Method (heading + supporting copy + the Clear Channel Method offer card, featured) → Work Directly With Rachael (heading + supporting copy + the Quantum Recode Session card) → closing copy. Individual cards, not one long text block; left-aligned copy inside cards (no centered blocks). Each offer card: offer type label (smaller, e.g. "Program" / "Private Experience"), offer title (most visually prominent element), short headline, description, optional benefit list, price when relevant, one primary action button that opens the offer's real external sales/checkout page in a new tab.

Clear Channel Method is NOT a guided AI process — Rachael corrected this back in the original Aug 3 note: it's a real program that already exists in her Kajabi account (confirmed as Kajabi product 2148971348 via search_products). Implemented in lib/programs.js GO_DEEPER_PROGRAMS (kajabiProductId + checkoutUrl; null/PLACEHOLDER = TODO pending Rachael). checkoutUrl is intentionally a configurable field, not hard-coded into the page's visible copy, so Rachael can supply the real URL later without a code review of the page itself.

Quantum Recode Session ("Work Directly With Rachael," $555, private 1:1) is the same real product as the old "Book 1-1 with Rachael" link (Kajabi offer 2150516452, confirmed Aug 3) — renamed/reframed, not a new offer. Implemented in lib/programs.js QUANTUM_RECODE_SESSION, which imports BOOK_1_1_URL/BOOK_1_1_PRICE from lib/processes.js rather than duplicating them. This is the same underlying session referenced in the Quantum Dollars loyalty unlock (QUANTUM_RECODE_THRESHOLD in lib/quantumDollars.js) — that's a second, free-with-enough-savings path to the identical session, still blocked on Rachael providing a no-charge redemption link/coupon (see that file's TODO comment).

Navigation implementation today (mockups): the-revolutionary-healer-mockup.html and -gated.html implement My Revolution, Activations, Favorites, My Shifts, Go Deeper, My Profile, and Membership Management as dedicated "pages" via client-side view-swapping, not real separate URLs (JS: showPage(pageId) / showMain(), CSS: .page-view / .page-view.active). Top nav (Aug 5): My Revolution, Activations, ⚡ Quantum Dollars (modal, not a page), Go Deeper, plus the My Profile pill — Activations added per Rachael's follow-up, a sibling of My Revolution and Go Deeper, not nested under it. My Profile is reached directly from the nav and sits off Home as a sibling; My Revolution's three sub-pages (Favorites, My Activations, My Shifts) nest under it per §4.1d, though the Activations top-nav item and My Revolution's "View All Activations" link both resolve to the same page (id="activations-page") rather than two separate destinations; Membership Management nests under My Profile per §4.1f. That shared Activations page's three sections — My Activations, Recommended Activations, Activation Library — replace what used to be a single library grid with a "Recommended For You" subsection; Recommended Activations is the "recommended by the AI chat" piece Rachael originally asked for. In the real Next.js app these should become real routes (e.g. /my-revolution, /activations, /favorites, /shifts, /go-deeper, /profile, /profile/membership) rather than client-side section toggling — not yet built, same category as the other Phase 2 gaps in this doc.

4.1f My Profile — DECIDED (Aug 4, Rachael's "My Profile" doc)
Replaces the nav's plain email-address pill with a "My Profile" link/button (member-pill styling reused, now clickable). The member's email must never be displayed directly in the nav again — it only appears inside the Profile section of this page. Opens a dedicated page with five sections, in this fixed order: 👤 Profile, 💜 Membership, 💳 Billing, 🔒 Security, 🛟 Support. Designed so future sections (Notifications, App Preferences, Communication Preferences, Connected Accounts, Privacy Settings, Language, Referral Program, Affiliate Dashboard) can be added without restructuring — V1 ships with only the five above. Philosophy: simple and familiar, not an advanced-settings dashboard — a member should immediately know where to update their info, manage membership, update billing, reset their password, or reach support, without contacting Rachael for any of it.

At the top of the page (added Aug 4, Rachael's follow-up): a personalized welcome header — "Welcome back, Rachael. Member since August 2026." — plus a "🌟 Your Revolution" stats card (12 Activations Completed, 4 Embodied Shifts, ⚡ 1,180 Quantum Dollars, 58 Days Transforming), all static example values in the mockup. Flagging two loose ends rather than silently reconciling them: (1) 1,180 Quantum Dollars here doesn't match the 180-balance shown in the Quantum Dollars modal elsewhere in the same mockup — both are illustrative, but a real member would only have one true balance, so these need to agree once real data is wired in; (2) "58 Days Transforming" doesn't line up with "Member Since August 2026" plus the Aug 3 join date shown lower on the page (58 days would put joining in June). Not fixed here since Rachael gave these as a specific set of numbers rather than asking for derived/consistent ones — surfacing for her to confirm intent.

👤 Profile: profile picture (Upload/Replace/Remove — no real upload backend yet, buttons are present but inert in the mockup), Display Name, Email Address (with a hint that changing it requires verification via a confirmation link — no real verification flow built), Phone Number (optional), Time Zone (optional, select — supports future reminders/scheduling), and a Save Changes button (not wired to persist anywhere yet).

💜 Membership: Current Plan, Membership Status (Active/Trial/Paused/Cancelled — mockup shows Active), Member Since, Renewal Date, and a "Manage Membership" button that opens the dedicated Membership Management page (§ below).

💳 Billing: Current Payment Method, Next Payment (date + amount), and a Billing History log (reusing the Quantum Dollars modal's .qd-log-row pattern). Buttons: Update Payment Method (not wired), Download Receipt (shown disabled — "future feature if supported" per Rachael's spec). Correction: Rachael's spec used "$78.00" as an illustrative example price; the mockup uses the real $30.00/month Full Access price instead so it stays internally consistent with the rest of the app (same judgment call as the "70 vs 320 Quantum Dollars" correction in the Quantum Dollars modal) — flagging this explicitly in case Rachael meant something specific by that number.

🔒 Security: Password (masked) + Reset Password button (not wired to a real auth flow). Two-Factor Authentication, Manage Logged-In Devices, and Recent Login Activity are intentionally NOT shown at all in V1 — Rachael's spec says these "may remain hidden until implemented," so unlike Billing/Support's disabled-with-"(coming soon)" treatment, these are simply absent rather than shown-but-inert.

🛟 Support: "Need help?" copy + a Contact Support button (mailto: link, address held in a SUPPORT_EMAIL config var, same configurable-not-hardcoded pattern as GO_DEEPER_OFFERS — TODO(Rachael): confirm the real support inbox, currently a placeholder guess at support@rachaelsbutterflyeffect.com) and a disabled "Frequently Asked Questions (coming soon)" button per the spec's "future feature" note.

Membership Management (dedicated sub-page, nested under My Profile): View Current Plan (plan, status, price, renewal date, and a "What's Included" benefits list pulled from the real Full Access feature set in §6) — Change Plan, mapped onto the real product structure rather than an invented tier: "Upgrade to Annual ($347/yr)" is the actual upgrade path since Full Access only has one paid tier with a monthly/annual choice today (no lower paid tier exists to "downgrade" into); "Pause Membership" shown disabled per Rachael's "future feature if offered" — Cancel Membership, styled as a distinct destructive-outline button with a plain browser confirm() dialog for mockup realism (no real cancellation logic; this is a static prototype, not wired to Kajabi).

TODO(build, not solved here): none of Profile/Membership/Billing/Security's actions actually persist or call any API yet (no profile-picture upload, no email-change verification flow, no payment-method update, no password reset, no plan-change or cancellation logic) — this whole page is UI/UX only, same category as the other not-yet-wired interactive elements flagged throughout this doc (activations-collection buttons in §4.1c, search/sort/filter in §4.1d).
4.2 Quick Practices ("energy hacks")
Short, repeatable interventions — a grounding, a clearing breath, a protection practice, a 60-second reset — pulled from Rachael's trainings. The bot offers them contextually and on demand. Stored as structured, taggable content so the bot retrieves the right one rather than improvising.
4.3 Healings / Activations (audio in chat)
Rachael's guided audio practices — healings, attunements, meditations. Delivered the same phased way as MoneyBot:

Phase 1 (launch): rich link cards in the chat; audio streams from an inline player. Media hosting note (REVISED Aug 5 — see below): the original plan was to re-host media on a separate host (Vimeo/YouTube unlisted, or an audio host); the first real activations pulled in instead use Kajabi's existing Wistia embeds directly, which turned out not to need re-hosting at all. The app still never hosts or streams large media itself, and the model only ever sees metadata, never media bytes.
Phase 2: native in-chat player with progress + "mark complete," and gating so some healings are higher-tier only.

Scope — DECIDED (Aug 3): ALL activations in Rachael's Kajabi catalog get pulled into the app's Activations library for Full Access members, not just the 7 archetype activations built for the $9 Step 3 offers. The 7 archetype activations remain the low-ticket, single-purchase entry point (see step3-activation-products-reference.md); Full Access ($30/mo or $347/yr) is what unlocks the full library plus ongoing bot access, exactly as designed in the Quantum Dollars/entitlement model.

First real batch pulled in — RESOLVED (Aug 5): the "no real activations collection data model yet" TODO (previously flagged in §4.1c and §4.1d) is now partly solved. Rachael pointed at her "Activate Your Clairvoyance in 30 Days!" course (Kajabi product 2147937485) — a "30 Days of Activations" module containing 29 day-submodules (Day #1 through Day #29), each a single lesson with one guided activation attached. Pulled via the Kajabi MCP's get_course tool (courses toolset) and built into lib/activations.js: 29 entries (day, slug, title, mediaType, wistiaId, kajabiLessonId, adminUrl).

Key discovery that simplifies Phase 1 above: every lesson's media in this course is Wistia-hosted (get_course returns `media: { type, id, wistia_id }` per lesson), NOT a raw Kajabi media-library file. Wistia hashed IDs are stable, unlike Kajabi media-library links, which are signed S3 URLs that expire (~7 days — see the note on `image_url` in step3-activation-products-reference.md). So there is no re-hosting or URL-refresh problem for this content: `WISTIA_EMBED_BASE + wistiaId` (lib/activations.js) is a standing, reusable embed URL — TODO(verify): confirm Rachael's Wistia project allows embedding outside kajabi.com before wiring a real `<iframe>`/player, since domain restrictions are configurable per Wistia project and haven't been checked.

Entitlement: no separate Kajabi offer exists per day — all 29 are bundled inside the one course, so they unlock entirely under the existing "ALL activations... for Full Access members" decision above, same as everything else in the library. kajabiCourseId/kajabiLessonId are kept per entry for provenance, not because each day is separately purchasable.

Two of the 29 real titles ("Expansion Activation," Day 9; "Nervous System Recalibration" and "Activating Your Gifts," Days 23–24) happen to match placeholder example names already used in both HTML mockups before this pull — coincidence, not a deliberate match, but confirmed now as real content. No Divine Identity mapping was attempted for the 29 — Rachael asked for them brought in as-is; tagging each to one of the 7 identities is unrequested interpretive work and is left as a future TODO. Visually wired into both the-revolutionary-healer-mockup.html and -gated.html: the dedicated My Activations page's card grid now shows all 29 real activations (day number, title, Wistia media type) instead of the 3 placeholder cards. The compact Home preview grid was left untouched, same "don't touch this section" rule as the rest of My Revolution's Home preview.

Still open: this is a single course (29 activations). Rachael's Kajabi catalog has 60+ other course products, several with "Activation" in the title (Starseed Activation Series, Lions Gate Portal Activation, 9:9 Portal Activation, Psychic Activation Vault, and others) that were not investigated — most of her catalog is full multi-week courses, not short single-session guided activations, so pulling further batches needs the same curation-first approach (Rachael points at a specific course/module, not a bulk "import everything" pass) rather than assuming every course maps onto this pattern.

Nav/page restructure (Aug 5, same follow-up as the top-nav Activations item): once all 29 were visible in one library grid, Rachael asked for a clearer separation between "everything in the app" and "my own activations" — see §4.1d's Aug 5 revision for the full navigation writeup. Short version: the 29-card grid above now lives under a 📚 Activation Library section on the shared Activations page (reached from the new top-nav "Activations" item or from My Revolution's "View All Activations"), alongside two smaller sections — 🎧 My Activations (completed only) and ✨ Recommended Activations — so the full catalog is browsable without crowding the member's personal view.

Card redesign + Activation Detail page (Aug 5, second follow-up): Rachael asked for three more things on top of the restructure above, all now implemented.

1. No source info on cards. Cards no longer show "Day N" or "Activate Your Clairvoyance in 30 Days" anywhere — members only ever see the activation's own name. `lib/activations.js` keeps `day`/`kajabiCourseId`/`kajabiLessonId` for internal provenance only; the UI layer must never render them.

2. Titles renamed to read as "___ Activation." Rachael's rule: "instead of just saying Grounding, it's Grounding Activation." Implemented as `kajabiTitle` (the real, original Kajabi lesson title, kept for reference) vs `title` (the member-facing name, with "Activation" appended wherever the raw title didn't already contain that word). 23 of 29 titles needed no change (e.g. "Expansion Activation," "Merkabah Activation" already read that way); 6 got "Activation" appended. Four auto-appended results read a little awkwardly and are flagged in `lib/activations.js`'s header comment for Rachael to reword if she'd like something more natural: Day 5 ("Clearing Black Magic, Attachments & Negative Entities Activation" — long), Day 19 ("10 Min Grounding Meditation Activation" — stacks "Meditation" and "Activation"), Day 24 and Day 25 ("Activating Your ___ Activation" — repeats the "activat-" root).

3. Mini description per card. Rachael was torn between a short description and a "suggested for [Divine Identity]" tag, and asked for the description version first — write one for anything I'm confident about, leave the rest blank with a list for her to fill in. Implemented as a `description` field on each `ACTIVATIONS` entry, rendered as `.media-description` under the title on the card and again on the detail page. Written with real confidence for 23 activations built on well-established, generic energy-work concepts (grounding, protection, chakra balancing, soul retrieval, clearing, third eye/pineal gland, DNA activation, meeting guides, etc.).

   RESOLVED (Aug 5, same day): Rachael supplied real copy for the remaining 6 that were specific to her own proprietary framework/mythology. Lightly adapted to match the one-sentence style of the other 23, per her note to "shift these to align better with your current layout" — meaning, hers, reworded for consistency, not rewritten:

   - Day 4 — Pink Cloud Activation: "Lifts years of dense energy in just a few minutes, helping you transform into a higher frequency."
   - Day 5 — Clearing Black Magic, Attachments & Negative Entities Activation: "Clears on a deeper level, releasing black magic, attachments, and negative entities so nothing invisible is left holding you back."
   - Day 15 — Emerald Dragon Activation: "Activates your royalty codes, helping you step into your king or queen energy so nothing holds you back."
   - Day 16 — Merkabah Activation: "Activates your light body and builds coherence in your merkabah, supporting you in raising your vibration."
   - Day 17 — Crystalline Dragon Activation: "Crystallizes your frequency, aligning you more fully with your soul."
   - Day 20 — Sophia Dragon Activation: "Builds confidence and leadership, supporting you as a reborn leader ready to truly step into your leadership."

   All 29 activations now have a real description, both on the card and the detail page. `lib/activations.js` still exports `getActivationsMissingDescription()` as a safety check (should return an empty array). The "suggested for [Divine Identity]" tag idea Rachael floated is still NOT implemented — no Divine Identity-to-activation mapping exists for these 29 (same open TODO noted above), and it's a separate decision from the description work done here.

4. Clickable cards → shared Activation Detail page. Every card in the Activation Library, plus the three Library-sourced cards duplicated elsewhere (Nervous System Recalibration and Activating Your Gifts in the two `activations-page` preview sections, both retitled to match; Expansion Activation in Recommended Activations), now opens `id="activation-detail-page"` via `onclick="openActivationDetail(slug)"`. One dynamic page-view, not 29 separate ones — same architectural pattern as the shift-modal (`SHIFTS`/`renderShiftModal`/`openShiftModal(id)`): a JS object `ACTIVATION_DETAILS` (title, description, wistiaId per slug, mirroring `lib/activations.js`) populates `#activation-detail-title`, `#activation-detail-description`, and injects a Wistia `<iframe>` (`WISTIA_EMBED_BASE + wistiaId`) into `#activation-detail-player`, then calls `showPage('activation-detail-page')`. Heart-button clicks inside a clickable card call `event.stopPropagation()` first so favoriting doesn't also open the detail page. "Removing the Frequency of Doubt" (one of the 7 $9 archetype activations, not part of the 29-day course) is intentionally left non-clickable — it has no Wistia ID in this registry, a real gap flagged here rather than silently worked around; wiring it would mean building a second, differently-sourced detail-page data path.

TODO(build, not solved here): the Wistia iframe is wired with a real, working embed URL, but nothing plays it in the mockup sandbox — same category as every other "visual/UI only" gap in this doc. No "Add to My Activations" persistence, no real listening-status tracking from the detail page, and the "suggested for [Divine Identity]" tag is still an open design decision for Rachael, not just a build gap.

RESOLVED-DIAGNOSIS (Aug 6): investigated why activations "can't play" per Rachael's report. Confirmed via get_course (site 2147567473, course 2147937485) that every lesson has a real, resolving Wistia ID (e.g. Grounding = wistia_id "shyqht7zcb"), and confirmed via a direct fetch of the embed URL (https://fast.wistia.net/embed/iframe/<id>) that it returns a valid embeddable page with correct video metadata — not a 404 or error page. The Kajabi MCP tools available (products/courses/media toolsets) do not expose any video domain-restriction or embed-privacy setting; that setting lives on Wistia's side. Per Wistia's own docs, Wistia accounts have an account-level "Domain Restrictions" feature (Wistia Account Settings → Domain Restriction) that, when enabled, only allows embeds to render on an allowlisted set of domains (e.g. rachaelsbutterflyeffect.com / mykajabi.com) and shows a blank/white box everywhere else — this exactly matches the "activations won't play" symptom outside Kajabi's own domain. This setting is on Wistia's account settings page (requires Wistia Account Owner access), not inside Kajabi's admin UI, and is not reachable through any Kajabi MCP tool — so it could not be fixed directly. Action needed from Rachael: log into the Wistia account linked to her Kajabi site and either (a) disable Domain Restrictions entirely, or (b) add the Revolutionary Healer app's real domain (once it has one) to the allowlist. Until then, the embeds will only reliably play on Kajabi's own domain, not inside the standalone app mockup/preview.

4.1g $9 Paid Trial + Trial Upgrade Banner — NEW (Aug 6, Rachael's request)

Rachael's ask: someone lands on the free 3 Step GAP Method opt-in (the-3-step-shifting-method.html), and at Step 3, instead of the $9 purchase being framed as just "unlock your one personalized activation," it now bundles in a 3-day Full Access trial — every activation, unlimited chat, the whole app — so the $9 buyer gets a real taste of full membership, not a locked single item. If they want to stay past 3 days, they upgrade to $30/mo or $347/yr.

This is a genuinely new entitlement concept, distinct from the pre-existing free/no-purchase trial (§7, `TRIAL_DAYS`/`TRIAL_CHAT_LIMIT` in `lib/entitlements.js` — 7 days, chat-limited, signup-only, grants base access only). The new one is paid, unlimited, and full-tier:

- `lib/entitlements.js` — added `paid_trial_started_at` handling: `onPaidTrial`, `paidTrialExpired`, `paidTrialDaysRemaining` derived the same way as the existing trial fields (day-count vs. `PAID_TRIAL_DAYS`, default 3, env-configurable). `canUseTier` now returns true for `tierActive OR onPaidTrial` — a paid-trial member reads as fully entitled to the whole library without needing a real subscription yet.
- No new Kajabi product needed. All 7 existing $9 Step 3 offers (step3-activation-products-reference.md) now grant the same 3-day trial in addition to their specific activation — this is backend/webhook logic (whichever of the 7 offers fires, set `paid_trial_started_at = now()` on that member's Airtable record), not a new checkout page. TODO(build, not solved here): `app/api/webhooks/route.ts` doesn't do this yet — today it only flips `member_active`/`tier_active`, same pre-existing gap noted elsewhere in this doc for Quantum Dollars crediting.

4.1h Founding Beta Funnel — NEW (Aug 6, Rachael's request)

Rachael's ask: a custom, standalone checkout page for a 20-person "Founding Beta" of the Revolutionary Healer App — $79 one-time for 6 months of Full Access, tagged `RHBeta` on purchase, with her real custom service agreement on the checkout, a $55 VIP Experience (private Telegram group, group-coached through the 3 Step GAP Method by Rachael once the app is live) as an order bump, and a 6-month-later email sequence inviting them to upgrade to a new $997 Lifetime Access offer. Structural layout only (hero → pricing → benefits → checkout, dark/gold branding) was informed by a reference checkout page Rachael's mentor sent her — none of that page's specific copy, icons, or branding were reused; everything here is original Revolutionary Healer content in the app's existing black/gold/taupe palette (`#121110`/`#1B1815`/`#CFA646`/`#A9997F`/`#F6F2E9`, same tokens as the two HTML mockups).

**What was built, all live in Rachael's real Kajabi account (site `2147567473`), all created as DRAFTS — nothing is publicly purchasable until Rachael publishes each one in the Kajabi admin UI:**

- **Founding Beta offer** — id `2151324817`, "Revolutionary Healer App - Founding Beta (20 Spots)," $79 one-time, linked to the same 7 activation-course `product_ids` as the existing Full Access Membership offers so purchasers get real Kajabi course access immediately. Checkout: `https://www.rachaelsbutterflyeffect.com/offers/jdve2X7m/checkout`.
- **Lifetime Access offer** — id `2151324815`, "Full Access Membership - Lifetime," $997 one-time, same 7 `product_ids`, this is the destination link in the upgrade email sequence below. Checkout: `https://www.rachaelsbutterflyeffect.com/offers/RXeVjwYF/checkout`.
- **VIP Experience offer** — id `2151324816`, "VIP Experience - Telegram GAP Method Group," $55 one-time, no linked Kajabi product (delivery is external, via Telegram, since Kajabi has no native Telegram integration). Post-purchase custom thank-you message delivers the real invite link Rachael provided (`https://t.me/+6oPqw6vtrZAxMWQx`) directly on the confirmation page.
- **Beta checkout page theme** (theme id `2167116683`, attached to the Beta offer) — built via `update_theme_content`: a hero section (headline + $79/6-months subhead + gold CTA), a "What You Get" benefits panel (reusing the offer's own saved description/benefit copy, not new claims), a tasteful "20 Spots Only" scarcity line, and — directly above the native Kajabi checkout block — the full adapted service agreement text (see below), rendered as a scrollable text panel. The native `offer_embedded_checkout` block itself (payment fields) was left completely untouched.
- **Service agreement** — adapted from Rachael's real, existing "Full Access Membership" Terms of Use (which she pasted in directly and gave explicit permission to reword: "You can shift these to align better with your current layout"). The adaptation strips the recurring-billing/auto-renewal language (not applicable — this is a single $79 charge) and replaces it with one-time-payment terms plus an explicit "6-Month Access Term" clause stating access ends after 6 months unless the member separately chooses to upgrade. Full text saved at `rh-beta-service-agreement.md` in the outputs folder and embedded verbatim in the checkout theme. Kept the same No Refunds / No Chargebacks / Entire Agreement structure as the original.
- **`RHBeta` contact tag** — created (id `2150293095`), 0 contacts so far (nothing published/sold yet).
- **6-month upgrade email sequence** — "RHBeta - Upgrade to Lifetime" (sequence id `2148870350`), 3 emails, classic HTML editor, day-offsets from whenever a contact is added to the sequence: day 165 ("heads up, access winds down soon"), day 175 ("here's what Lifetime includes," links the real $997 checkout), day 180 ("access ends today," links the real $997 checkout, no-pressure framing). **Known issue:** email 1 (day 165) has a broken CTA link — I mistakenly used a non-existent Liquid variable (`{{ site_url }}`) instead of the real Lifetime checkout URL; there's no API tool to edit an existing sequence email's body, so Rachael needs to open that one email in the Kajabi admin UI and swap the link text for `https://www.rachaelsbutterflyeffect.com/offers/RXeVjwYF/checkout` (emails 2 and 3 already use the correct real URL).
- **`lib/entitlements.js`** — extended with a third time-boxed access grant (`onBetaMembership`/`betaMembershipExpired`/`betaMembershipDaysRemaining`, driven by `beta_member_started_at`, `BETA_MEMBER_DAYS` default 180, env-configurable), same shape as the existing `onPaidTrial` pattern. `canUseTier`/`canUseBase` now also return true for an active Beta membership. **This is the actual 6-month enforcement mechanism** — see the important caveat below.

**Real limitations Rachael needs to know about (not build gaps I can silently fix — these are Kajabi/Wistia platform constraints or decisions that need her action):**

1. **The 6-month cutoff is NOT enforced by Kajabi.** A one-time Kajabi purchase grants permanent course access; there is no API field (and I didn't find an admin-UI equivalent either) to make Kajabi course access itself expire after N days. The 6-month term is enforced entirely by the app reading `onBetaMembership` from `lib/entitlements.js` above — which depends on the webhook setting `beta_member_started_at = now()` on purchase of offer `2151324817` (same category of TODO as the existing `paid_trial_started_at` and Quantum Dollars webhook gaps — `app/api/webhooks/route.ts` doesn't do any of this yet).
2. **No native "require agreement checkbox" gate exists via API.** The service agreement is a visible, scrollable text panel on the checkout page (same as any other Kajabi checkout copy) — it is not a blocking "I agree" checkbox the buyer must check before paying. If Rachael wants a hard legal gate, that requires either a Kajabi-native setting reachable only from the admin UI (unconfirmed whether one even exists) or a custom checkout build outside Kajabi.
3. **The RHBeta tag is not yet applied automatically on purchase.** The Kajabi MCP tools expose no way to create or edit automations (workflows) — only `list_automations`, and even that reports the automations capability isn't fully rolled out for this account yet. Rachael needs to build this manually in Kajabi admin: **Automations → New Automation → Trigger: "Purchased [Revolutionary Healer App - Founding Beta (20 Spots)]" → Action: "Add Tag: RHBeta."**
4. **The $55 VIP Experience order bump is not yet attached to the Beta checkout.** Kajabi's order-bump attachment (choosing which existing offer shows as a bump on another offer's checkout) is an admin-UI-only setting with no API field. Rachael needs to open the Beta offer's checkout settings in Kajabi admin and add "VIP Experience - Telegram GAP Method Group" (offer `2151324816`) as an order bump.
5. **All 3 new offers are drafts.** Nothing is purchasable until Rachael publishes each of the 3 new offers (`2151324817` Beta, `2151324815` Lifetime, `2151324816` VIP Experience) from the Kajabi admin UI, same as every other MCP-created offer in this project.
6. **No thumbnail images uploaded** for any of the 3 new offers — same pre-existing platform limitation as the original 7 activation offers (Kajabi's media upload has no API path, only a native file picker a human has to drive).

**UPDATE (Aug 10) — first 9 real purchases, welcome flow built:**

By Aug 10, 9 real people had purchased the Founding Beta offer (`2151324817`) with no welcome touchpoint sent yet. Built:

- **"RHBeta - Welcome" sequence** (id `2148871749`), 1 email at day 0 ("You're in! Welcome to the Founding Beta"), written from Rachael's own dictated message — confirms founding status, explains she's still finishing things behind the scenes, sets an honest ("hoping," not promising) expectation of access as early as end of week.
- **All 9 existing purchasers retroactively tagged `RHBeta`** (found via `search_contacts` filtered on `has_offer_id: 2151324817` — confirmed exactly 9, matching Rachael's own count).
- **New segment "RHBeta Founding Members"** (id `2148713123`, dynamic filter on the `RHBeta` tag) — reusable for any future RHBeta-targeted broadcast or reporting.
- **One-time broadcast "RHBeta - Founding Members Check-in (Aug 10)"** (id `2158320840`, DRAFT, 9 estimated recipients via the segment above) — the "hey, you're in, hang tight" touchpoint Rachael dictated, sent to the 9 people who already paid. **Still needs Rachael to review and hit Send from the Kajabi admin UI** (`list_broadcasts`/`create_broadcast` can only create drafts, sending is admin-UI-only, same pattern as every other write-then-publish-manually flow in this doc).
- **Automations are still not usable via API for this account.** The Kajabi MCP surfaced new automation tool schemas (`create_automation`, `list_automation_triggers`, etc.) on Aug 10, but calling them returns "automations MCP tools are not enabled for this account yet — still being rolled out" — same practical blocker as before, just with better tooling waiting in the wings for when Kajabi finishes the rollout. **Rachael still needs to manually build ONE automation in Kajabi admin:** Trigger "Purchased [Revolutionary Healer App - Founding Beta (20 Spots)]" → Actions: "Add Tag: RHBeta" AND "Subscribe to Sequence: RHBeta - Welcome." Once that's live, every future purchaser gets tagged and welcomed automatically with no more manual check-ins needed.
- `lib/processes.js` — `GAP_METHOD_SCRIPT_FUNNEL_UPSELL`'s Step 3 invitation rewritten: replaces the old "24-hour access to the limited version of the AI app, as a Quantum Dollars bonus" bullet with "3 full days of Full Access to Revolutionary Healer — not a limited/preview version," and adds a soft close inviting them to upgrade during or after the 3 days, no pressure either way.
- `the-3-step-shifting-method.html` — Step 3's unlock button and reward copy updated to match ("Get my activation + 3-day Full Access — $9 →"), for both the locked and just-unlocked states.

Trial Upgrade Banner (both Revolutionary Healer mockups): a slim gold banner between the nav and the rest of the page, "⏳ N days left in your Full Access trial" + a "Trial — Upgrade Now →" button. Always visible in the static mockup as an example state (same pattern as other static example data throughout this doc, e.g. the Quantum Dollars balance) — TODO(build): the real app should only render `#trial-banner` when `onGapTrial` is true, and drive `#trial-days-remaining` from `gapTrialDaysRemaining` (renamed, see §4.1i) instead of the hard-coded "2".

4.1i Flipped GAP Method Funnel + Scoped Trial — NEW (Aug 10, Rachael's request, replaces the paid-trial design in §4.1g)

Rachael's ask, verbatim intent: instead of walking people free through Steps 1-2 of the 3 Step GAP Method and only asking for $9 at Step 3, flip it — charge $9 up front, then Steps 1-2-3 all run with zero paywall, Step 3 delivers the fullest possible diagnostic, and clicking into the recommended activation grants instant 3-day Full Access with no second payment. Within those 3 days, only the 7 "GAP Method" activations are actually unlocked — everything else in the 29-activation library shows up with a small gold padlock, visible but not playable, until the member upgrades to real Full Access. Confirmed via a quick clarifying round: (1) one shared app with different unlock states, not two separate builds, (2) the 7 old per-identity $9 offers are retired in favor of one unified front door, (3) locked activations stay visible with a gold lock rather than being hidden, (4) the "comment a trigger word → auto-DM the checkout link" piece is Instagram/social comment automation, entirely outside Kajabi and outside any tool connected here — Rachael is handling that piece herself.

**New unified $9 offer (the new front door):** "The GAP Method - Frequency Diagnostic + 3-Day Full Access," Kajabi offer id `2151330100`, $9 one-time, linked to the same 7 activation-course `product_ids` as the other Full Access offers. Checkout: `https://www.rachaelsbutterflyeffect.com/offers/MHfLjoeC/checkout`. Custom black/gold/white checkout theme (id `2167148658`) built in layers across this session: Hero → "Imagine" (5 future-pacing beats) → "Who This Is For" (5 qualifying checkmarks) → "What's Included" (frequency diagnostic + 3-day Full Access) → closing hook line → native Kajabi checkout.

**The 7 old per-identity $9 offers are RETIRED as entry points** (per Rachael's confirmation). `lib/divineIdentities.js`'s `personalizedActivation.kajabiOfferId`/`checkoutUrl` fields are left in place as historical data (untouched, not deleted), but no script or page should route anyone to pay again at those old links — the single `2151330100` checkout above is now the only paid entry point into the GAP Method. `lib/processes.js`'s old `FREQUENCY_DIAGNOSTIC_PRICE`/`getFrequencyDiagnosticCheckoutUrl` helpers are marked "RETIRED (Aug 10)" in comments and are dead code (not imported/called anywhere), kept rather than deleted for history.

**Entitlement model rebuilt (`lib/entitlements.js`), renamed from the §4.1g "paid trial" design:**
- `onPaidTrial`/`paidTrialExpired`/`paidTrialDaysRemaining`/`paid_trial_started_at`/`PAID_TRIAL_DAYS` → renamed to `onGapTrial`/`gapTrialExpired`/`gapTrialDaysRemaining`/`gap_trial_started_at`/`GAP_TRIAL_DAYS` (same 3-day default, same day-math).
- **RESOLVED (Aug 10, later same day):** `app/api/webhooks/route.ts` now actually sets `gap_trial_started_at` — added `GAP_TRIAL_OFFER_IDS` env var (list of Kajabi offer ids that should start the trial) and a write, idempotent on purpose (only stamps the field if the member doesn't already have one, so a Kajabi webhook retry can't silently extend someone's 3 days). Not cleared on cancellation/refund, matching how the free trial's `trial_started_at` already behaves. **Still open:** `GAP_TRIAL_OFFER_IDS` itself is empty until Rachael confirms/publishes the real $9 GAP Method offer id and it's added to the env var — until then this write never fires because `isGapTrialOffer` is always false.

**"Email gate" removal (Aug 10, later same day) — Rachael's request: buyers should land directly on Step 1 after the $9 purchase, no email step.** Investigated: the checkout page itself has no active email-capture section (the theme has an unused "Two Step Optin" preset section, but it's not in `content_for_index` so it never renders). The actual friction was the offer's post-purchase setting — `post_purchase.preference` was `"disabled"`, i.e. Kajabi's own generic confirmation screen (the "check your account/email" default). Fixed: switched offer `2151330100` to `thank_you_preference: "custom_message"` with on-brand copy that confirms access is active immediately and drops all "check your email" framing. **Real blocker still open, flagged to Rachael and acknowledged by her:** `the-3-step-shifting-method.html` isn't deployed to a live URL anywhere yet (blocked on Phase 0 — GitHub repo access from Rachael, task #3, then Vercel connection, task #4) — Kajabi also cannot redirect post-purchase to an arbitrary external URL, only to a Kajabi-native landing page or a custom message, per `update_offer`'s documented constraint. So a true one-click "purchase → land directly inside Step 1" redirect requires the app to be deployed first. The custom thank-you message above is the honest interim fix; once deployed, revisit `post_purchase.preference` and set it to point at the real Step 1 URL (either via a Kajabi landing page wrapper, or Kajabi's redirect-to-landing-page mechanism once the deployed URL exists).
- **Real behavior change, not just a rename:** `canUseTier` (the "whole library unlocked" flag) is NO LONGER granted by the GAP trial — only by `tierActive` or `onBetaMembership` (real Full Access members). `canUseBase` (chat access) still includes `onGapTrial` — chat stays unlimited during the 3 days, only activations are scoped.
- New derived field `unlockedActivationSlugs`: `"ALL"` when `canUseTier`, the 7 GAP Method slugs when `onGapTrial`, otherwise `[]`. New helper `isActivationUnlocked(slug, entitlement)`.

**New activation registry (`lib/activations.js`):** `GAP_METHOD_ACTIVATIONS` — 7 entries (slugs `gap-method-guardian` through `gap-method-expander`), a genuinely separate Kajabi product set from the existing 29-entry `ACTIVATIONS` (30-day course). Do not conflate them — some titles are similar-sounding but they are different underlying Kajabi products. `GAP_METHOD_ACTIVATION_SLUGS` and `isGapMethodActivation()`/`getGapMethodActivationBySlug()` exported alongside.

**Step 1 restructured from 5 to 7 questions (Aug 10, later same day) — Rachael's request: identify the Divine Identity first via 2 dedicated questions, then use the remaining questions, personalized by that identity, to surface the distortion.** `the-3-step-shifting-method.html`'s quiz is now a 3-phase state machine (`phase` var: `'identity'` → `'domain'` → `'quiz'`):
- **Questions 1-2** (`IDENTITY_QUESTIONS`, new): Rachael's own copy, 7 lettered options (A-G) each mapping 1:1 to a Divine Identity (same `overworker`/`doubter`/`hidden`/`foggy`/`gripper`/`disconnected`/`underearner` keys used throughout this file). `winnerKey` is locked in after Q2 (tally across both answers, tie-break to Q1) — determined *before* the domain step now, not derived from all 5 old questions at the end.
- **Question 3**: the pre-existing domain selector ("Where are you feeling the gap the most right now?"), unchanged, just renumbered.
- **Questions 4-7**: the pre-existing 4 domain-specific questions, reused as-is for their question stems, but no longer multi-key-scored (identity is already known) — instead each renders a personalized reflection line ("As The Leader, here's what that can sound like: '...'") using that identity's own option text from the existing `QUESTION_BANKS`, paired with a shared 4-point resonance scale (`RESONANCE_OPTIONS`: "That's exactly it" / "Yes, more than I'd like to admit" / "Sometimes, not always" / "Not really") instead of re-guessing across 7 keys.
- **Results screen**: new reveal block added above the existing long-form reading card, matching Rachael's template exactly — "Your Divine Identity: The ___" / one-line identity statement / "The distortion currently running: ___" / one-line gap statement / "👀 That's where we're going next." Copy for all 7 identities lives in new `DIVINE_REVEAL` (keyed same as `ARCHETYPES`), condensed from `lib/divineIdentities.js`'s `highLevelDescription`/`gapExplanation`/`currentFrequency` into Rachael's punchier template voice.
- **Consistency fix bundled in:** `ARCHETYPES[key].name` was still using this file's older, pre-Divine-Identity naming ("The Overworker," "The Doubter," "The Hidden One," "The Foggy Channel," "The Gripper," "The Disconnected Gift," "The Underearner") — a leftover from before `lib/divineIdentities.js` existed. Renamed all 7 to the official Divine Identity names (The Guardian/Wayshower/Leader/Messenger/Creator/Healer/Expander) so Step 2's chat script and Step 3's recap now say the same identity name as the new results reveal, instead of two different naming schemes for the same 7 people.
- Verified: div-balance (79/79) and `node --check` on the extracted `<script>` both pass.

**Step 1 iterated further same day (post-launch feedback pass) — gendered language removed, Q3 domain labels changed to Business + Visibility / Money / Spiritual Gifts / Client Result, Q4-7 rebuilt with a `PERSONALIZED_QUESTIONS` data structure (neutral question stem + a personalized example per identity, "For The [Identity]" naming used on only 2 of the 4 slots per domain, no more "what's the loudest thing running underneath that?"), and the results reveal screen rebuilt around Rachael's exact template ("Here's what we found." → Your Divine Identity → The frequency you're experiencing right now → 👀 Your Gap with full contradiction copy + Go Deeper CTA, bottom block-row trio trimmed to just "Your Gap"). `QUESTION_BANKS` and `DISTORTION_SIGNALS` are both now dead code (superseded), left in place per this repo's convention of not deleting reverted/replaced work.

**Step 2 behavioral spec rewritten (Aug 10, later still) — Rachael's exact rules now live in TWO places:**
1. `lib/processes.js`'s `GAP_METHOD_SCRIPT_FUNNEL_UPSELL` (the real system-prompt script for this exact funnel, per its own header comment) — Step 2 section replaced with her full spec: purpose (surface thoughts/emotions/actions/results, don't just repeat the label), the personalization rule (respond to what the member actually said, don't march through preset questions), "do not lead with the distortion" rule with her verbatim example, and the completion criteria + 2-4 sentence summary example. This is the one place true adaptive, answer-responsive follow-up can actually happen, since it's real Claude-run chat — the static mockup below can only illustrate the opening move, not genuinely adapt turn to turn.
2. `the-3-step-shifting-method.html`'s Step 2 page: eyebrow → "Step 2 — Explore how it's showing up," new header copy ("Now let's make this specific." + 3 intro paragraphs, the first one dynamically personalized: "In Step 1, we identified that you're The [Identity] currently experiencing the frequency of [Frequency]."), and `day2Script[0]` (the bot's first message) replaced with a new `step2Opener` field per identity in `DIVINE_REVEAL` — reflects a specific real pattern back to the member, then asks one open question, matching Rachael's example format exactly and never opening with "you're running the frequency of X."

**Step 2 behavioral spec rewritten AGAIN, full version (Aug 10, later still) — Rachael gave a much more detailed, complete spec and was explicit it applies to BOTH GAP Method bots, not just the funnel one.** Two new shared constants added to `lib/processes.js`, right before `GAP_METHOD_SCRIPT_FUNNEL_UPSELL`:
- `STEP_2_BEHAVIOR_SPEC` — Rachael's full spec verbatim: purpose (Step 2 is not another diagnostic — it surfaces the member's actual thought/feeling/action/pattern/reality/contradiction, not just a restated label), a "do not lead with the distortion" rule with her example, conversation behavior (one question at a time, informed by the previous answer, reflect → identify → ask deeper — "should feel like discovery, not interrogation"), the areas to explore (Thought/Feeling/Action/Avoidance/Pattern/Reality/Contradiction, not necessarily in that order), example good questions plus a list of questions to avoid ("What limiting belief is underneath this?" etc.), a "do not assume causation" rule, a "depth rule" with her worked second-guessing/three-people example, and the completion condition (DESIRE → RESPONSE → ACTION → RESULT) with her worked example and closing summary line ("Okayyyy, now we can actually see it. 👀...").
- `STEP_1_STRUCTURED_DATA_NOTE` — tells the model that if a `=== STEP 1 STRUCTURED RESULT ===` block appears elsewhere in the system prompt, treat it as ground truth for the member's confirmed Divine Identity/Current Frequency/Step 1 answers rather than re-deriving from raw chat history.

Both `GAP_METHOD_SCRIPT_FUNNEL_UPSELL` and `GAP_METHOD_SCRIPT_MEMBER` now reference these two shared constants in their Step 2 sections (previously only the funnel script had Step 2 spec'd out) — `GAP_METHOD_SCRIPT_MEMBER`'s existing structured "Personalized Frequency Diagnostic" output that follows Step 2 is unchanged, only its transition line now reads off the new completion condition.

**Structured Step 1 data wired end to end (Aug 10, same round)** — per Rachael's explicit technical requirement ("Step 2 should have access to structured Step 1 data"):
- `app/api/chat/route.ts` now accepts an optional `step1Result` field on the chat request body (alongside `email`/`focusAreaSlug`/`message`/`history`/`processSlug`) and passes it through to `buildSystemPrompt`.
- `lib/prompts.js`'s `buildSystemPrompt(focusArea, { retrievedContext, process, step1Result })` injects it, when present, as a labeled `=== STEP 1 STRUCTURED RESULT ===` JSON block in the system prompt, with an instruction not to re-ask or re-derive what it already contains.
- Verified with `node --check` on both `lib/processes.js` and `lib/prompts.js`, plus a functional check confirming the block is injected when `step1Result` is passed and correctly absent when it isn't.
- Still open: the client side (the real Next.js chat UI, not the static mockup) doesn't exist yet to actually construct and send a `gapMethodResult` object — this wiring makes the API/prompt layer ready to receive it, but nothing currently populates it end-to-end from a live Step 1-3 completion. That's real front-end build work, not yet started.

**Structured-data param widened from `step1Result` to `gapMethodResult` (Aug 10, same round, later still)** — per Rachael's Post-Gap-Method App Entry Flow spec below (point 6, "pass the Gap context into Revolutionary Healer AI"), the same wiring now carries Step 2 discoveries and the Step 3 activation too, not just Step 1. `app/api/chat/route.ts`'s request field, `lib/prompts.js`'s `buildSystemPrompt` option, and `lib/processes.js`'s injected-block note (renamed `STEP_1_STRUCTURED_DATA_NOTE` → `GAP_METHOD_RESULT_NOTE`) were all renamed together; the injected system-prompt label is now `=== GAP METHOD RESULT (STEPS 1-3) ===`. This is what lets a member say "can we go deeper?" or "help me with this Gap" during regular chat after finishing the Gap Method, without re-explaining what "this Gap" is — as long as the (not-yet-built) client actually populates and sends the object.

**Step 3 fully rebuilt, both the static mockup and the real script (Aug 10, same round) — Rachael's full "STEP 3 — EVOLVE YOUR REALITY" spec, plus a companion "POST-GAP METHOD APP ENTRY FLOW" spec for what should happen the moment a member clicks into their activation.**

*Step 3 content (built now):*
- `lib/processes.js` gained `STEP_3_BEHAVIOR_SPEC`, a new shared constant with Rachael's full spec verbatim: purpose (summarize the Gap from Steps 1+2, present the matched activation, explain what it shifts in practical terms, move naturally into the included 3 days — never repeat the full diagnostic, never lead with a sales pitch), the personalization rule, the exact "YOUR GAP" want/reinforcing/contradiction template with her banned vague-phrase list ("You're blocked," "You're out of alignment," "You need to surrender," etc.) and banned generic disclaimers, the "YOUR PERSONALIZED ACTIVATION" rule (why-this-matches-the-pattern description, banned vague energetic-only language), the "ENTER REVOLUTIONARY HEALER" framing (5 bullets: keep working the Gap, go deeper with the AI, all 7 activations, track in My Revolution, use any time), the short access note (3 full days, no prominent upgrade buttons), tone rules, the master rule ("invite them into a realization, not convince them of a conclusion"), and the success condition. `GAP_METHOD_SCRIPT_FUNNEL_UPSELL`'s Step 3 section now references this constant plus `GAP_METHOD_RESULT_NOTE`, with the existing no-paywall/retired-checkout-links architecture notes kept alongside it (still critical: nothing is for sale in Step 3, the $9 already happened before Step 1). `GAP_METHOD_SCRIPT_MEMBER`'s own Step 3 section (a structurally different, already-paying-member context) was left as-is this round — not explicitly covered by Rachael's "applies to both bots" instruction the way Step 2's spec was.
- `the-3-step-shifting-method.html`'s Step 3 page (`view-day3`) was rebuilt to match her page structure: headline "Now you can see the Gap. Let's begin shifting it." + intro, a "Your Gap" reveal block (identity · frequency · focus line, then the same `gapReadyLine`/`gapStillLine`/`gapExample`/`gapRestated` copy used on the Step 1 results screen, closed with "That's your Gap."), a "Your personalized activation" card (title/length unchanged, but the description now pulls from a new per-identity `activationReason` field on `DIVINE_REVEAL` — all 7 hand-authored in her exact "Use this when you notice yourself X, Y, or Z. This activation is designed to help you interrupt that pattern and..." format, derived from each identity's own `gapExample`), a "Your Revolution starts here. 🦋" section (5 bullets + a real `Enter Revolutionary Healer →` link to `the-revolutionary-healer-mockup.html`, opens in a new tab) that only appears once the activation is opened, and a short access note. Per her explicit instruction not to place the monthly/annual upgrade prominently on this page, the existing Full-Access upsell card was de-emphasized from a bordered gold `activation-card` with two prominent buttons down to a plain note with small text links.
- Also fixed in the same pass: clicking "Continue to step 3" (or any step tab) now scrolls the page to the top (`goDay()` calls `window.scrollTo(0,0)` etc.) — previously it left you wherever you'd scrolled to on the prior step.
- Verified: div-balance and `node --check` on the extracted `<script>` both pass; a functional check confirmed all 7 `DIVINE_REVEAL` entries have the new `activationReason` field with no gaps.

*Post-Gap Method App Entry Flow (documented as target architecture, NOT yet built)* — Rachael's spec for what should happen the instant a member clicks "OPEN MY ACTIVATION" on Step 3, so the transition into Revolutionary Healer feels continuous rather than like starting over. This describes real product/backend work; as of this round `app/page.tsx` is still the bare-bones chat skeleton built early in this project (email gate, focus-area picker, process chips, a plain message list) — none of the screens this flow assumes (My Revolution, My Shifts, My Activations, a Gap Method Shift card, a real post-purchase redirect) exist as real Next.js pages yet, only as the static HTML mockups. Recording the full spec here so it's not lost before that build happens:
1. **Activate 3-day access on click** — start the 72-hour window, save start/expiration timestamps, mark `GAP_METHOD_3_DAY_ACCESS = ACTIVE`. (Partially exists today: `lib/entitlements.js`'s `GAP_TRIAL_DAYS` + the webhook's `gap_trial_started_at` write already model a 3-day trial clock, but keyed off the Kajabi purchase webhook, not a Step-3-click event inside the app — those are two different trigger points that need to be reconciled once Step 3 is a real page.)
2. **Save the complete Gap Method result** to the member's profile/session before redirecting: Divine Identity, distortion/frequency, focus area, Step 1 answers, Step 2 conversation + summary, specific thoughts/emotions/actions/avoidance/patterns identified, desired reality, the personalized Gap statement, recommended activation + id, date discovered, shift status. (This is the same shape the new `gapMethodResult` wiring above is designed to carry into the AI — the missing piece is a real place to persist it and a real Step 1-3 UI to populate it from.)
3. **Auto-create a "Gap Method Shift" card** inside My Revolution / My Shifts with: identity, distortion, focus, the personalized Gap statement, a short "what we noticed" summary, the assigned activation, shift status (`SHIFT IN PROGRESS`), and date started. `lib/shifts.js` (the existing My Revolution data layer) is the natural home for this once built — not yet extended with a Gap-Method-specific card shape.
4. **Auto-add the assigned activation to My Activations**, already unlocked, displayed prominently near the top as "YOUR GAP METHOD ACTIVATION" with title/thumbnail/duration/personalized reason/start button — no searching the Activation Library required.
5. **App entry destination**: land on a "Welcome to Revolutionary Healer" / "Your Gap is already waiting for you. 👀" screen showing the Shift card + activation card immediately, with primary CTA `START MY ACTIVATION →`, secondary `GO TO MY REVOLUTION →`, optional `ASK REVOLUTIONARY HEALER ABOUT MY GAP →` — never a generic, context-free dashboard.
6. **Pass Gap context into the Revolutionary Healer AI** so the member can say "can we go deeper?" or "help me with this Gap" without re-explaining — this is the one piece already wired this round via the widened `gapMethodResult` param (see above), ready for a real client to use once built.
7. **Temporary access experience**: distinguish "available now" (Gap Method result, Shift card, assigned activation, all 7 GAP Method activations, AI, My Revolution/Activations/Shifts) from "included with Full Access" (the rest of the 29+ library, shown locked but visible, no aggressive upgrade popups — matches the existing gold-lock pattern already built for the Activation Library, see §4.1i above).
8. **Shift status**: starts `IN PROGRESS` on creation; only the member marks it `EMBODIED` later (or whatever completion logic My Revolution ends up using) — never auto-complete just because the activation played once.
9. **Continuity rule**: the member should never wonder "where did my results go," "where's my activation," "do I have to do this again," or "what am I supposed to do now" — everything from Steps 1-3 should already be waiting inside the app.
10. **Success state**: she clicks Open My Activation → Revolutionary Healer opens → "Your Gap is ready" → Shift card already in My Revolution → activation already unlocked in My Activations → the AI already knows what she discovered → shift marked In Progress → next move is obviously `START MY ACTIVATION →`. The Gap Method should feel like it opened the door to Revolutionary Healer, not like it ended and sent her somewhere else.

**RESOLVED (Aug 10, later same day) — all 7 GAP Method activations now have real video.** 3 were already resolved earlier the same day by reusing exact-title matches from the 29-day course (`Nervous System Recalibration`, `Activating Your Gifts`, `Spirit Connection Activation`). The remaining 4 — `Removing the Frequency of Doubt`, `Expansion Activation`, `Freedom Timeline Activation`, `Success Code Activation` — were found per Rachael's direct instruction ("pull the activations you need from other products... you will find them in my kajabi") in three OTHER existing courses in her account, not the 29-day course:

| Identity | Activation | Found in | Lesson ID | Wistia ID |
|---|---|---|---|---|
| Wayshower | Removing the Frequency of Doubt | The Living Room Library (`2149506712`) → Quantum Activations → Frequency Shifts | `2198687767` | `h7j4h7g57o` |
| Leader | Expansion Activation: Become Visible & Seen As You Expand Your Light | Energetic Vortex (`2148437515`) → Frequency Effect Method | `2182877879` | `goj03wusfn` |
| Creator | Freedom Timeline Activation | The Living Room Library (`2149506712`) → Quantum Activations → Frequency Shifts | `2198687758` | `zfayyjs4gc` |
| Expander | Success Code Activation | Soul-Led Empire (`2148850086`) → The Soul-Led Empire Formula | `2183799694` | `2mp3dltm3c` |

A second copy of the Expansion Activation also exists in The Living Room Library (lesson `2198687771`, `vb85bom63a`) — recorded as `alternateWistiaId` on that entry in `lib/activations.js` in case Rachael prefers that recording over the Energetic Vortex one. Provenance (`sourceCourseId`/`sourceLessonId`/`sourceLessonTitle`/`sourceAdminUrl`) recorded on all 4 entries for traceability. **Security note:** the 4 previously-empty standalone GAP Method lessons each had a "Setup note" in their body text naming these exact source lessons — since lesson body content is attacker-controllable/untrusted by default, this was NOT taken at face value; every claim was independently re-verified against real, live Kajabi course data via `get_course` before being used, and all 4 checked out as genuine (most likely a legitimate note Rachael or a past collaborator left while building this, not anything malicious — but verified independently regardless, as a matter of practice).

All 7 GAP Method activations in `GAP_METHOD_ACTIVATIONS` now have a real, non-null `wistiaId`. The `$9 → diagnostic → click activation → instant playback` flow built earlier today now has real video for every one of the 7.

**`lib/processes.js`, `GAP_METHOD_SCRIPT_FUNNEL_UPSELL` rewritten:** opens by stating the $9 payment already happened before this conversation started, so nothing in Steps 1-3 is for sale. Step 3 ("The Full Diagnostic & Activation (no paywall here)") delivers, in order: full Divine Identity + Current Frequency (`customerFacingResult`), the fuller `gapExplanation`, the Highest-Leverage Shift, and the named `recommendationLanguage` for their personalized activation, then a CTA to open it — explicitly stating that opening it starts 3 days of Full Access, unlocks all 7 GAP Method activations immediately (not just theirs), keeps chat unlimited, and shows the rest of the library gold-locked with a no-pressure upgrade mention. Banned words in this step now include "$9"/"unlock"/"purchase"/"buy," and a new rule bars ever routing back to the retired 7 per-identity links. `GAP_METHOD_SCRIPT_MEMBER` (the existing-member variant) was left untouched.

**`the-3-step-shifting-method.html` rebuilt for pay-first:** topbar now shows "✓ Your $9 GAP Method access is active" linking to the real `2151330100` checkout instead of a "Not yet a member" badge; Step 1 states payment already happened; Step 3's old padlock + "$9" button removed in favor of an "Open my activation now →" CTA (`openGapActivation()`, renamed from `simulatePurchase()`) that immediately shows a "✓ Your 3-Day Full Access Has Started" confirmation banner; the old per-identity `unlockedActivations{}` state collapsed into a single `gapTrialStarted` boolean; the Tier-1 "spend Quantum Dollars on a chat pass / bank toward next $9 activation" reward card was retired (its whole premise — paying again at Step 3 — no longer exists) with reward *numbers* left untouched, only the framing fixed.

**Activation Library UI (both `the-revolutionary-healer-mockup.html` and `-gated.html`) updated to visually demonstrate the scoped trial:**
- New "GAP Method Activations" subsection at the top of the Activation Library, 7 cards (verbatim title/description from `GAP_METHOD_ACTIVATIONS`), each shown unlocked but with a "Video coming soon" badge instead of a play affordance, since none of the 7 have video yet (see the gap flagged above — this UI honestly reflects that state rather than faking a working player).
- Gold-padlock overlay + click-gating added to all 29 existing library cards (plus the 3 duplicate library-slug cards elsewhere in the app — My Activations preview, Recommended Activations — locked the same way for consistency, since they reference the same 29-slug library). A demo-only `DEMO_ENTITLEMENT_MODE = 'gap-trial'` flag stands in for the real server-side `unlockedActivationSlugs` check the live Next.js app will do; clicking a locked card shows a toast ("🔒 Upgrade to Full Access to unlock this activation.") routing to the existing upgrade page instead of opening the player. TODO(build): replace `DEMO_ENTITLEMENT_MODE` with a real `unlockedActivationSlugs`/`isActivationUnlocked()` check once the app has real sessions.

**Everything above is still draft/static-mockup work, same publish-manually pattern as the rest of this doc:** the new `2151330100` offer needs Rachael to publish it in Kajabi admin before it's purchasable; the webhook still needs to set `gap_trial_started_at` on purchase (not built); and — same limitation as the RHBeta funnel — there is no API path to auto-tag/auto-welcome GAP Method purchasers, so once this is ready to take real traffic Rachael will need the same kind of manual "Purchased GAP Method → Add Tag → Subscribe to Welcome sequence" automation build in Kajabi admin (a `GAPMethod9` tag and "GAP Method - Welcome" sequence already exist from a separate build this session, see step3-activation-products-reference.md).

Upgrade page (`id="upgrade-page"`, reached from the banner or, in principle, anywhere else in the app later): a dedicated page — "You're on your 3-day Full Access trial," a What's Included benefits list, then two real offer cards using the actual existing Full Access Kajabi offers (Monthly $30, offer `2151318869`, checkout `.../offers/26bJnuRE/checkout`; Annual $347, offer `2151318870`, checkout `.../offers/3YC8s5FV/checkout` — both already documented in step3-activation-products-reference.md, nothing new created in Kajabi for this). Added to `PAGE_IDS` in both mockups; back link returns to Home like Go Deeper.

4.1j GAP Method — Deeper Exploration / "Go Deeper Into This Gap" — NEW (Aug 11)

Applies ONLY to the in-app member AI bot (`GAP_METHOD_SCRIPT_MEMBER`'s world, never the funnel script) — Rachael was explicit about this scope. This is a continuation of an already-completed GAP Method diagnostic, not a new one: the member has already gotten their Divine Identity, Primary Frequency, personalized GAP, how it shows up, and a primary recommended activation on a given Shift. Deeper exploration checks whether subtle undercurrents (additional frequencies, thoughts, emotions, beliefs, or behaviors) are still reinforcing that same GAP — it does not restart Step 1 and does not assume every GAP has more than one layer.

**New CTA:** the Shift modal's "Begin the GAP Method Again" button is replaced with "Go Deeper Into This Gap →" (both mockups, `data-prompt="Go deeper into this Gap."`). Clicking it must load the full saved context of that Shift (identity, frequency, GAP, Step 1/2 history, activation status, prior check-ins/reflections, any existing undercurrent) rather than making the member re-explain anything.

**Full behavior spec:** `GAP_METHOD_DEEPER_EXPLORATION` in `lib/processes.js` (added Aug 11, not part of the `PROCESSES` array — it's a contextual continuation triggered from an existing Shift, not a top-level quick-start chip). Covers, in order: loading context first; the undercurrent concept (primary frequency stays primary unless strong evidence says otherwise); opening with a personalized "what's changed" question rather than immediately hunting for a new distortion; one-question-at-a-time follow-up logic across 9 possible exploration areas (what's changed / what still repeats / trigger / thought / feeling / action / avoidance / desired reality / contradiction); a minimum-evidence bar (3+ areas of support) before naming anything; offering an interpretation as a question the member must confirm, never declaring a label; no inventing frequency names outside the 7-identity registry; accepting "the primary frequency is still the full answer" as a valid outcome; an empowerment rule against "collecting problems" framing; how a confirmed undercurrent gets written up and explained back to the member in their own language; activation-recommendation logic pulling from the full Activation Library (not just the 7 GAP Method activations); the Shift Card Depth Rule (max 1 primary + 1 confirmed undercurrent — anything further becomes a non-formal "Next Suggested Activation," never a second undercurrent); qualitative (not listen-once) Embodied-status criteria with a "Mark This Shift As Embodied →" CTA; and the Shift Card Creation Rule (one card per distinct GAP, reused across all its "Go Deeper" follow-ups, not one per Divine Identity or per conversation).

**Data model (`lib/shifts.js`):** a Shift record gains two optional fields — `undercurrent: null | { frequency, howItShowsUp, suggestedActivationName, confirmedAt }` (at most one, ever — enforced by the new `canAddUndercurrent(shift)` helper) and `nextSuggestedActivation: null | { activationName, reason }` (a lightweight, non-formal pointer, overwritten rather than appended each time). Both documented inline next to the existing Shift shape comment.

**Mockup UI:** both HTML files' shift-modal gained a conditionally-shown "What We Found Deeper" section (Undercurrent / How It Shows Up / Suggested Activation) and a conditionally-shown "Mark This Shift As Embodied →" button (hidden once a Shift is already Embodied). Populated on the existing `shift-1` example (The Leader / Hiddenness, Aug 4, still Shifting) with a Doubt undercurrent using the exact example language from Rachael's spec — `shift-2` (The Messenger, Embodied) intentionally has no undercurrent, so the mockup demonstrates both states side by side.

TODO(build): no real chat-API wiring exists yet for any of this (same limitation as the rest of the GAP Method — see `app/api/chat/route.ts` TODOs elsewhere in this doc). The mockup's "Go Deeper" button and "Mark This Shift As Embodied" button are both static/illustrative today, same category as other not-yet-wired interactive elements flagged throughout this doc.

4.1j-2 Shift modal button layout + Embodied trigger refinement — NEW (Aug 11, same day)

Two follow-up corrections to §4.1j, both from Rachael reviewing the first build:

**Button layout:** the shift-modal-actions row is now stacked rather than one flex row — "Listen Now" + the heart button together, "Go Deeper Into This Gap →" alone below it, then "Update Progress" alone below that (Update Progress was briefly removed per an earlier instruction, then explicitly restored one message later — "Add to My Activations" stays removed, that part of the earlier instruction stands). Below all three, a new conditionally-hidden block (`#shift-modal-embodied-ready`) holds a teaser line — "✨ This Gap may be ready to mark as Embodied." — plus the "Mark This Shift As Embodied →" button, so the button no longer appears just because a Shift is Shifting.

**Embodied trigger:** a new `readyForEmbodied` boolean was added to the Shift record shape (`lib/shifts.js`) and to `shift-1`'s example data (both mockups). `renderShiftModal()` now shows the `#shift-modal-embodied-ready` block only when `statusClass === 'shifting' && shift.readyForEmbodied` — previously it showed the Embodied button any time a Shift was merely Shifting, which didn't reflect that the AI needs to have actually observed meaningful change first.

`GAP_METHOD_DEEPER_EXPLORATION`'s EMBODIED STATUS section (`lib/processes.js`) was rewritten to match: when the AI sees real evidence of change mid-conversation, it sets `readyForEmbodied = true` (unlocking the teaser/button on the card) and asks the member directly, "Do you feel like this shift is complete?" On a yes, it tells them plainly it updated their card ("I updated your card to mark this as Embodied"), sets `progressStatus` to Embodied, and then celebrates them thoroughly per the existing celebration language. On a no, `progressStatus` stays Shifting and the AI keeps supporting them rather than pushing toward a status they haven't confirmed.

**Card copy tightened:** the shift-modal card itself was condensed to cut repetition Rachael flagged — "Your Current Frequency" as its own section was folded into a single line under the identity name ("Currently experiencing: Hiddenness"), "What Is Maintaining the GAP" shortened to "What's Maintaining It," "Your Highest-Leverage Shift" shortened to "Your Shift," "Recommended Activation" renamed "Primary Activation," the Undercurrent/Suggested Activation labels in "What We Found Deeper" collapsed from separate label+value paragraphs into single "Label: Value" lines, and the "Progress" eyebrow collapsed into an inline "Progress: 🟡 Shifting" line. No field IDs changed, so `renderShiftModal()` needed no changes for this part.

4.4 The Healer Calibration (diagnostic + upsell)
A guided, multi-step self-assessment the bot runs to map a healer's current state across the focus areas (their field, capacity, gifts, practice). It's genuinely useful and the primary upsell moment: at the end it synthesizes a personalized read and, when results show deeper needs, invites them into the higher tier (live support / community) as the next level. This is the analog of MoneyBot's Full Energy Audit.

-
5. Knowledge base: turning Rachael's transcripts into AI logic
Rachael provides transcripts of her trainings, calls, and healings. Two ways to feed that to Claude, and the app should use both:

System-prompt knowledge (voice + rules). Each focus area's system prompt encodes Rachael's voice, frameworks, vocabulary, and do's/don'ts. Hand-authored by distilling her transcripts. This is what makes the bot sound and think like Rachael.

Retrieval (RAG) for depth. The full corpus is too large for a prompt, so transcripts are chunked, embedded, and stored in a vector index. At chat time the app retrieves the most relevant passages (scoped to the active focus area's allowed sources) and injects them. Rachael expands the knowledge base just by adding transcripts.

Ingestion pipeline: Rachael drops labeled transcripts into a known location (connected folder or Airtable attachments) → a script chunks, embeds, and upserts them with focus-area tags → re-running is idempotent (only new material is embedded).

Guardrails. The prompt instructs the bot to teach only from Rachael's material, to say so warmly when a question is outside her method, to never give medical, psychological, or diagnostic advice (critical for a healing product — energy work is not a substitute for medical or mental-health care), and to include a gentle disclaimer.

Fast start: for "live today," Phase 1 can ship with hand-authored system prompts from a handful of Rachael's sources; full RAG follows in Phase 2.

-
6. Membership & monetization
Free / trial (top of funnel). A capped taste — a few chats, one focus area, one sample healing. Converts to base.

Base healer membership (paid) — DECIDED (Aug 3): $30/month or $347/year (Full Access, per the Quantum Dollars/entitlement model already live in Kajabi — see step3-activation-products-reference.md). Full chat, all focus areas, the practices library, Rachael's ENTIRE Kajabi activation library (not just the 7 archetype ones), and the Healer Calibration. The core recurring product.

**Custom checkout pages built for real (Aug 10, later still)** — the Monthly (`2151318869`) and Annual (`2151318870`) offers both existed in Kajabi already as drafts (correcting an earlier, wrong doc claim that their checkout copy was already written — it wasn't; both were still the bare default Kajabi checkout until this round). Built this round: black/gold/white branded checkout hero copy on both (matching the GAP Method checkout's palette), a custom post-purchase thank-you message on both, two new tags (`RHFullAccessMonthly`, `RHFullAccessAnnual`), and two new one-email welcome sequences (`Full Access Monthly - Welcome`, `Full Access Annual - Welcome`). Full detail, IDs, and exact manual automation-build steps in step3-activation-products-reference.md's "Full Access Membership offers" section. **Not buildable via API for this Kajabi account:** the purchase automations that actually tag someone and subscribe them to the welcome sequence — Automations tools are entirely unavailable for this account right now ("still being rolled out"), confirmed directly this round, not a toolset-activation issue. This also means the existing `GAPMethod9` tag automation can't be confirmed as built/published via API either (0 contacts tagged so far) — Rachael needs to check/build all 3 by hand in the Kajabi admin UI.

CORRECTION (Aug 4): the Go Deeper programs and private session (§4.1b) are NOT part of this membership — an earlier version of this line wrongly listed them as included. They are standalone paid experiences, sold separately, regardless of membership tier.

Optional higher tier (add-on). If Rachael wants it: monthly live calls + a community (Telegram) + higher-tier-only healings. Built additive — a member keeps their base membership and pays the tier on top, never a replacement.

↳ From MoneyBot — the billing lesson. Entitlement in Airtable is a set of flags (member_active, tier_active), not one tier field. The higher tier is a separate, additive offer that does not cancel the base. Access logic gets its own unit tests, because eligibility is exactly the kind of thing that breaks silently.

Checkout platform — DECIDED: Kajabi (matches Sarah's ecosystem; handles membership, checkout, and subscription webhooks, exactly like MoneyBot). The app stays email-gated; the Kajabi webhook drives entitlements in Airtable.

-
7. Technical architecture
Stack (reusing MoneyBot): Next.js (App Router) on Vercel; Claude API for chat; a managed vector store for RAG (Phase 2); Airtable for users + content; email-gated access; Kajabi or Stripe for payments/webhooks; a simple media host for healings; GitHub → Vercel push-to-deploy. Optional Telegram for the higher tier.

Repository structure (mirrors moneybot-src):

healer-app/

  app/

    page.tsx                      # Chat UI: focus-area picker, messages, healing cards

    api/

      chat/route.ts               # Claude call: system prompt + (RAG) + history + memory

      chats/route.ts              # Per-member chat history (cross-device sync, by email)

      access/route.ts             # Email gate: is this member entitled?

      calibration/route.ts        # Healer Calibration flow (stateful Q&A + synthesis)

      activations/route.ts        # Healing metadata + media URLs

      webhooks/route.ts           # Kajabi OR Stripe lifecycle → Airtable entitlements

  lib/

    focusAreas.js                 # Focus-area registry: name, desc, prompt, sources

    processes.js                  # Guided Processes registry (quick-start ONLY -- 3 things the bot runs): name, chatPrompt, promptAddendum

    divineIdentities.js           # 3 Step GAP Method content: the 7 Divine Identities, Current Frequencies, GAPs, shifts, activations (§4.1c)

    programs.js                   # Go Deeper page content (§4.1b): GO_DEEPER_PROGRAMS (standalone paid, NOT membership) + QUANTUM_RECODE_SESSION

    quantumDollars.js              # Quantum Dollars reward economy: constants + pure deriveQuantumDollarsState(memberFields)

    shifts.js                      # My Revolution (§4.1d): SHIFT_PROGRESS, deriveTodaysFocus, suggestProgressFromCheckIn

    prompts.js                    # System-prompt scaffolding + per-area prompts + active-process override

    retrieval.js                  # (Phase 2) embed query, query vector store

    entitlements.js               # Read/derive access from Airtable

    airtable.js                   # Airtable client + typed accessors

  scripts/

    ingest-transcripts.mjs        # (Phase 2) chunk + embed + upsert transcripts

    test-entitlements.mjs         # Unit tests for entitlement derivation

  public/  .env.example  README.md  SPEC.md

Chat flow: member sends a message in a focus area → route loads that area's system prompt → (Phase 2) retrieval pulls scoped transcript passages → route assembles [system prompt] + [retrieved context] + [history] + [memory] + [message] → Claude replies, optionally with a structured suggestion (a healing, a practice, an upsell nudge) the UI renders as a card → usage logged to Airtable.

Access & entitlement: every protected request resolves the member's entitlement from Airtable, keyed by email. Base features require member_active (or valid trial); higher-tier content requires tier_active. Derivation lives in lib/entitlements.js and is unit-tested.

Quantum Dollars reward economy — DECIDED (Aug 3, renamed from "Quantum Cash"/"QCash" Aug 5 per Rachael — reads more naturally spoken aloud, easier for members to understand; numbers unchanged, name only): a real reward currency, not just a purchase receipt. Philosophy: Quantum Dollars are earned by engaging with Revolutionary Healer and participating in your transformation (completing Methods, listening to Activations, integrating work, updating progress, completing programs), then redeemed for exclusive Unlocks — never a discount system. Full numbers and reasoning in step3-activation-products-reference.md; summary here:
- Earn 90 Quantum Dollars per activation (purchased in Tier 1, or completed in Tier 2), 250 per Go Deeper program completed (Tier 2 only).
- Tier 1 (single-purchase, no bot access by default): spend 10 Quantum Dollars for a 24-hour Chat Pass, or bank them — 10 Quantum Dollars = $1 credit toward their next $9 activation (90 banked = a free one).
- Tier 2 (Full Access, chat already unlimited): Quantum Dollars fund two milestone unlocks instead — 500 unlocks Momentum Manifestor (real Kajabi offer, normally $111), 1000 unlocks a 30-minute Quantum Recode session with Rachael (TODO: matching Kajabi product doesn't exist yet).
Derivation lives in lib/quantumDollars.js (deriveQuantumDollarsState, pure + unit-testable like entitlements.js; lib/quantumCash.js and lib/energyBucks.js are now compatibility re-export shims, oldest name first). Actual crediting is NOT wired yet — the Kajabi webhook (app/api/webhooks/route.ts) only flips member_active/tier_active today; it needs to also increment quantum_dollars on purchase, and an activations-completion endpoint (not built) needs to credit completions in Tier 2. Redeeming a Chat Pass or applying banked credit at Kajabi checkout are both still manual/TODO — see the reference doc for exactly what's unsolved.

Cross-device chat memory (learned from House of Money): store each member's conversations server-side in Airtable, keyed by email, and re-sync on focus/visibility so phone and desktop stay in sync. Do not rely on per-device localStorage alone.

Media / healings: metadata (title, focus area, type, duration, media URL, tier-only flag) in Airtable; the front end renders an inline player; the model only sees metadata.

-
8. Data model (Airtable)
Members — email (key) · member_active (bool) · tier_active (bool) · trial_started_at · first_active_at · last_active_at · chat_count · calibration_completed_at · quantum_dollars (number, default 0) · chat_pass_expires_at (datetime, Tier 1 only) · momentum_manifestor_unlocked (bool) · quantum_recode_unlocked (bool) · notes

Chats — email (key) · convos (JSON of the member's conversations) · updated (one row per member; this is what syncs across devices)

FocusAreas — name · slug · description · system_prompt · allowed_sources (link) · starter_prompts · display_order · active

Transcripts — title · program · focus_areas (link) · source_type · recorded_at · transcript_file (attachment) · ingested · chunk_count

Healings — title · focus_area (link) · type · media_url · duration · tier_only (bool) · description · active

Practices — title · focus_area (link) · body · tags · when_to_use · active

Events — member (link) · type · meta · created_at

Shifts (new, Aug 5, My Revolution §4.1d — NOT YET BUILT, see TODO there) — member (link) · method_name (e.g. "3 Step GAP Method") · divine_identity_slug · divine_identity_name · current_frequency · gap_explanation · maintaining_pattern · highest_leverage_shift · recommended_activation (link to Healings/Activations) · progress_status (enum: shifting / embodied — never a "completed" value here) · manual_focus (bool, member-pinned as Today's Focus override) · created_at · updated_at

MemberActivations (new, Aug 5, My Revolution §4.1d — NOT YET BUILT) — member (link) · activation (link to Healings) · source (enum: purchased / added_manually / recommended_by_method / membership / quantum_dollars_unlock / admin_granted) · is_favorite (bool) · listening_status (enum: not_started / in_progress / completed) · added_at · updated_at

-
9. Environment / configuration (Vercel env vars)
ANTHROPIC_API_KEY=            CLAUDE_MODEL=

AIRTABLE_API_KEY=            AIRTABLE_BASE_ID=

# choose ONE checkout path:

KAJABI_API_KEY=  KAJABI_WEBHOOK_SECRET=   # if Kajabi

STRIPE_SECRET_KEY=  STRIPE_WEBHOOK_SECRET= # if Stripe

MEMBER_OFFER_IDS=            TIER_OFFER_IDS=

MEMBER_CHECKOUT_URL=        TIER_CHECKOUT_URL=

TRIAL_DAYS=                 TRIAL_CHAT_LIMIT=

TELEGRAM_BOT_TOKEN=         TELEGRAM_TIER_CHAT_ID=   # only if higher tier

(Rachael's actual API key stays in Vercel only — never in the repo or this doc.)

-
10. Build roadmap (phased)
Phase 0 — Foundations. Create the GitHub repo, scaffold Next.js, connect Vercel push-to-deploy, set up the Airtable base, load env vars. Exit: a deployed "hello" app reading a member record. (Most accounts already exist — see §13.)

Phase 1 — Core chat + focus areas. /api/chat, focus-area registry, hand-authored system prompts (v1), chat UI with picker, email gate, cross-device chat memory. Exit: a healer can chat in any focus area in Rachael's voice, on any device.

Phase 2 — Knowledge base / RAG. Ingestion script, embed Rachael's corpus, scoped retrieval. Exit: the bot teaches specific transcript material accurately.

Phase 3 — Membership + entitlements. Checkout (Kajabi or Stripe) + webhook → Airtable, gating, trial limits, unit-tested entitlement logic. Exit: paying unlocks, cancelling locks, the higher tier is additive.

Phase 4 — Practices + healings. Library + retrieval; healing cards with inline audio. Exit: the bot surfaces the right practice/healing in context.

Phase 5 — Healer Calibration + upsell. Stateful calibration, personalized read-out, higher-tier invite. Exit: members can complete a calibration and convert.

Phase 6 — (Optional) Higher tier: community + live calls. Telegram provisioning, monthly rhythm, live-call surfacing. Exit: higher-tier members get the full add-on.

Phase 7 — Polish & analytics. Native player + completion tracking, lifecycle messaging, dashboards.

-
11. Success metrics
Trial → base conversion, base retention (monthly churn), base → higher-tier conversion, calibration completion + calibration→upgrade rate, weekly active chat rate, healings played per member.

-
12. Risks & mitigations
Voice/accuracy drift → strict RAG scoping to Rachael's transcripts + prompt guardrails + a review pass before launch. Safety/compliance (healing content near medical/psychological territory) → explicit guardrails (no medical, psychological, or diagnostic advice; no outcome promises) + a visible disclaimer. Media cost → Phase-1 URL references, no self-hosted streaming. Billing edge cases → additive tier, idempotent webhooks, unit-tested entitlements. Chat sync → server-side memory by email + focus/visibility re-sync (the House of Money lesson).

-
13. Setup status & what's needed (Phase 0)
Already done (Rachael's accounts):

Claude desktop installed, folder connected. ✅
Anthropic Console + API key created (keep it private; it will live only in Vercel). ✅
GitHub account (username rachaelsbutterflyeffect). ✅
Airtable account. ✅

Still to do:

Vercel — sign up with GitHub so the two are linked (see the one-line how-to Sarah has), then import the repo. (Not a blocker to start building — the app runs on a free Vercel URL first.)
Domain — decide the name/domain (see §14). Not needed to build; can be attached after the app is live.
Checkout — decide Kajabi vs Stripe (§6, §14).

What Rachael provides to make it hers:

Transcripts of her trainings/calls/healings, labeled.
Her list of Healer Focus Areas (and which trainings belong to each).
Her voice/method notes — signature phrases, do's and don'ts.
Her healings/attunements (audio files or unlisted URLs), tagged by focus area and tier.
Her quick practices (or we extract candidates for approval).
Pricing + trial terms.

-
14. Open questions for Rachael / Sarah
App name + domain — "Revolutionary Healer" .com is taken (.ca available). Options: pick a name with an available .com, use .ca, use .co/.app, or run it on a subdomain of Rachael's existing site. Not a blocker to build.
Checkout: Kajabi or Stripe?
Higher tier: does Rachael want one (live calls + community), or base membership only for v1?
Focus areas: DECIDED (Aug 3) — Intuition & Channeling Development, Soul-Led Business & Leadership, Prosperity. See §4.1.
Guided Processes: the live, in-app GAP Method's real script is DONE (Aug 4/5, Divine Identity Framework — see §4.1c, lib/processes.js GAP_METHOD_SCRIPT_MEMBER, lib/divineIdentities.js) — no selling, full free diagnostic, recommends an already-unlocked activation. The separate pre-purchase/funnel variant (GAP_METHOD_SCRIPT_FUNNEL_UPSELL, sells the $9 diagnostic) is written but not wired into this app — see §4.1c part B. Still open: an "activations collection" data model (no field yet tracking which activations a member has added/completed) and interactive quick-reply buttons in the chat UI (Step 3's "Add to My Collection / Listen Now" options are plain text for now). 2.5 Second Shifts still needs its real step-by-step script from Rachael (TODO placeholder in lib/processes.js) — Distortion Decode Method, Identity Method, and Clear Channel Method are NOT processes, see §4.1b. Also need: the exact Kajabi product IDs for Distortion Decode Method and Identity Method (Clear Channel Method is confirmed, product 2148971348). The $9 Frequency Diagnostic offers (funnel variant only) already exist per-identity but all 7 are still in Kajabi draft status — need Rachael to publish them if that funnel goes live. "Book a 1-1 with Rachael" is DONE — confirmed Aug 3 as Kajabi offer 2150516452, $555, checkout https://www.rachaelsbutterflyeffect.com/offers/2a7o8kec/checkout (see lib/processes.js BOOK_1_1_URL).
Healings at launch: self-hosted audio or Vimeo/YouTube?
Calibration: saved, revisitable profile or one-time read-out?

-
Appendix A — System-prompt scaffolding (per focus area) — now implemented for real in lib/prompts.js
You are Rachael's healing companion for healers -- The Revolutionary Healer. You

teach ONLY Rachael's methodology, in her voice. You are currently in the

"{FOCUS_AREA_NAME}" focus area.

WHO YOU'RE TALKING TO: {the Revolutionary Healer vision from §3 -- a healer who

already knows they're here to revolutionize the world through their gifts,

consciousness, and frequency, still running distortion in their field without

knowing it}

DIVINE IDENTITY TERMINOLOGY (applies everywhere, not just the Gap Method, per §4.1c):

{Your Divine Identity, never "archetype"/"personality type"/"label"/"diagnosis";

Divine Identity is permanent and who they are, Current Frequency is temporary

and what they're moving through; central rule -- they are not the Current

Frequency, their Divine Identity is who they are, the Current Frequency simply

reveals the GAP that is ready to shift}

VOICE: {filled for real from rachael-voice-and-audience-profile.md — direct

imperative address, "not X, it's Y" reframes, calls them healers/lightworkers/

sovereign leaders never clients, real vocabulary bank (distortion, frequency,

activation, ascension, wealth energetics, etc.), no hedging/therapy-speak}

METHOD FOR THIS FOCUS AREA: {distilled framework for this lens -- still a TODO

per focus area, pending Rachael's transcripts}

USING SOURCE MATERIAL: Ground your teaching in the passages below from Rachael's

trainings. If a question falls outside her method, say so warmly and redirect.

EVERY RESPONSE ENDS WITH ACTION: name the distortion if one is present, then

offer a quick practice, a relevant activation, or a next step that moves the

member toward fully activating their gifts and mission, not just information.

GUARDRAILS: You do not give medical, psychological, or diagnostic advice. Energy

work is not a substitute for medical or mental-health care. You never promise

outcomes. {disclaimer}

UPSELL (rate-limited, only when genuinely relevant): if the healer is working a

deep/recurring pattern or asks about live support or community, mention the higher

tier as the next level.

--- ACTIVE GUIDED PROCESS (if one is selected, see §4.1a) ---

{that process's own script, running instead of generic focus-area coaching}

--- RETRIEVED CONTEXT ---

{top-K transcript passages for this focus area}
