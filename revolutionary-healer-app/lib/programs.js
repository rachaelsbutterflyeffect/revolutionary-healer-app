// "Go Deeper" page content: Rachael's standalone paid programs + private
// experiences that live BEYOND Revolutionary Healer app/membership access.
// Spec ref: SPEC.md §4.1b (rewritten Aug 4 per Rachael's "Go Deeper Page Build
// Instructions" -- corrects an earlier, wrong assumption that these were
// bundled into Full Access; they are explicitly NOT included with membership,
// NOT part of the chatbot, NOT part of the Activations library, and NOT
// automatically unlocked at any tier). These are external sales pages/checkout
// links the member clicks out to -- not scripted AI processes (see
// lib/processes.js for what the bot actually runs) and not gated app content.
//
// REVISED (Aug 6): Distortion Decode Method and Identity Method removed per
// Rachael -- "People should either be going to clear channel method or to 1-1
// with me." Only one program (Clear Channel Method, featured/highlighted) plus
// the Quantum Recode Session private 1:1 remain. The other two programs'
// content is deleted, not hidden -- if Rachael wants them back later they'd
// need to be re-added from scratch (or pulled from this file's git history).
//
// kajabiProductId is real, confirmed against Rachael's Kajabi catalog
// (search_products, Aug 3). checkoutUrl is still a placeholder until Rachael
// supplies the real standalone sales page URL (the Go Deeper page reads this
// value rather than hard-coding a URL into visible copy, so it can be updated
// here without touching the page itself -- see the-revolutionary-healer-
// mockup.html's GO_DEEPER_OFFERS for the same pattern in the static mockup).

import { BOOK_1_1_URL, BOOK_1_1_PRICE } from "./processes.js";

export const GO_DEEPER_PROGRAMS = [
  {
    slug: "clear-channel-method",
    name: "Clear Channel Method",
    offerType: "Program",
    featured: true, // the one program Rachael wants highlighted on the page.
    headline: "Strengthen your channel. Trust what you receive.",
    description:
      "If you question your intuition, second-guess your gifts or struggle to trust what you receive, this experience helps you clear the interference. Learn how to create a clear, grounded and trustworthy channel so your guidance becomes something you can confidently receive, discern and act on.",
    benefits: [
      "Strengthen your intuition",
      "Develop and understand your spiritual gifts",
      "Increase discernment",
      "Build confidence in your channel",
    ],
    kajabiProductId: 2148971348, // "Clear Channel Method: The Methods make healer unstoppable!" -- confirmed via Kajabi search_products.
    kajabiAdminUrl: "https://app.kajabi.com/admin/products/2148971348",
    checkoutUrl: "https://www.rachaelsbutterflyeffect.com/PLACEHOLDER-clear-channel-method", // TODO(Rachael): real standalone sales page URL.
  },
];

// The "Work Directly With Rachael" private experience on the Go Deeper page.
// Same real $555 checkout previously wired for "Book a 1-1 with Rachael" --
// renamed/reframed per Rachael's Go Deeper spec, not a new product. Distinct
// from the free Quantum Recode unlock earned via 1000 saved Quantum Dollars
// (see QUANTUM_RECODE_THRESHOLD in lib/quantumDollars.js) -- that's the same
// underlying session reached through a different, no-charge path once
// Rachael provides a redemption link/coupon (still TODO there).
export const QUANTUM_RECODE_SESSION = {
  slug: "quantum-recode-session",
  name: "Quantum Recode Session",
  offerType: "Private Experience",
  subtitle: "Private 1:1 Session With Rachael",
  description:
    "Receive personalized support focused on the specific pattern, frequency or distortion you are ready to move through. Together, you will identify what is maintaining the pattern, create energetic shifts in real time and receive clarity around your next aligned step. This is live, private support with Rachael. It is not app content or an automated experience.",
  price: BOOK_1_1_PRICE, // same real product as the old "Book 1-1" link -- see BOOK_1_1_URL/PRICE in processes.js.
  checkoutUrl: BOOK_1_1_URL,
};

export function getGoDeeperProgramBySlug(slug) {
  return GO_DEEPER_PROGRAMS.find((p) => p.slug === slug) ?? null;
}
