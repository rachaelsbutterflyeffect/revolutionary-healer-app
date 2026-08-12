# The Revolutionary Healer

Rachael's healing methodology, delivered on demand to healers and practitioners
via an AI companion. Full product/technical spec: `SPEC.md`.

Modeled on MoneyBot / House of Money. Stack: Next.js (App Router) on Vercel,
Claude API, Airtable, Kajabi for checkout/webhooks.

## Status

Phase 0/1 scaffold. Chat works end-to-end against a hand-authored system prompt
per focus area (no RAG yet -- see `lib/retrieval.js` and SPEC.md §10 Phase 2).
The Healer Calibration (`app/api/calibration/route.ts`) and the Kajabi webhook
signature check (`app/api/webhooks/route.ts`) are stubbed pending real
credentials/answers from Rachael (SPEC.md §13, §14).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

## Data model

Airtable base: `The Revolutionary Healer` (base id in `.env.example`). Tables:
Members, Chats, FocusAreas, Transcripts, Healings, Practices, Events -- schema
mirrors SPEC.md §8.

## Tests

```bash
npm run test:entitlements
```

## Roadmap

See SPEC.md §10 for the full phased roadmap (Phase 0 - Phase 7).
