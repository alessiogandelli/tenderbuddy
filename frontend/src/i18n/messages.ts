import { en } from "./en";

// The message shape is defined by the canonical English bundle. Every other
// locale is typed as `Messages`, so a missing or extra key fails typecheck.
export type Messages = typeof en;
