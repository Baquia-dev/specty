// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import { IMPORTERS_SHOWN } from "../cards/impact";
import { REVIEW_LINES } from "../cards/review";
import { NOTE_MAX } from "../cards/work";
import { SLUG_CHARS } from "../ids";

/**
 * `internal.cards` in `.specty/config.yaml`: the most Specty shows the agent of what imports a
 * change, of the independent review and of a task's notes, and the longest slug of a new change's
 * id and branch (formats.md §6).
 */
export interface InternalCardsConfig {
  readonly cards: {
    /** The files outside the spec `propose` names for each file it changes; the rest it counts. */
    readonly importersShown: number;
    /** The lines of the reviewer's answer `specty review`'s card repeats; `reviews/` keeps it whole. */
    readonly reviewLines: number;
    /** The characters of a summary or a finding of `task done`, which each next task card repeats. */
    readonly noteChars: number;
    /** The characters of the slug of a new change's id and branch; those that exist keep theirs. */
    readonly slugChars: number;
  };
}

export const DEFAULT_INTERNAL_CARDS: InternalCardsConfig = {
  cards: {
    importersShown: IMPORTERS_SHOWN,
    reviewLines: REVIEW_LINES,
    noteChars: NOTE_MAX,
    slugChars: SLUG_CHARS,
  },
};

/**
 * The block of `internal` this module owns, for `config.ts` to gather under `internal`. The least
 * of each still does its job: one importer, a review that can still be read, a note of a sentence
 * and a slug that still tells changes apart. The most bounds what the cards repeat: each task's
 * card repeats the notes, and keeps to about 1,500 tokens with 300 characters (ARCHITECTURE §7).
 */
export const INTERNAL_CARDS_SHAPE = {
  cards: z
    .strictObject({
      importersShown: z.number().int().min(1).max(50).optional(),
      reviewLines: z.number().int().min(20).max(2000).optional(),
      noteChars: z.number().int().min(100).max(1000).optional(),
      slugChars: z.number().int().min(16).max(100).optional(),
    })
    .optional(),
};

/** What `config.yaml` may hold of this block under `internal`. */
interface InternalCardsInput {
  readonly cards?: z.infer<typeof INTERNAL_CARDS_SHAPE.cards>;
}

/** The `internal.cards` block with its defaults applied. */
export function resolveInternalCards(input: InternalCardsInput | undefined): InternalCardsConfig {
  const base = DEFAULT_INTERNAL_CARDS.cards;
  const cards = input?.cards;
  return {
    cards: {
      importersShown: cards?.importersShown ?? base.importersShown,
      reviewLines: cards?.reviewLines ?? base.reviewLines,
      noteChars: cards?.noteChars ?? base.noteChars,
      slugChars: cards?.slugChars ?? base.slugChars,
    },
  };
}
