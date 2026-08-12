// DEPRECATED (Aug 5): renamed to "Quantum Dollars" per Rachael -- this file is
// now just a compatibility re-export so nothing that imported from
// "./quantumCash.js" breaks (including lib/energyBucks.js, which re-exports
// from this file). Use lib/quantumDollars.js directly for anything new. Note
// the exported names themselves changed too (e.g. deriveQuantumCashState is
// now deriveQuantumDollarsState) -- this shim does not alias the old names,
// since nothing in this codebase actually imported them programmatically
// (grepped Aug 5: only comments referenced them).
export * from "./quantumDollars.js";
