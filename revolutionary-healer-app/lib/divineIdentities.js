// Divine Identity Framework -- the 7 identities at the core of the 3 Step GAP
// Method. Spec ref: SPEC.md §4.1c. Source: Rachael's full framework doc (Aug 4).
//
// TERMINOLOGY RULE (do not violate): customer-facing copy and bot output must
// only ever say "Your Divine Identity: The ___". Never say "archetype,"
// "personality type," "character type," "label," or "diagnosis." The `slug`
// below is an internal identifier only -- it must never leak into anything
// the member sees. See lib/processes.js's 3-step-gap-method promptAddendum
// for the full rules this registry is built to serve.
//
// Each identity's `currentFrequency` is a TEMPORARY distortion, never the
// person's identity. Every piece of copy that references a Current Frequency
// must pair it with the Divine Identity it belongs to and make clear the
// distortion is not who they are.
//
// personalizedActivation.checkoutUrl / kajabiOfferId (Aug 4): each of the 7
// activations already exists as a real $9 Kajabi offer -- these are the SAME
// 7 offers built earlier for the old "archetype" Step 3 (see
// step3-activation-products-reference.md), which turn out to map 1:1 onto
// these Divine Identities. This means Step 3's "Unlock Your Personalized
// Frequency Diagnostic -- $9" invitation IS a real, already-built checkout
// for whichever identity the member is diagnosed as -- it just needs a
// results screen to route to the right one. TODO(Rachael): all 7 offers are
// still status "draft" in Kajabi (confirmed Aug 4) -- publish each one in the
// Kajabi admin UI before this can go live.

export const DIVINE_IDENTITIES = [
  {
    slug: "guardian",
    displayName: "The Guardian",
    currentFrequency: "Over-Responsibility",
    highLevelDescription:
      "Naturally strong, dependable, discerning and protective. Creates safety, stability and grounded leadership for themselves and the people around them.",
    highestExpression: [
      "Grounded strength",
      "Safety",
      "Stability",
      "Trust",
      "Healthy protection",
      "Discernment",
      "Resilience",
      "Nervous-system capacity",
      "Sustainable action",
      "The ability to receive support",
    ],
    recognitionPatterns: [
      "Constantly overworking",
      "Feeling responsible for everyone",
      "Difficulty resting without guilt",
      "Struggling to receive help",
      "Believing they must handle everything themselves",
      "Feeling unsafe when they are not in control",
      "Preparing for what could go wrong",
      "Carrying emotional, financial or practical responsibility for others",
      "Feeling unable to slow down",
      "Connecting productivity with safety",
      "Feeling as though success creates even more responsibility",
      "Living in a state of internal pressure",
    ],
    gapExplanation:
      "The GAP is not a lack of strength. The Guardian already possesses strength, resilience and capacity. The GAP exists between their natural ability to create safety and their current belief that safety must be earned by doing more, carrying more and controlling more. Their strength has not disappeared -- it may simply be operating through survival rather than trust.",
    highestLeverageShift: {
      from: ["Survival", "Overworking", "Hyper-responsibility", "Control", "Nervous-system pressure"],
      into: ["Safety", "Trust", "Support", "Grounded strength", "Sustainable leadership", "Nervous-system regulation"],
    },
    customerFacingResult:
      "Your Divine Identity is The Guardian. You are currently moving through the frequency of over-responsibility. You are naturally strong, capable and protective, but your system may have learned that the only way to remain safe is to keep doing, carrying and controlling everything yourself. Your strength is not the problem. The GAP is between the safety you are designed to embody and the amount of responsibility you currently believe you must carry to create it.",
    // Step 1 example multiple-choice signals (Aug 5 in-app member script) --
    // weighted evidence, not a mechanical one-answer match.
    stepOneSignals: {
      stuckFeeling: "I am carrying too much and cannot seem to slow down.",
      fearMost: "That everything will fall apart if I stop.",
      copingBehavior: "Work harder and take on more.",
    },
    // Step 2 deep-dive questions (Aug 5 in-app member script).
    deepDiveQuestions: [
      "What do you believe would happen if you stopped carrying so much?",
      "Where in your life do you feel most responsible for holding everything together?",
      "What happens inside you when someone offers support?",
      "What does your system seem to believe rest would cost you?",
    ],
    // Rachael's exact Step 3 recommendation language (Aug 5).
    recommendationLanguage:
      "Nervous System Recalibration is designed to support you in moving out of survival and over-responsibility and back into safety, trust and grounded strength. This activation can help your system begin releasing the belief that everything depends on you carrying more.",
    personalizedActivation: {
      name: "Nervous System Recalibration",
      description:
        "Supports The Guardian in moving out of survival, internal pressure and over-responsibility -- reconnecting with safety, trust, support and the capacity to create without constantly bracing, forcing or carrying everything alone.",
      kajabiOfferId: "2151318706",
      checkoutUrl: "https://www.rachaelsbutterflyeffect.com/offers/soupFgZY/checkout",
      offerStatus: "draft", // TODO(Rachael): publish in Kajabi admin
    },
  },
  {
    slug: "wayshower",
    displayName: "The Wayshower",
    currentFrequency: "Doubt",
    highLevelDescription:
      "Here to recognize, embody and demonstrate possibilities before they are obvious to everyone else -- often called toward unconventional decisions, new paths and original ideas without external proof.",
    highestExpression: [
      "Sovereignty",
      "Self-authority",
      "Conviction",
      "Courage",
      "Independent thought",
      "Innovation",
      "Embodied wisdom",
      "Unconventional leadership",
      "Trust in inner direction",
      "The ability to show others what is possible",
    ],
    recognitionPatterns: [
      "Second-guessing decisions",
      "Waiting for permission",
      "Giving authority away",
      "Looking outside themselves for certainty",
      "Following formulas that do not feel aligned",
      "Fear of making the wrong decision",
      "Difficulty trusting unconventional ideas",
      "Believing someone else has the answer",
      "Suppressing what they know",
      "Needing external proof before acting",
      "Repeatedly changing direction after receiving outside opinions",
      "Feeling disempowered despite sensing what they want",
    ],
    gapExplanation:
      "The GAP is not a lack of direction. The Wayshower may already know more than they realize. The GAP exists between what they internally recognize and the amount of authority they currently give themselves to follow it -- they may be waiting for external confirmation of a path they were designed to validate through embodiment.",
    highestLeverageShift: {
      from: ["Doubt", "External validation", "Indecision", "Disempowerment", "Waiting for permission"],
      into: ["Sovereignty", "Self-trust", "Conviction", "Courageous decision-making", "Embodied authority"],
    },
    customerFacingResult:
      "Your Divine Identity is The Wayshower. You are currently moving through the frequency of doubt. You are designed to recognize and embody possibilities before they become obvious to everyone else -- this means your path will not always arrive with external proof, agreement or a formula to follow. The GAP is not that you do not know. The GAP may be between what you already recognize as true and how much authority you currently give yourself to follow it.",
    stepOneSignals: {
      stuckFeeling: "I keep doubting myself and looking outside myself for answers.",
      fearMost: "That I will make the wrong decision.",
      copingBehavior: "Ask other people what they think.",
    },
    deepDiveQuestions: [
      "What decision or direction do you already sense is right for you?",
      "Whose approval or confirmation are you still waiting for?",
      "What path feels true even though it does not have external proof yet?",
      "What do you fear would happen if you trusted your own authority completely?",
    ],
    recommendationLanguage:
      "Removing the Frequency of Doubt is designed to support you in releasing second-guessing and returning to self-authority, inner conviction and trust in your own path. This activation can help you stop waiting for external proof and begin moving from what you already know.",
    personalizedActivation: {
      name: "Removing the Frequency of Doubt",
      description:
        "Supports The Wayshower in releasing the frequency of doubt and returning to self-authority, trust and inner conviction -- helping them stop outsourcing their decisions and begin moving from the truth they already carry.",
      kajabiOfferId: "2151318707",
      checkoutUrl: "https://www.rachaelsbutterflyeffect.com/offers/G8oLf2Yr/checkout",
      offerStatus: "draft", // TODO(Rachael): publish in Kajabi admin
    },
  },
  {
    slug: "leader",
    displayName: "The Leader",
    currentFrequency: "Hiddenness",
    highLevelDescription:
      "Here to influence, guide, communicate truth and create meaningful impact -- carries a natural presence that can shift rooms, communities, conversations and possibilities.",
    highestExpression: [
      "Visible leadership",
      "Embodied authority",
      "Influence",
      "Courageous expression",
      "Strong boundaries",
      "Truth",
      "Confidence",
      "Impact",
      "Integrity",
      "The ability to be fully seen",
    ],
    recognitionPatterns: [
      "Fear of visibility",
      "Playing small",
      "Diluting their message",
      "People-pleasing",
      "Avoiding strong opinions",
      "Hiding their gifts",
      "Waiting for permission",
      "Difficulty maintaining boundaries",
      "Fear of rejection",
      "Fear of being misunderstood",
      "Softening their truth",
      "Reducing their presence to remain acceptable",
      "Knowing what they want to say but not saying it",
      "Staying behind the scenes when they are meant to lead",
    ],
    gapExplanation:
      "The GAP is not a lack of leadership. The Leader already carries authority, truth and impact. The GAP exists between the leader they already are and the amount of that leadership they currently feel safe embodying publicly. Their leadership is not missing -- it may be hidden beneath self-protection.",
    highestLeverageShift: {
      from: ["Hiddenness", "Fear of visibility", "Self-protection", "People-pleasing", "Diluted truth"],
      into: ["Visibility", "Embodied authority", "Strong boundaries", "Courageous expression", "Full leadership"],
    },
    customerFacingResult:
      "Your Divine Identity is The Leader. You are currently moving through the frequency of hiddenness. You are here to lead, influence and create impact, but fear of judgment, rejection or being fully seen may be causing you to soften your truth or reduce your presence. Your leadership has not disappeared. The GAP is between the leader you already are and the amount of your leadership you currently feel safe allowing other people to see.",
    stepOneSignals: {
      stuckFeeling: "I know I am meant to be seen, but I keep holding back.",
      fearMost: "That I will be judged, rejected or misunderstood.",
      copingBehavior: "Make myself less visible.",
    },
    deepDiveQuestions: [
      "What truth are you currently holding back?",
      "What do you believe could happen if you became fully visible?",
      "Where are you softening your message to remain accepted?",
      "Whose judgment still influences how fully you show up?",
    ],
    recommendationLanguage:
      "Expansion Activation supports you in becoming visible and allowing your truth, leadership and light to be fully seen. This activation can help shift the connection between visibility and danger so you can expand without reducing yourself.",
    personalizedActivation: {
      name: "Expansion Activation: Become Visible & Seen As You Expand Your Light",
      description:
        "Supports The Leader in becoming visible, expanding their presence and allowing their truth to be seen -- releasing fear-based hiding and moving into confident, embodied and energetically safe leadership.",
      kajabiOfferId: "2151318708",
      checkoutUrl: "https://www.rachaelsbutterflyeffect.com/offers/ELi5FoPE/checkout",
      offerStatus: "draft", // TODO(Rachael): publish in Kajabi admin
    },
  },
  {
    slug: "messenger",
    displayName: "The Messenger",
    currentFrequency: "Channel Interference",
    highLevelDescription:
      "Designed to receive, interpret and communicate truth -- gifts may express through intuition, psychic knowing, channeling, teaching, writing, speaking, healing or spiritual leadership.",
    highestExpression: [
      "A clear channel",
      "Discernment",
      "Inner knowing",
      "Truth transmission",
      "Psychic clarity",
      "Spiritual confidence",
      "Clear communication",
      "Trusted reception",
      "Connection with God and soul",
      "The ability to translate what they receive",
    ],
    recognitionPatterns: [
      "A foggy channel",
      "Inconsistent spiritual gifts",
      "Second-guessing messages",
      "Confusion",
      "Overanalysis",
      "Difficulty discerning intuition from thought",
      "Looking outside themselves for confirmation",
      "Fear of interpreting information incorrectly",
      "Pressure to be right",
      "Mental noise",
      "Gifts that were previously clear now feeling inaccessible",
      "Difficulty trusting inner knowing",
      "Receiving conflicting information",
      "Forcing messages rather than allowing them",
    ],
    gapExplanation:
      "The GAP is not a lack of spiritual ability. The Messenger's gift may already be active. The GAP exists between what they are receiving and how clearly or safely they currently feel able to interpret and trust it. Their gifts are not necessarily gone -- interference may be making them harder to recognize.",
    highestLeverageShift: {
      from: ["Channel interference", "Mental noise", "Second-guessing", "Pressure", "Confusion"],
      into: ["Clarity", "Discernment", "Trusted reception", "Spiritual confidence", "Clear communication"],
    },
    customerFacingResult:
      "Your Divine Identity is The Messenger. You are currently experiencing channel interference. You are designed to receive and communicate truth, but mental noise, pressure or second-guessing may be making it difficult to clearly recognize and trust what you receive. Your gifts are not gone. The GAP may be between the information already moving through you and how safe, clear and confident you currently feel interpreting it.",
    stepOneSignals: {
      stuckFeeling: "My gifts or inner guidance feel foggy or inconsistent.",
      fearMost: "That I cannot trust what I am receiving.",
      copingBehavior: "Analyze the message until I no longer trust it.",
    },
    deepDiveQuestions: [
      "What do you usually do immediately after receiving an intuitive message?",
      "What causes you to question whether the guidance is accurate?",
      "Whose confirmation do you look for before trusting what you receive?",
      "When did your channel begin to feel less clear or consistent?",
    ],
    recommendationLanguage:
      "Activating Your Gifts supports you in reconnecting with your spiritual abilities, strengthening your channel and restoring trust in what you receive. This activation can help you move from interference and uncertainty into clarity, discernment and spiritual confidence.",
    personalizedActivation: {
      name: "Activating Your Gifts",
      description:
        "Supports The Messenger in reconnecting with their spiritual gifts, clearing interference and strengthening their ability to recognize and trust what they receive -- restoring clarity, discernment and confidence within their channel.",
      kajabiOfferId: "2151318709",
      checkoutUrl: "https://www.rachaelsbutterflyeffect.com/offers/RXEY2TgP/checkout",
      offerStatus: "draft", // TODO(Rachael): publish in Kajabi admin
    },
  },
  {
    slug: "creator",
    displayName: "The Creator",
    currentFrequency: "Control",
    highLevelDescription:
      "Here to bring ideas, visions, desires and possibilities into form -- naturally recognizes what could exist and possesses the energetic and creative power to build, express, innovate and manifest it.",
    highestExpression: [
      "Aligned creation",
      "Energetic cohesion",
      "Freedom",
      "Focused manifestation",
      "Creative momentum",
      "Trust",
      "Purposeful execution",
      "Innovation",
      "Commitment",
      "The ability to bring ideas into reality",
    ],
    recognitionPatterns: [
      "Gripping outcomes",
      "Trying to control timelines",
      "Forcing creation",
      "Start-and-stop momentum",
      "Scattered energy",
      "Difficulty surrendering",
      "Mentally managing every detail",
      "Fear of choosing the wrong direction",
      "Difficulty committing",
      "Changing direction repeatedly",
      "Mistrusting the creative process",
      "Believing force will create faster results",
      "Becoming discouraged when the outcome does not arrive immediately",
      "Trying to create from pressure rather than energetic cohesion",
    ],
    gapExplanation:
      "The GAP is not a lack of creative power. The Creator already has ideas, vision and possibility available to them. The GAP exists between their natural capacity to create and the amount of trust, freedom and cohesion currently present in their creative process. Their power is not missing -- it may be constricted by force, urgency or control.",
    highestLeverageShift: {
      from: ["Control", "Force", "Scattered creation", "Gripping", "Timeline pressure"],
      into: ["Freedom", "Energetic cohesion", "Trust", "Aligned action", "Creative momentum"],
    },
    customerFacingResult:
      "Your Divine Identity is The Creator. You are currently moving through the frequency of control. You are designed to bring ideas and possibilities into form, but gripping the outcome or trying to manage every step may be restricting the freedom and momentum your creation requires. Your creative power is not missing. The GAP is between what you are capable of creating and how much trust and energetic freedom you currently allow within the process.",
    stepOneSignals: {
      stuckFeeling: "I am trying to control the outcome because I do not trust the process.",
      fearMost: "That the outcome will not happen unless I force it.",
      copingBehavior: "Change direction or try to control every step.",
    },
    deepDiveQuestions: [
      "What are you currently trying to force into place?",
      "What makes it difficult to trust the timing or process?",
      "How often do you change direction after beginning something?",
      "What would you create differently if you trusted the process completely?",
    ],
    recommendationLanguage:
      "Freedom Timeline Activation supports you in releasing control, force and pressure around the path of creation. This activation can help you reconnect with trust, freedom and the timeline most aligned with what you are creating.",
    personalizedActivation: {
      name: "Freedom Timeline Activation",
      description:
        "Supports The Creator in releasing control, gripping and pressure around the path of creation -- reconnecting with freedom, possibility, trust and the timeline most aligned with what they are creating.",
      kajabiOfferId: "2151318710",
      checkoutUrl: "https://www.rachaelsbutterflyeffect.com/offers/WQNoL2qU/checkout",
      offerStatus: "draft", // TODO(Rachael): publish in Kajabi admin
    },
  },
  {
    slug: "healer",
    displayName: "The Healer",
    currentFrequency: "Disconnection",
    highLevelDescription:
      "Has a natural capacity to hold, guide, transform and restore -- deeply sensitive to what other people need and able to recognize what is happening beneath the surface.",
    highestExpression: [
      "Divine connection",
      "Embodied presence",
      "Healing through presence",
      "Wholeness",
      "Energetic replenishment",
      "Clear boundaries",
      "Spiritual connection",
      "Sacred service",
      "Grounded sensitivity",
      "The ability to be the vessel rather than the source",
    ],
    recognitionPatterns: [
      "Feeling disconnected from God or soul",
      "Feeling disconnected from spiritual gifts",
      "Previously strong gifts now feeling inconsistent",
      "Spiritual emptiness",
      "Energetic depletion",
      "Feeling ungrounded",
      "Living primarily in the mind",
      "Difficulty feeling energy",
      "Overgiving",
      "Neglecting personal needs",
      "Trying to carry or fix everyone",
      "Difficulty embodying spiritual knowledge",
      "Feeling numb or energetically flat",
      "Supporting everyone except themselves",
    ],
    gapExplanation:
      "The GAP is not a lack of healing ability. The Healer's gift may still be fully present beneath depletion, disembodiment or overgiving. The GAP exists between their natural divine connection and how consistently connected, replenished and embodied they currently feel. Their gift has not necessarily left -- they may have become disconnected from the conditions that allow it to flow.",
    highestLeverageShift: {
      from: ["Disconnection", "Depletion", "Overgiving", "Disembodiment", "Spiritual emptiness"],
      into: ["Divine connection", "Embodiment", "Replenishment", "Wholeness", "Restored spiritual flow"],
    },
    customerFacingResult:
      "Your Divine Identity is The Healer. You are currently moving through the frequency of disconnection. You have a natural capacity to hold, guide and transform, but depletion, overgiving or disembodiment may have interrupted your ability to consistently feel the connection behind your gift. Your gift has not disappeared. The GAP may be between the healer you inherently are and how connected, replenished and embodied you currently feel within yourself.",
    stepOneSignals: {
      stuckFeeling: "I feel disconnected from myself, God or my gifts.",
      fearMost: "That I have lost the connection I once had.",
      copingBehavior: "Pull away and feel disconnected.",
    },
    deepDiveQuestions: [
      "When did you first notice the disconnection from yourself or your gifts?",
      "Where have you been giving more than you are receiving?",
      "What part of yourself have you neglected while supporting others?",
      "What helps you feel most connected to yourself and God?",
    ],
    recommendationLanguage:
      "The Healer's Disconnection does not point to one fixed activation -- which one is right depends on how the disconnection is actually presenting, never on being The Healer alone. If she is disconnected from herself, her soul, her identity or her own deeper knowing, this points to Remembrance Activation. If her spiritual gifts feel inaccessible or dormant, this points to Activating Your Gifts Activation. If she is receiving guidance but is having difficulty trusting it, this points to Removing the Frequency of Doubt. If she has a specific desire to develop her intuitive knowing, this points to Intuition Activation. If she is working toward specific visual or psychic development, this points to Third Eye Activation or Clairvoyance Activation. Let the conversation determine which of these fits -- The Healer does not automatically equal Disconnection, and Disconnection does not automatically receive one preset activation.",
    personalizedActivation: {
      name: "Determined by how Disconnection presents (see recommendationLanguage)",
      description:
        "The Healer does not have one fixed personalized activation. Disconnection from self, soul, identity or deeper knowing points to Remembrance Activation. Disconnection from spiritual gifts, or gifts feeling inaccessible or dormant, points to Activating Your Gifts Activation. Difficulty trusting guidance that is already coming through points to Removing the Frequency of Doubt. A specific desire to develop intuitive knowing points to Intuition Activation. A specific desire for visual or psychic development points to Third Eye Activation or Clairvoyance Activation. The actual expression of the pattern in the conversation determines which activation is recommended -- never her Divine Identity alone.",
      kajabiOfferId: null, // retired Aug 15 (Rachael's explicit request) -- Spirit Connection Activation must never be recommended again; no single fixed activation replaces it, see recommendationLanguage above
      checkoutUrl: null,
      offerStatus: "n/a", // dynamic -- selection depends on conversation content, not a single offer
    },
  },
  {
    slug: "expander",
    displayName: "The Expander",
    currentFrequency: "Restriction",
    highLevelDescription:
      "Designed to increase what is possible -- has the capacity to receive, hold and create greater levels of prosperity, success, influence, opportunity and impact.",
    highestExpression: [
      "Expansion",
      "Prosperity",
      "Receiving",
      "Success",
      "Worthiness",
      "Capacity",
      "Overflow",
      "Aligned wealth",
      "Possibility",
      "The ability to hold more without losing themselves",
    ],
    recognitionPatterns: [
      "Underearning",
      "Lack mentality",
      "Fear of receiving more",
      "Undercharging",
      "Overworking for money",
      "Financial pressure",
      "Difficulty holding success",
      "Feeling unsafe with growth",
      "Self-worth tied to productivity",
      "Expecting money to be difficult",
      "Sabotaging expansion",
      "Feeling guilty for wanting more",
      "Restricting opportunities",
      "Believing greater success will create greater pressure",
      "Returning to an old income level after expansion",
      "Struggling to receive without immediately overgiving",
      "Feeling uncomfortable when things become easy",
    ],
    gapExplanation:
      "The GAP is not a lack of potential. The Expander may already have the vision, gifts and capacity required for greater success. The GAP exists between what they are capable of holding and what their current beliefs, identity or nervous system feel safe receiving. Their expansion is not unavailable -- it may be restricted by the meaning they have attached to success, money and receiving.",
    highestLeverageShift: {
      from: ["Restriction", "Lack", "Under-receiving", "Overworking", "Fear of success"],
      into: ["Prosperity", "Capacity", "Worthiness", "Aligned receiving", "Embodied success"],
    },
    customerFacingResult:
      "Your Divine Identity is The Expander. You are currently moving through the frequency of restriction. You are designed to hold greater success, prosperity and possibility, but part of your system may still associate expansion with pressure, risk or increased responsibility. Your potential is not the problem. The GAP may be between what you are capable of receiving and how safe, worthy and available you currently feel holding it.",
    stepOneSignals: {
      stuckFeeling: "I want greater success, but part of me seems to restrict it.",
      fearMost: "That greater success will create more pressure or responsibility.",
      copingBehavior: "Restrict what I ask for, charge or allow myself to receive.",
    },
    deepDiveQuestions: [
      "What feels unsafe about receiving more success, money or opportunity?",
      "What do you believe greater success would require from you?",
      "Where are you currently restricting what you ask for or allow yourself to receive?",
      "What has happened in the past when you began to expand?",
    ],
    recommendationLanguage:
      "Success Code Activation supports you in releasing restriction around success, prosperity, receiving and possibility. This activation can help you become more available to hold greater opportunity, wealth and expansion without connecting it to pressure or over-responsibility.",
    personalizedActivation: {
      name: "Success Code Activation",
      description:
        "Supports The Expander in releasing restriction around success, money, receiving and possibility -- becoming energetically available for greater prosperity, opportunity, capacity and embodied success.",
      kajabiOfferId: "2151318712",
      checkoutUrl: "https://www.rachaelsbutterflyeffect.com/offers/PsLWTYDM/checkout",
      offerStatus: "draft", // TODO(Rachael): publish in Kajabi admin
    },
  },
];

export function getDivineIdentityBySlug(slug) {
  return DIVINE_IDENTITIES.find((d) => d.slug === slug) ?? null;
}

// Central messaging rule every result must reinforce (see lib/processes.js and
// lib/prompts.js GUARDRAILS -- this is a whole-app rule, not just the Gap
// Method's): the person is not the Current Frequency. The Current Frequency
// simply reveals the GAP that is ready to shift.
export const CENTRAL_MESSAGING_RULE =
  "You are not the Current Frequency. Your Divine Identity is who you are. The Current Frequency simply reveals the GAP that is ready to shift.";
