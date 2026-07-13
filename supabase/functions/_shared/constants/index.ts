// ============= CONSTANTS BARREL (Phase 3B) =============
// Organizes 266 exports from the monolithic ../constants.ts into
// category-scoped views. This file re-exports EVERYTHING so callers
// can migrate incrementally to category-specific imports:
//
//   import { ADX_GATE } from '../constants.ts';         // legacy, still works
//   import { ADX_GATE } from '../constants/index.ts';   // barrel (identical)
//   import { ADX_GATE } from '../constants/adx.ts';     // scoped (preferred)
//
// The canonical definitions still live in ../constants.ts. This split is
// a documentation/discoverability layer, not a code move. Behavior is
// unchanged; tsgo verifies re-export identity.
// =======================================================
export * from "../constants.ts";
