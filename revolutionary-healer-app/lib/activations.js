// Activations pulled in from Rachael's real Kajabi course "Activate Your
// Clairvoyance in 30 Days!" (product 2147937485, site 2147567473) -- the
// "30 Days of Activations" module's 29 day-submodules (Day #1 - Day #29),
// each a single lesson with one guided video/audio activation attached.
// Pulled Aug 5 via the Kajabi MCP's get_course tool (courses toolset).
//
// Playback: every lesson's media is Wistia-hosted (media.wistia_id in the
// get_course response), NOT a raw Kajabi media-library file -- this matters
// because Wistia hashed IDs are stable, unlike Kajabi's media-library S3
// links, which are signed and expire after ~7 days (see the "Kajabi media
// image_url values are signed S3 links" note in
// step3-activation-products-reference.md). So there is no re-hosting or
// URL-refresh problem here: WISTIA_EMBED_BASE + wistiaId is a standing,
// reusable embed URL. TODO(verify): confirm Rachael's Wistia project allows
// embedding outside kajabi.com (domain restrictions can be set per-project)
// before wiring this into a real <iframe>/player.
//
// Entitlement: no separate per-day Kajabi offer exists -- these 29 are
// bundled inside the one course, which (per SPEC.md §6/§4.3's "ALL
// activations in Rachael's Kajabi catalog get pulled into the app's
// Activations library for Full Access members" decision) unlocks entirely
// for $30/mo or $347/yr Full Access members, same as every other activation.
// kajabiCourseId is kept per-entry for provenance/future entitlement checks,
// not because each day is separately purchasable.
//
// Two lesson titles here are the same real activations already referenced
// elsewhere in this app as example content -- "Expansion Activation" (Day 9,
// the Leader's recommended activation in lib/divineIdentities.js) and
// "Nervous System Recalibration" / "Activating Your Gifts" (Days 23 & 24,
// used as example My Activations cards in both HTML mockups). That was
// coincidence when the mockups were first built (placeholder names that
// happened to sound plausible) -- now confirmed as real Rachael content, so
// those slugs below intentionally match what the mockups already show.
//
// No Divine Identity mapping is attempted here -- Rachael asked for these 29
// to be brought in as-is; tagging each to one of the 7 identities would be
// new interpretive work, not something she asked for. Left as a TODO/future
// enhancement, same pattern as other not-yet-decided mappings in this repo.
//
// REVISED (Aug 5, Rachael's card-redesign follow-up):
// - `day` and `kajabiCourseId`/`kajabiLessonId` are kept for internal
//   provenance only -- Rachael asked for all "where this came from" info
//   (the Day number, the course name) removed from what members see. The UI
//   layer must not render day/course text anywhere on a card or the detail
//   page; day is index-only now.
// - `kajabiTitle` preserves the exact original Kajabi lesson title (useful
//   for matching this entry back to the source lesson later). `title` is
//   the member-facing display name -- Rachael wants every activation to read
//   as "___ Activation" (e.g. "Grounding" -> "Grounding Activation"). Titles
//   that already contained the word "Activation" were left unchanged rather
//   than becoming "X Activation Activation". A few auto-appended titles read
//   a little awkwardly and are flagged inline below for Rachael to reword if
//   she'd like something more natural: Day 5 (long), Day 19 ("...Meditation
//   Activation"), Day 24 and Day 25 ("Activating Your ___ Activation").
// - `description` is a short, one-sentence "what this helps you shift"
//   line for the card + detail page. Written with real confidence for
//   activations built on well-established, generic energy-work concepts
//   (grounding, protection, chakra balancing, soul retrieval, meditation,
//   clearing, third eye/pineal gland, DNA activation, connecting with
//   guides, etc.) -- for those, Rachael confirmed "just make a description
//   for that, you know what that is." The remaining six (Day 4 Pink Cloud,
//   Day 5 Clearing Black Magic/Attachments/Negative Entities, Day 15
//   Emerald Dragon, Day 16 Merkabah, Day 17 Crystalline Dragon, Day 20
//   Sophia Dragon) were specific to Rachael's own framework, so those were
//   left blank until Rachael supplied the real copy herself (Aug 5
//   follow-up) -- lightly adapted here to match the one-sentence style of
//   the other 23, per her note to "shift these to align better with your
//   current layout." All 29 now have a real description.
//   getActivationsMissingDescription() below is kept as a safety check --
//   it should return an empty array today.

export const CLAIRVOYANCE_COURSE = {
  kajabiCourseId: 2147937485,
  kajabiModuleId: 2157287072, // "30 Days of Activations" submodule
  title: "Activate Your Clairvoyance in 30 Days!",
  adminUrl: "https://app.kajabi.com/admin/products/2147937485",
};

export const WISTIA_EMBED_BASE = "https://fast.wistia.net/embed/iframe/";

// CATEGORY SIMPLIFICATION (Aug 11, later same day): Rachael asked to cut the
// Activation Library from 7 category chips down to 5, since the original set
// (Grounding & Protection, Clearing & Release, Energy & Embodiment,
// Leadership & Visibility, Gifts & Intuition, Spirit & Guidance, Money &
// Business) felt repetitive. New taxonomy, with the mapping actually used
// below:
//   - "Energy + Frequency" = old Grounding & Protection + Clearing & Release
//     + Energy & Embodiment (23 activations -- straightforward merge, all
//     three were energy-body-work variants).
//   - "Gifts + Spirit" = old Gifts & Intuition + Spirit & Guidance (10
//     activations -- straightforward merge).
//   - "Leadership" = old Leadership & Visibility (Expansion, Emerald Dragon,
//     Sophia Dragon) PLUS Confidence Activation, moved over from the old
//     Money & Business bucket per Rachael's "confidence/visibility-related
//     activations" instruction (4 activations total).
//   - "Money" = the one old Money & Business activation whose description is
//     explicitly about money/clients/opportunity: Magnetic Field Activation
//     (1 activation). FLAGGED FOR RACHAEL: this leaves Money very thin --
//     everything else in the old Money & Business bucket read as general
//     business content, not money-specific, per her instruction to keep
//     Money to "activations that are specifically money-focused." Worth
//     revisiting once there's more money-specific content to pull in.
//   - "Business" = the rest of the old Money & Business bucket that reads as
//     business alignment/operations rather than money or leadership:
//     Emerging Your Soul Into Your Business, Crystal Business Activation,
//     Alignment Activation (3 activations).
// No activation from the original 29-day course fit "client-related" or
// "visibility-in-business" per Rachael's Business examples -- none of that
// content exists yet, so Business stays at 3 for now, same caveat as Money.
//
// FOLLOW-UP (Aug 11, same day): Rachael merged "Money" and "Business" back
// into a single "Money & Business" category (for now, while both are thin --
// see the flag above), and moved the two Vibe Booster activations (Yes
// Factor, Morning) out of "Energy + Frequency" into that combined category
// too, since they read as business/momentum tools rather than pure
// energy-body-work. Category values in the entries below now read "Money &
// Business" for these 6: Magnetic Field Activation, Emerging Your Soul Into
// Your Business, Crystal Business Activation, Alignment Activation, Yes
// Factor Vibe Booster, Morning Vibe Booster.
//
// FOLLOW-UP 2 (Aug 11, same day): 3 more activations pulled from "6-Figure
// Empire" straight into "Money & Business" -- see the dated comment block
// further below (right before Million Dollar Blueprint Activation) for the
// sourcing details and duplicate-check notes.
//
// FOLLOW-UP 3 / CATEGORY RESHUFFLE (Aug 11, same day): Rachael pulled Emerald
// Dragon Activation and Sophia Dragon Activation out of the library entirely
// (deleted below, no longer present anywhere in this file or either mockup --
// they "didn't feel aligned"). She also said "Leadership" was starting to
// feel the same as the money/business content, so it was dissolved as its
// own category. New taxonomy, replacing the previous one:
//   - "Energy + Frequency" -- unchanged (21).
//   - "Gifts + Spirit" -- unchanged (10).
//   - "Business + Impact" -- replaces "Leadership" for its 3 remaining
//     members (Expansion, Confidence, Leadership Recode -- all read as
//     leadership/visibility-in-business now that Leadership as a standalone
//     category is gone) plus the business-operations half of the old
//     "Money & Business" bucket (Emerging Your Soul Into Your Business,
//     Crystal Business, Alignment).
//   - "Money + Receiving" -- the money-specific half of the old "Money &
//     Business" bucket (currently just Wealth Frequency Activation on its
//     own).
//   - Multi-category (NEW): activations can now belong to more than one
//     category at once -- `category` (singular string) became `categories`
//     (array) on every entry below. Rachael specifically called out that
//     the 3 Vibe Boosters should live in both Business + Impact and Money +
//     Receiving, since they're general momentum/frequency tools that fit
//     either lens. Applying the same logic, Magnetic Field Activation and
//     Million Dollar Blueprint Activation also got tagged into both --
//     their descriptions are explicitly about money/receiving AND
//     clients/business at once. Every other entry still carries exactly one
//     category; nothing else was double-tagged without a clear textual
//     reason to.
// Current live taxonomy: Energy + Frequency (21), Gifts + Spirit (10),
// Business + Impact (11), Money + Receiving (6) -- totals don't sum to 43
// because 5 activations carry two category tags each.
export const ACTIVATIONS = [
  { day: 1, slug: "grounding", categories: ["Energy + Frequency"], icon: "roots", title: "Grounding Activation", kajabiTitle: "Grounding", mediaType: "video", wistiaId: "shyqht7zcb", kajabiLessonId: 2186068177, adminUrl: "https://app.kajabi.com/admin/posts/2186068177/edit", description: "Anchors your energy fully into your body and the present moment, so you feel calm, stable, and safe to be seen." },
  { day: 2, slug: "clearing-activation", categories: ["Energy + Frequency"], icon: "wave", title: "Clearing Activation", kajabiTitle: "Clearing Activation", mediaType: "video", wistiaId: "r2e0pk7310", kajabiLessonId: 2186066382, adminUrl: "https://app.kajabi.com/admin/posts/2186066382/edit", description: "Clears stuck or heavy energy from your field, creating space for clarity and forward movement." },
  { day: 3, slug: "protection-shielding", categories: ["Energy + Frequency"], icon: "roots", title: "Protection & Shielding Activation", kajabiTitle: "Protection & Shielding", mediaType: "video", wistiaId: "vd4qxo80ja", kajabiLessonId: 2186066489, adminUrl: "https://app.kajabi.com/admin/posts/2186066489/edit", description: "Strengthens your energetic boundaries so you can stay open and sensitive without absorbing what isn't yours." },
  { day: 4, slug: "pink-cloud-activation", categories: ["Energy + Frequency"], icon: "sunburst", title: "Pink Cloud Activation", kajabiTitle: "Pink Cloud Activation", mediaType: "video", wistiaId: "o5jzq5348k", kajabiLessonId: 2186066506, adminUrl: "https://app.kajabi.com/admin/posts/2186066506/edit", description: "Lifts years of dense energy in just a few minutes, helping you transform into a higher frequency." },
  { day: 5, slug: "clearing-black-magic-attachments-negative-entities", categories: ["Energy + Frequency"], icon: "wave", title: "Clearing Black Magic, Attachments & Negative Entities Activation", kajabiTitle: "Clearing Black Magic, Attachments & Negative Entities", mediaType: "video", wistiaId: "i2yl6eyu6z", kajabiLessonId: 2170888924, adminUrl: "https://app.kajabi.com/admin/posts/2170888924/edit", description: "Clears on a deeper level, releasing black magic, attachments, and negative entities so nothing invisible is left holding you back." },
  { day: 6, slug: "soul-retrieval", categories: ["Energy + Frequency"], icon: "star", title: "Soul Retrieval Activation", kajabiTitle: "Soul Retrieval", mediaType: "video", wistiaId: "orgyaqzc77", kajabiLessonId: 2160447404, adminUrl: "https://app.kajabi.com/admin/posts/2160447404/edit", description: "Calls back fragmented parts of yourself left behind during past pain, restoring your sense of wholeness." },
  { day: 7, slug: "light-frequency-activation", categories: ["Energy + Frequency"], icon: "sunburst", title: "Light Frequency Activation: Increase your Light and Shine Like the Sun!", kajabiTitle: "Light Frequency Activation: Increase your Light and Shine Like the Sun!", mediaType: "video", wistiaId: "jl1xaqdfml", kajabiLessonId: 2186066566, adminUrl: "https://app.kajabi.com/admin/posts/2186066566/edit", description: "Raises your personal frequency so your natural light becomes easier for you, and others, to feel and see." },
  { day: 8, slug: "lifting-you-higher-activation", categories: ["Energy + Frequency"], icon: "sunburst", title: "Lifting You Higher Activation: Raise your Vibration Above The Matrix Frequencies", kajabiTitle: "Lifting You Higher Activation: Raise your Vibration Above The Matrix Frequencies", mediaType: "video", wistiaId: "qpicxrk5li", kajabiLessonId: 2186067775, adminUrl: "https://app.kajabi.com/admin/posts/2186067775/edit", description: "Lifts your vibration above heavy, collective \"matrix\" frequencies so you can think, feel, and choose from a higher state." },
  { day: 9, slug: "expansion-activation", categories: ["Business + Impact"], icon: "sunburst", title: "Expansion Activation", kajabiTitle: "Expansion Activation", mediaType: "video", wistiaId: "1nl08i12gw", kajabiLessonId: 2186067824, adminUrl: "https://app.kajabi.com/admin/posts/2186067824/edit", description: "Supports you in becoming visible and taking up the space your gifts were always meant to fill." },
  { day: 10, slug: "timeline-collapse-activation", categories: ["Energy + Frequency"], icon: "infinity", title: "Timeline Collapse Activation", kajabiTitle: "Timeline Collapse Activation", mediaType: "video", wistiaId: "yary59e1n9", kajabiLessonId: 2186067895, adminUrl: "https://app.kajabi.com/admin/posts/2186067895/edit", description: "Collapses old, lower-frequency timelines so you can align with the version of your life that's already shifting." },
  { day: 11, slug: "10-min-earth-star-activation", categories: ["Energy + Frequency"], icon: "roots", title: "10 Min Earth Star Activation", kajabiTitle: "10 Min Earth Star Activation", mediaType: "video", wistiaId: "9siz7ohju0", kajabiLessonId: 2162424086, adminUrl: "https://app.kajabi.com/admin/posts/2162424086/edit", description: "Activates your Earth Star, the grounding point beneath your feet, deepening your connection to stability and safety." },
  { day: 12, slug: "intuition-activation", categories: ["Gifts + Spirit"], icon: "eye", title: "Intuition Activation", kajabiTitle: "Intuition Activation", mediaType: "video", wistiaId: "wat6njkg8r", kajabiLessonId: 2186067798, adminUrl: "https://app.kajabi.com/admin/posts/2186067798/edit", description: "Strengthens your inner knowing so you can trust the guidance that's already coming through." },
  { day: 13, slug: "chakra-balancing-and-activation", categories: ["Energy + Frequency"], icon: "spiral", title: "Chakra Balancing and Activation", kajabiTitle: "Chakra Balancing and Activation", mediaType: "video", wistiaId: "lw3e35wc2b", kajabiLessonId: 2160447433, adminUrl: "https://app.kajabi.com/admin/posts/2160447433/edit", description: "Brings your seven main energy centers back into balance, restoring flow and ease throughout your whole system." },
  { day: 14, slug: "12-strand-dna-activation", categories: ["Energy + Frequency"], icon: "spiral", title: "12 Strand DNA Activation", kajabiTitle: "12 Strand DNA Activation", mediaType: "video", wistiaId: "sop2lqvcka", kajabiLessonId: 2160447186, adminUrl: "https://app.kajabi.com/admin/posts/2160447186/edit", description: "Supports the awakening of your fuller energetic blueprint, beyond old limits you were taught to believe were fixed." },
  { day: 16, slug: "merkabah-activation", categories: ["Energy + Frequency"], icon: "spiral", title: "Merkabah Activation", kajabiTitle: "Merkabah Activation", mediaType: "video", wistiaId: "z7z3h0dq9a", kajabiLessonId: 2160447431, adminUrl: "https://app.kajabi.com/admin/posts/2160447431/edit", description: "Activates your light body and builds coherence in your merkabah, supporting you in raising your vibration." },
  { day: 17, slug: "crystalline-dragon-activation", categories: ["Energy + Frequency"], icon: "flame", title: "Crystalline Dragon Activation", kajabiTitle: "Crystalline Dragon Activation", mediaType: "video", wistiaId: "oiojlhgavp", kajabiLessonId: 2174714780, adminUrl: "https://app.kajabi.com/admin/posts/2174714780/edit", description: "Crystallizes your frequency, aligning you more fully with your soul." },
  { day: 18, slug: "pineal-gland-activation", categories: ["Gifts + Spirit"], icon: "eye", title: "Pineal Gland Activation", kajabiTitle: "Pineal Gland Activation", mediaType: "video", wistiaId: "wxmipmh1gl", kajabiLessonId: 2160447424, adminUrl: "https://app.kajabi.com/admin/posts/2160447424/edit", description: "Activates your pineal gland, supporting clearer intuition, inner vision, and psychic perception." },
  { day: 19, slug: "10-min-grounding-meditation", categories: ["Energy + Frequency"], icon: "roots", title: "10 Min Grounding Meditation Activation", kajabiTitle: "10 Min Grounding Meditation", mediaType: "video", wistiaId: "anmfxn0y1d", kajabiLessonId: 2160841833, adminUrl: "https://app.kajabi.com/admin/posts/2160841833/edit", description: "A short guided meditation to settle your nervous system and root back into your body." },
  { day: 21, slug: "clearing-negative-energy", categories: ["Energy + Frequency"], icon: "wave", title: "Clearing Negative Energy Activation", kajabiTitle: "Clearing Negative Energy", mediaType: "video", wistiaId: "uybymae4wk", kajabiLessonId: 2165170416, adminUrl: "https://app.kajabi.com/admin/posts/2165170416/edit", description: "Releases negative or draining energy from your field so you can feel lighter and clearer." },
  { day: 22, slug: "clearing-religious-vows-contracts", categories: ["Energy + Frequency"], icon: "wave", title: "Clearing Religious Vows & Contracts Activation", kajabiTitle: "Clearing Religious Vows & Contracts", mediaType: "video", wistiaId: "0o466ciczb", kajabiLessonId: 2170889676, adminUrl: "https://app.kajabi.com/admin/posts/2170889676/edit", description: "Releases old spiritual vows and contracts, from this life or before, that are quietly keeping you small." },
  // Moved from Energy + Frequency to Money + Receiving (Aug 11, later same
  // day) per Rachael's request.
  { day: 23, slug: "nervous-system-recalibration", categories: ["Money + Receiving"], icon: "roots", title: "Nervous System Recalibration Activation", kajabiTitle: "Nervous System Recalibration", mediaType: "video", wistiaId: "jmmcqyod85", kajabiLessonId: 2174348036, adminUrl: "https://app.kajabi.com/admin/posts/2174348036/edit", description: "Regulates an overworked nervous system, helping your body learn that it's safe to rest." },
  { day: 24, slug: "activating-your-gifts", categories: ["Gifts + Spirit"], icon: "lotus", title: "Activating Your Gifts Activation", kajabiTitle: "Activating Your Gifts", mediaType: "video", wistiaId: "e8a40apyjt", kajabiLessonId: 2172385361, adminUrl: "https://app.kajabi.com/admin/posts/2172385361/edit", description: "Reconnects you with the intuitive and psychic gifts you've been talking yourself out of." },
  { day: 25, slug: "activating-your-channel-to-spirit", categories: ["Gifts + Spirit"], icon: "eye", title: "Activating Your Channel To Spirit Activation", kajabiTitle: "Activating Your Channel To Spirit", mediaType: "audio", wistiaId: "r1e32rdo8s", kajabiLessonId: 2186068075, adminUrl: "https://app.kajabi.com/admin/posts/2186068075/edit", description: "Opens and strengthens your channel to Spirit, making guidance easier to receive and trust." },
  { day: 26, slug: "spirit-connection-activation", categories: ["Gifts + Spirit"], icon: "star", title: "Spirit Connection Activation", kajabiTitle: "Spirit Connection Activation", mediaType: "video", wistiaId: "lz47as3b06", kajabiLessonId: 2186068094, adminUrl: "https://app.kajabi.com/admin/posts/2186068094/edit", description: "Reopens your connection to Spirit, so support and guidance feel close again instead of distant." },
  { day: 27, slug: "meet-your-guides", categories: ["Gifts + Spirit"], icon: "star", title: "Meet Your Guides Activation", kajabiTitle: "Meet Your Guides", mediaType: "video", wistiaId: "u1o0xz6xcd", kajabiLessonId: 2160447187, adminUrl: "https://app.kajabi.com/admin/posts/2160447187/edit", description: "A guided journey to meet and connect with your spirit guides." },
  { day: 28, slug: "third-eye-activation", categories: ["Gifts + Spirit"], icon: "eye", title: "Third Eye Activation", kajabiTitle: "Third Eye Activation", mediaType: "video", wistiaId: "vjsaxob3o7", kajabiLessonId: 2186068135, adminUrl: "https://app.kajabi.com/admin/posts/2186068135/edit", description: "Activates your third eye, supporting clearer inner vision and psychic sight." },
  { day: 29, slug: "clairvoyance-activation", categories: ["Gifts + Spirit"], icon: "eye", title: "Clairvoyance Activation", kajabiTitle: "Clairvoyance Activation", mediaType: "video", wistiaId: "lskl2evxzf", kajabiLessonId: 2186068140, adminUrl: "https://app.kajabi.com/admin/posts/2186068140/edit", description: "The capstone activation of this journey, opening and strengthening your clairvoyant sight." },

  // ---------------------------------------------------------------------
  // Added Aug 11: 12 activations pulled from two other Kajabi courses at
  // Rachael's request -- "The Living Room Library" (product 2149506712,
  // aka "the living room") and "Soul-Led Empire- Align your soul into your
  // business..." (product 2148850086, aka "soul'led empire"). Unlike days
  // 1-29 above (all from CLAIRVOYANCE_COURSE), each entry here carries its
  // own sourceCourseId/sourceCourseTitle since they come from different
  // courses. `day` continues the existing index-only numbering (30-41),
  // never shown to members, same as above.
  //
  // Per Rachael's explicit rule ("Never pull a duplicate activation there
  // should always just be one activation"), 5 items from her list were
  // checked against existing content and NOT pulled:
  //  - "Freedom Timeline Activation" (Living Room, lesson 2198687758) --
  //    exact same lesson already used as GAP_METHOD_ACTIVATIONS'
  //    gap-method-creator source.
  //  - "Lifting You Higher Activation: Raise your Vibration Above The
  //    Matrix Frequencies" (Living Room, lesson 2198687760) -- identical
  //    title to ACTIVATIONS day 8 (lesson 2186067775); a different
  //    Wistia recording but the same named activation re-uploaded.
  //  - "10 Minute Earth Star Activation" (Living Room, lesson 2198687750)
  //    -- same judgment call as above vs. ACTIVATIONS day 11 "10 Min
  //    Earth Star Activation" (lesson 2162424086). Flagged for Rachael in
  //    case she wants both kept as distinct recordings.
  //  - "Success Code Activation" (Soul-Led Empire, lesson 2183799694) --
  //    exact same lesson already used as GAP_METHOD_ACTIVATIONS'
  //    gap-method-expander source.
  //  - "Step 8: Magnetic Field Activation" (Living Room, lesson
  //    2198687801, inside the 10-step "Money & Currency Flow" sequence)
  //    -- same title as Soul-Led Empire's standalone "Magnetic Field
  //    Activation" (lesson 2183799696, kept below). Kept the Soul-Led
  //    Empire copy since it sits alongside the other business activations
  //    pulled here rather than mid-sequence; flagged for Rachael in case
  //    she'd rather have the Living Room "Step 8" version instead.
  //
  // New category at the time: "Money & Business" (5 activations below) --
  // resolved the content gap flagged earlier the same day ("no activation
  // in this library was money/business-themed"). NOTE: this category has
  // since been split and re-merged -- see the two comment blocks above the
  // ACTIVATIONS export (category simplification, then the same-day
  // follow-up) for the current state. As of the follow-up, 4 of these 5
  // entries are back to "Money & Business" (Confidence Activation is the
  // exception -- it moved to "Leadership" and stayed there), and 2 Vibe
  // Booster activations from earlier in this file (days 35-36) joined
  // "Money & Business" too.
  //
  // Description confidence: written in the same one-sentence style as the
  // rest of this file, but several of these titles are Rachael's own
  // branded/framework language with no lesson body pulled (Remembrance,
  // Sacred Bowl, 10 Min Star Healing, Yes Factor Vibe Booster, Crystal
  // Business, Emerging Your Soul Into Your Business) -- these are
  // best-guess placeholders inferred from title + course/module context,
  // not confirmed lesson content. Flagged for Rachael to correct if off.
  { day: 30, slug: "remembrance-activation", categories: ["Gifts + Spirit"], icon: "star", title: "Remembrance Activation", kajabiTitle: "Remembrance Activation", mediaType: "video", wistiaId: "tgqa502p2u", kajabiLessonId: 2198687773, adminUrl: "https://app.kajabi.com/admin/posts/2198687773/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "Reconnects you with the deeper truth of who you are beneath the noise, helping you remember your soul's original frequency." },
  { day: 31, slug: "sacred-bowl-activation", categories: ["Energy + Frequency"], icon: "wave", title: "Sacred Bowl Activation", kajabiTitle: "Sacred Bowl Activation", mediaType: "video", wistiaId: "yejf28nfta", kajabiLessonId: 2198687816, adminUrl: "https://app.kajabi.com/admin/posts/2198687816/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "Uses sound frequency to clear and reset your energy field, leaving you calmer and more spacious." },
  { day: 32, slug: "throat-chakra-activation", categories: ["Energy + Frequency"], icon: "spiral", title: "Throat Chakra Activation", kajabiTitle: "Throat Chakra Activation", mediaType: "video", wistiaId: "nsjctru3nw", kajabiLessonId: 2198687819, adminUrl: "https://app.kajabi.com/admin/posts/2198687819/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "Opens and balances your throat chakra, supporting you in speaking and being heard with more ease and truth." },
  { day: 33, slug: "10-min-protection-activation", categories: ["Energy + Frequency"], icon: "roots", title: "10 Min Protection Activation", kajabiTitle: "10 min Protection Activation", mediaType: "video", wistiaId: "95sg0nmexr", kajabiLessonId: 2198687751, adminUrl: "https://app.kajabi.com/admin/posts/2198687751/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "A short practice to strengthen your energetic boundaries, so you feel safe and unaffected by outside energy." },
  { day: 34, slug: "10-min-star-healing-activation", categories: ["Gifts + Spirit"], icon: "star", title: "10 Min Star Healing Activation", kajabiTitle: "10 min Star healing Activation", mediaType: "video", wistiaId: "2b00ntgfcw", kajabiLessonId: 2198687774, adminUrl: "https://app.kajabi.com/admin/posts/2198687774/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "A short guided healing connecting you to higher star frequencies, supporting deeper clarity and calm." },
  { day: 35, slug: "yes-factor-vibe-booster", categories: ["Business + Impact", "Money + Receiving"], icon: "sunburst", title: "Yes Factor Vibe Booster", kajabiTitle: "Yes Factor Vibe Booster", mediaType: "video", wistiaId: "x0yckzeg55", kajabiLessonId: 2198687787, adminUrl: "https://app.kajabi.com/admin/posts/2198687787/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "A quick frequency boost to help you say yes to more of what you want, clearing hesitation and doubt." },
  { day: 36, slug: "morning-vibe-booster", categories: ["Business + Impact", "Money + Receiving"], icon: "sunburst", title: "Morning Vibe Booster", kajabiTitle: "Morning Vibe Booster", mediaType: "video", wistiaId: "mqtt3h2qwi", kajabiLessonId: 2198687782, adminUrl: "https://app.kajabi.com/admin/posts/2198687782/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "A short practice to set your frequency for the day, so you start from clarity and calm instead of catching up." },
  { day: 37, slug: "emerging-your-soul-into-your-business", categories: ["Business + Impact"], icon: "lotus", title: "Emerging Your Soul Into Your Business Activation", kajabiTitle: "Emerging your SOUL into your Business", mediaType: "video", wistiaId: "t85f6wrrca", kajabiLessonId: 2183799684, adminUrl: "https://app.kajabi.com/admin/posts/2183799684/edit", sourceCourseId: 2148850086, sourceCourseTitle: "Soul-Led Empire", description: "Helps you bring your full soul and energy into how you run your business, instead of operating from strategy alone." },
  { day: 38, slug: "crystal-business-activation", categories: ["Business + Impact"], icon: "crystal", title: "Crystal Business Activation", kajabiTitle: "Crystal Business Activation", mediaType: "video", wistiaId: "wx3aov4sdt", kajabiLessonId: 2183799686, adminUrl: "https://app.kajabi.com/admin/posts/2183799686/edit", sourceCourseId: 2148850086, sourceCourseTitle: "Soul-Led Empire", description: "Uses crystalline energy to support clarity, focus, and flow in your business." },
  { day: 39, slug: "confidence-activation", categories: ["Business + Impact"], icon: "flame", title: "Confidence Activation", kajabiTitle: "Confidence Activation", mediaType: "video", wistiaId: "g3x5oewkjr", kajabiLessonId: 2183799688, adminUrl: "https://app.kajabi.com/admin/posts/2183799688/edit", sourceCourseId: 2148850086, sourceCourseTitle: "Soul-Led Empire", description: "Strengthens your confidence so you can show up, speak up, and make decisions in your business without second-guessing yourself." },
  { day: 40, slug: "alignment-activation", categories: ["Business + Impact"], icon: "infinity", title: "Alignment Activation", kajabiTitle: "Alignment Activation", mediaType: "video", wistiaId: "iezkyms2o7", kajabiLessonId: 2183799692, adminUrl: "https://app.kajabi.com/admin/posts/2183799692/edit", sourceCourseId: 2148850086, sourceCourseTitle: "Soul-Led Empire", description: "Realigns you with your business's true direction, clearing static so your next steps feel obvious." },
  { day: 41, slug: "magnetic-field-activation", categories: ["Business + Impact", "Money + Receiving"], icon: "spiral", title: "Magnetic Field Activation", kajabiTitle: "Magnetic Field Activation", mediaType: "video", wistiaId: "0r8hs3d8jx", kajabiLessonId: 2183799696, adminUrl: "https://app.kajabi.com/admin/posts/2183799696/edit", sourceCourseId: 2148850086, sourceCourseTitle: "Soul-Led Empire", description: "Strengthens your personal magnetism so opportunities, clients, and money have an easier path to you." },

  // ---------------------------------------------------------------------
  // Added Aug 11, later same day: 3 activations pulled from "6-Figure
  // Empire" (product 2148931549) at Rachael's explicit request -- Wealth
  // Frequency Activation, Impact Vibe Booster, Million Dollar Blueprint
  // Activation. All 3 land in "Money & Business" per her instruction.
  //
  // Duplicate check (per the standing "never pull a duplicate" rule): this
  // course's Module 9 submodule ("Soul-Led Empire- Become one with your
  // business...") turned out to contain re-uploaded copies of several
  // activations already in this library under different Wistia IDs --
  // "Emerging your Soul into Your Business" (2185947803), "Crystal Business
  // Codes Activation" (2185947805), "Confidence Code Activation"
  // (2185947807), "Business Alignment Activation" (2185947811), "Success
  // Code Activation" (2185947813 -- also an exact duplicate of
  // GAP_METHOD_ACTIVATIONS' gap-method-expander source), and "Magnetic
  // Field Activation" (2185947815). None of those were pulled -- flagging
  // here for Rachael in case she'd rather have any of these specific
  // re-recordings swapped in later. The 3 titles actually requested
  // (below) are NOT duplicates of anything already in this file.
  //
  // Description confidence: same as other recent additions -- no lesson
  // body was pulled, so these are best-guess one-sentence placeholders
  // inferred from title + module context, not confirmed lesson content.
  { day: 42, slug: "million-dollar-blueprint-activation", categories: ["Business + Impact", "Money + Receiving"], icon: "star", title: "Million Dollar Blueprint Activation", kajabiTitle: "Million Dollar BluePrint Activation", mediaType: "video", wistiaId: "e53te4l2k4", kajabiLessonId: 2185947761, adminUrl: "https://app.kajabi.com/admin/posts/2185947761/edit", sourceCourseId: 2148931549, sourceCourseTitle: "6-Figure Empire", description: "Activates the identity and frequency of your fully expanded, million-dollar self, so your actions can start matching that reality." },
  { day: 43, slug: "wealth-frequency-activation", categories: ["Money + Receiving"], icon: "crystal", title: "Wealth Frequency Activation", kajabiTitle: "Wealth Frequency Activation", mediaType: "video", wistiaId: "otno0qdo86", kajabiLessonId: 2187609786, adminUrl: "https://app.kajabi.com/admin/posts/2187609786/edit", sourceCourseId: 2148931549, sourceCourseTitle: "6-Figure Empire", description: "Recalibrates your nervous system and energy field to receive and hold greater wealth, rather than unconsciously blocking it." },
  { day: 44, slug: "impact-vibe-booster", categories: ["Business + Impact", "Money + Receiving"], icon: "sunburst", title: "Impact Vibe Booster", kajabiTitle: "Impact Vibe Booster", mediaType: "video", wistiaId: "9ig8vevada", kajabiLessonId: 2185947809, adminUrl: "https://app.kajabi.com/admin/posts/2185947809/edit", sourceCourseId: 2148931549, sourceCourseTitle: "6-Figure Empire", description: "A quick frequency boost to reconnect you with the deeper impact your work is here to make." },

  // Added Aug 11, later same day: pulled from "The Living Room Library"
  // (product 2149506712) > "Quantum Activations" > "Frequency Shifts"
  // submodule at Rachael's request. Not a duplicate of anything already in
  // this file -- distinct from the nearby "Royalty Code Leadership
  // Activation" in the same submodule, which was not requested and was not
  // pulled. Placed in "Leadership" rather than "Money & Business" since the
  // title and framing are about leadership, not money/business -- flagged
  // here as a judgment call in case Rachael intended it for Money &
  // Business instead. Description confidence: best-guess placeholder, no
  // lesson body pulled, same caveat as other recent additions.
  { day: 45, slug: "leadership-recode-activation", categories: ["Business + Impact"], icon: "wave", title: "Leadership Recode Activation", kajabiTitle: "Leadership Recode Activation", mediaType: "video", wistiaId: "k0cog9tlea", kajabiLessonId: 2198687747, adminUrl: "https://app.kajabi.com/admin/posts/2198687747/edit", sourceCourseId: 2149506712, sourceCourseTitle: "The Living Room Library", description: "Recodes old leadership patterns and hesitation, supporting you to lead from your fullest, most embodied authority." },
];

export function getActivationBySlug(slug) {
  return ACTIVATIONS.find((a) => a.slug === slug) ?? null;
}

export function getActivationByDay(day) {
  return ACTIVATIONS.find((a) => a.day === day) ?? null;
}

export function getWistiaEmbedUrl(activation) {
  return WISTIA_EMBED_BASE + activation.wistiaId;
}

// Entries still missing a real description -- Rachael asked to see this
// list so she can supply the copy herself rather than have it guessed.
export function getActivationsMissingDescription() {
  return ACTIVATIONS.filter((a) => !a.description);
}

// ---------------------------------------------------------------------------
// GAP Method Activations -- the 7 Divine Identity personalized activations
// (Aug 10 addition). These are a SEPARATE registry from ACTIVATIONS above --
// do not merge them in or guess-match them to the 29-day course by name
// similarity. Two of these titles ("Nervous System Recalibration" and
// "Activating Your Gifts") happen to read the same as ACTIVATIONS Day 23/24,
// but they are different underlying Kajabi products with different course
// IDs, lesson IDs and (once uploaded) different Wistia videos. Treat them as
// unrelated content that happens to share a name.
//
// Source of truth: each of the 7 Divine Identities in lib/divineIdentities.js
// has a `personalizedActivation` (name/description/kajabiOfferId) but that
// file does not carry the underlying Kajabi PRODUCT id, course structure, or
// Wistia video id -- this registry fills that gap the same way ACTIVATIONS
// does for the 30-day course, so the player/entitlement layer has one real
// data source instead of two half-complete ones.
//
// Verified against Kajabi (Aug 10, via get_product + get_course, site
// 2147567473): all 7 product ids below are real, sellable, published
// "Course"-type products, each containing exactly one module with one lesson
// whose title matches the product title. HOWEVER: every one of those 7
// lessons currently has publishing_state "draft" and media { type: "none",
// wistia_id: null } -- i.e. Rachael has not yet uploaded/attached video to
// any of them. wistiaId is therefore `null` below, not a guessed value.
// TODO(Rachael): upload each lesson's video in the Kajabi admin (adminUrl
// below) and publish the lesson/module; once wistia_id appears in
// get_course, fill it in here. Until then, any player UI reading
// wistiaId === null should show a "coming soon" state rather than attempt
// playback.
//
// This registry exists to support Rachael's Aug 10 request: the new scoped
// GAP Method trial unlocks exactly these 7 activations (see
// GAP_METHOD_ACTIVATION_SLUGS / isGapMethodActivation below, and
// lib/entitlements.js's unlockedActivationSlugs), while everything else in
// the Activation Library (the 29-day course) stays locked until full
// membership (tier_active) or Beta membership.
//
// showInLibrary / libraryCategories (added Aug 11, later same day): Rachael
// asked for two related things. First, the "GAP Method Activations" section
// on the Activations page (the one that shows all 7 of these) should ONLY
// be visible to members currently on the 3-day GAP Method trial, never to
// full/paying members -- previously it rendered unconditionally regardless
// of entitlement. Second, these activations "are also not found inside the
// activation library" and should be added there too, "as part of the full
// access app experience," so a paying member can discover them the normal
// way, not just through the trial-only section.
//
// Only 4 of the 7 get `showInLibrary: true` -- gap-method-wayshower,
// gap-method-leader, gap-method-creator, gap-method-expander. The other 3
// (guardian, messenger, healer) reuse the EXACT SAME Wistia video as an
// entry already sitting in ACTIVATIONS above (nervous-system-recalibration,
// activating-your-gifts, spirit-connection-activation respectively) -- per
// the standing "never show a duplicate activation" rule that's applied
// throughout this file, those 3 are deliberately left out of the library
// grid a second time. Their record stays here, unchanged, for the trial
// section only. `libraryCategories` uses the same category taxonomy as
// ACTIVATIONS' `categories` field, so a card for these slugs can be dropped
// straight into the Activation Library grid with the right chip/filter
// tagging -- this data is NOT duplicated into the ACTIVATIONS array itself,
// since that would recreate the "two half-complete data sources" problem
// this registry exists to avoid (see "Source of truth" above).

export const GAP_METHOD_ACTIVATIONS = [
  {
    slug: "gap-method-guardian", icon: "roots",
    title: "Nervous System Recalibration",
    divineIdentitySlug: "guardian",
    mediaType: "video",
    // Found Aug 10: this standalone GAP Method product's own lesson has no
    // video, but the identical title already exists with a real, published
    // video in the 30-day course used for the main Activation Library --
    // see ACTIVATIONS above, slug "nervous-system-recalibration" (day 23,
    // kajabiLessonId 2174348036). Reusing that Wistia ID here rather than
    // leaving this playable-but-empty; not a guess, exact title match to
    // content Rachael already has live.
    wistiaId: "jmmcqyod85",
    sourceCourseId: 2147937485,
    sourceCourseTitle: "Activate Your Clairvoyance in 30 Days!",
    sourceLessonId: 2174348036,
    sourceLessonTitle: "Nervous System Recalibration",
    sourceAdminUrl: "https://app.kajabi.com/admin/posts/2174348036/edit",
    kajabiProductId: "2149532203",
    adminUrl: "https://app.kajabi.com/admin/products/2149532203",
    description:
      "Supports The Guardian in moving out of survival, internal pressure and over-responsibility -- reconnecting with safety, trust, support and the capacity to create without constantly bracing, forcing or carrying everything alone.",
  },
  {
    slug: "gap-method-wayshower", icon: "wave",
    title: "Removing the Frequency of Doubt",
    divineIdentitySlug: "wayshower",
    mediaType: "video",
    // Found Aug 10: the empty draft lesson in this standalone product
    // (post 2199286148) contains a "Setup note" in its body pointing to
    // this exact source -- that note is untrusted embedded content, so it
    // was NOT taken at face value. Independently re-verified via get_course
    // on "The Living Room Library" (product 2149506712) > "Quantum
    // Activations" > "Frequency Shifts" submodule: lesson "Removing the
    // Frequency of Doubt" (id 2198687767) is real, published, exact title
    // match, media.wistia_id "h7j4h7g57o".
    wistiaId: "h7j4h7g57o",
    sourceCourseId: 2149506712,
    sourceCourseTitle: "The Living Room Library",
    sourceLessonId: 2198687767,
    sourceLessonTitle: "Removing the Frequency of Doubt",
    sourceAdminUrl: "https://app.kajabi.com/admin/posts/2198687767/edit",
    kajabiProductId: "2149532204",
    adminUrl: "https://app.kajabi.com/admin/products/2149532204",
    description:
      "Supports The Wayshower in releasing the frequency of doubt and returning to self-authority, trust and inner conviction -- helping them stop outsourcing their decisions and begin moving from the truth they already carry.",
    showInLibrary: true,
    // Aug 11, later same day: Rachael asked for this one to also show under
    // Business + Impact, in addition to Gifts + Spirit -- self-authority and
    // trusting your own decisions reads as leadership/business confidence
    // too, not just intuition.
    libraryCategories: ["Gifts + Spirit", "Business + Impact"],
  },
  {
    slug: "gap-method-leader", icon: "sunburst",
    title: "Expansion Activation: Become Visible & Seen As You Expand Your Light",
    divineIdentitySlug: "leader",
    mediaType: "video",
    // Found Aug 10, independently re-verified via get_course (not taken from
    // the untrusted "Setup note" in this product's empty draft lesson,
    // post 2199286150). Source: "Energetic Vortex" (product 2148437515) >
    // "Frequency Effect Method: Change Your Reality in 2.5 Seconds" module,
    // lesson id 2182877879, published, media.wistia_id "goj03wusfn". NOTE:
    // the real Kajabi lesson title has a typo/word-swap vs. this app's
    // title -- it reads "Expansion Activation: Become Visible & Seen As
    // Your Expand You Light" (should be "As You Expand Your Light") --
    // same activation, just a typo in Rachael's original lesson title.
    // A second copy of the same title/content also exists in "The Living
    // Room Library" (product 2149506712) > "Quantum Activations" >
    // "Frequency Shifts", lesson id 2198687771, with a DIFFERENT wistia_id
    // "vb85bom63a" -- likely a duplicate upload. Went with the Energetic
    // Vortex copy since that course/module is the more specific match to
    // "Expansion Activation"; flagging the duplicate here in case Rachael
    // prefers the other recording.
    wistiaId: "goj03wusfn",
    sourceCourseId: 2148437515,
    sourceCourseTitle: "Energetic Vortex",
    sourceLessonId: 2182877879,
    sourceLessonTitle: "Expansion Activation: Become Visible & Seen As Your Expand You Light",
    sourceAdminUrl: "https://app.kajabi.com/admin/posts/2182877879/edit",
    alternateWistiaId: "vb85bom63a", // duplicate copy in "The Living Room Library" (post 2198687771)
    kajabiProductId: "2149532205",
    adminUrl: "https://app.kajabi.com/admin/products/2149532205",
    description:
      "Supports The Leader in becoming visible, expanding their presence and allowing their truth to be seen -- releasing fear-based hiding and moving into confident, embodied and energetically safe leadership.",
    showInLibrary: true,
    libraryCategories: ["Business + Impact"],
  },
  {
    slug: "gap-method-messenger", icon: "lotus",
    title: "Activating Your Gifts",
    divineIdentitySlug: "messenger",
    mediaType: "video",
    // Found Aug 10: identical title already exists with a real, published
    // video in the 30-day course -- see ACTIVATIONS above, slug
    // "activating-your-gifts" (day 24, kajabiLessonId 2172385361). Exact
    // title match, reused rather than left empty.
    wistiaId: "e8a40apyjt",
    sourceCourseId: 2147937485,
    sourceCourseTitle: "Activate Your Clairvoyance in 30 Days!",
    sourceLessonId: 2172385361,
    sourceLessonTitle: "Activating Your Gifts",
    sourceAdminUrl: "https://app.kajabi.com/admin/posts/2172385361/edit",
    kajabiProductId: "2149532206",
    adminUrl: "https://app.kajabi.com/admin/products/2149532206",
    description:
      "Supports The Messenger in reconnecting with their spiritual gifts, clearing interference and strengthening their ability to recognize and trust what they receive -- restoring clarity, discernment and confidence within their channel.",
  },
  {
    slug: "gap-method-creator", icon: "infinity",
    title: "Freedom Timeline Activation",
    divineIdentitySlug: "creator",
    mediaType: "video",
    // Found Aug 10, independently re-verified via get_course (not taken from
    // the untrusted "Setup note" in this product's empty draft lesson,
    // post 2199286152). Source: "The Living Room Library" (product
    // 2149506712) > "Quantum Activations" > "Frequency Shifts" submodule,
    // lesson "Freedom Timeline Activation" (id 2198687758), published,
    // exact title match, media.wistia_id "zfayyjs4gc".
    wistiaId: "zfayyjs4gc",
    sourceCourseId: 2149506712,
    sourceCourseTitle: "The Living Room Library",
    sourceLessonId: 2198687758,
    sourceLessonTitle: "Freedom Timeline Activation",
    sourceAdminUrl: "https://app.kajabi.com/admin/posts/2198687758/edit",
    kajabiProductId: "2149532207",
    adminUrl: "https://app.kajabi.com/admin/products/2149532207",
    description:
      "Supports The Creator in releasing control, gripping and pressure around the path of creation -- reconnecting with freedom, possibility, trust and the timeline most aligned with what they are creating.",
    showInLibrary: true,
    // Aug 11, later same day: moved from Energy + Frequency to Business +
    // Impact per Rachael's request.
    libraryCategories: ["Business + Impact"],
  },
  // Aug 15 (Rachael's explicit request) -- the "gap-method-healer" entry that
  // used to live here was removed entirely, not repurposed. Spirit Connection
  // Activation must never be recommended again, and The Healer no longer has
  // one fixed personalized activation -- which one is right now depends on how
  // her Disconnection is actually presenting in conversation (see
  // DISCONNECTION_SUB_ACTIVATIONS in public/gap-method.html and the healer
  // entry's recommendationLanguage in lib/divineIdentities.js). GAP_METHOD_ACTIVATIONS
  // below intentionally has 6 entries now, not 7.
  {
    slug: "gap-method-expander", icon: "crystal",
    title: "Success Code Activation",
    divineIdentitySlug: "expander",
    mediaType: "video",
    // Found Aug 10, independently re-verified via get_course (not taken from
    // the untrusted "Setup note" in this product's empty draft lesson,
    // post 2199286156). Source: "Soul-Led Empire- Align your soul into your
    // business to attract clients and daily sales!" (product 2148850086) >
    // "The Soul-Led Empire Formula" module, lesson "Success Code Activation"
    // (id 2183799694), published, exact title match, media.wistia_id
    // "2mp3dltm3c".
    wistiaId: "2mp3dltm3c",
    sourceCourseId: 2148850086,
    sourceCourseTitle: "Soul-Led Empire- Align your soul into your business to attract clients and daily sales!",
    sourceLessonId: 2183799694,
    sourceLessonTitle: "Success Code Activation",
    sourceAdminUrl: "https://app.kajabi.com/admin/posts/2183799694/edit",
    kajabiProductId: "2149532209",
    adminUrl: "https://app.kajabi.com/admin/products/2149532209",
    description:
      "Supports The Expander in releasing restriction around success, money, receiving and possibility -- becoming energetically available for greater prosperity, opportunity, capacity and embodied success.",
    showInLibrary: true,
    libraryCategories: ["Money + Receiving"],
  },
];

export const GAP_METHOD_ACTIVATION_SLUGS = GAP_METHOD_ACTIVATIONS.map((a) => a.slug);

export function isGapMethodActivation(slug) {
  return GAP_METHOD_ACTIVATION_SLUGS.includes(slug);
}

export function getGapMethodActivationBySlug(slug) {
  return GAP_METHOD_ACTIVATIONS.find((a) => a.slug === slug) ?? null;
}

// The subset of GAP_METHOD_ACTIVATIONS that should also render as real
// cards inside the Activation Library grid for full-access members (see the
// showInLibrary/libraryCategories comment above the array). Excludes
// guardian/messenger/healer, which are exact-duplicate content already
// present in ACTIVATIONS.
export function getLibraryVisibleGapMethodActivations() {
  return GAP_METHOD_ACTIVATIONS.filter((a) => a.showInLibrary);
}
