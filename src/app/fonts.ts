import { Ojuju } from "next/font/google";

/**
 * OJUJU — the prologue's display face (docs/PROLOGUE.md §4). Self-hosted by next/font at build time (no request
 * to Google from the visitor's browser). Variable weight 200–800, normal style only. latin-ext keeps the Yorùbá
 * diacritics (Dùndún, Bàtá, Oríkì, Jùjú, Adé) inside the face. Exposed as the CSS variable --font-ojuju.
 */
export const ojuju = Ojuju({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  display: "swap",
  variable: "--font-ojuju",
});
