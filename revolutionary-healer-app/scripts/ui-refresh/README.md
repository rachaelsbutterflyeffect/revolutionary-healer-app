# UI refresh (r17 look) build

`public/app-refresh.html` is generated from `public/app.html`. Do not edit it by hand.

    python3 scripts/ui-refresh/build.py public

- `refresh.css`: the look, scoped to `body.rf`
- `gap.css`: the GAP Method pop-up (r16 look)
- `refresh.js`: screens, Home, Shifting cards, the Embodied pill, Delete in the Shift bubble, and the Step 2 chips

The build fails if any ID, data-role, onclick, script src, /api path, storage key or function name from app.html goes missing. The only intended exception is the SpookBound library card, which is not part of the refresh.

The switch is `UI_REFRESH` (off / allowlist / on), read by `lib/uiRefresh.js` via `/api/ui-refresh`. Re-run the build after any change to app.html.

`chat-history.js` is the refresh's chat-history block (PR #60 speed, PR #61 never hang). The build swaps it in for app.html's drawer block (`rhLoadDrawerList` … `rhInitChatUI();`), so the classic page keeps its own. Edit chat history there, never in `public/app-refresh.html`. Always run the build after editing any input and commit the regenerated `public/app-refresh.html`; a rebuild of an unchanged tree should produce no diff.
