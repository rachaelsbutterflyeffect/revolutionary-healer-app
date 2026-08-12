// (Phase 2) embed query, query vector store.
// Spec ref: SPEC.md §5 and §10 (Phase 2 - Knowledge base / RAG).
// Not wired up yet -- Phase 1 ships with hand-authored system prompts only.
// This stub keeps the call site in app/api/chat/route.ts stable so Phase 2
// is a drop-in change rather than a rewrite.

export async function retrieveContextForFocusArea(_focusAreaSlug, _query) {
  // TODO(Phase 2): chunk + embed Rachael's transcripts, upsert to a vector store,
  // and query it here scoped to the focus area's allowed_sources.
  return "";
}
