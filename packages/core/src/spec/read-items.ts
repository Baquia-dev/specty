// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { ItemPrefix } from "../ids";
import type { RawList } from "./list";
import type { Assumption, Criterion, ListSectionKey, Risk, Slice } from "./model";
import {
  claimedHead,
  createReader,
  finish,
  type ListResult,
  prelude,
  readFields,
  readIdRefs,
} from "./read-helpers";
import {
  IMPACT_KEY,
  IMPACT_WORDS,
  impactFrom,
  isImpactKey,
  NONE_WORD,
  SLICE_FIELDS,
} from "./vocabulary";

interface IdItem {
  readonly id: string;
  readonly text: string;
}

export function readAssumptions(raw: RawList, lang: Lang): ListResult<Assumption> {
  const reader = createReader(lang, "assumptions");
  const { none, items } = prelude(raw, reader);
  const assumptions = items.flatMap((item): Assumption[] => {
    const head = claimedHead(item.head, item.line, "A", "assumptions", reader);
    if (head === undefined) return [];
    const fields = readFields(
      item,
      head.id,
      (key) => (isImpactKey(key) ? "impact" : undefined),
      [IMPACT_KEY[lang]],
      reader,
    );
    const field = fields.get("impact");
    const impact = field === undefined ? undefined : impactFrom(field.value);
    if (field !== undefined && impact === undefined) {
      reader.report({
        code: "field-invalid",
        params: {
          id: head.id,
          field: field.key,
          value: field.value,
          valid: Object.values(IMPACT_WORDS[lang]).join(", "),
        },
        line: field.line,
        target: head.id,
      });
    }
    return [{ id: head.id, text: head.text, ...(impact !== undefined ? { impact } : {}) }];
  });
  return finish(reader, none, assumptions);
}

export function readCriteria(raw: RawList, lang: Lang): ListResult<Criterion> {
  return readPlainItems(raw, lang, "criteria", "AC");
}

export function readRisks(raw: RawList, lang: Lang): ListResult<Risk> {
  return readPlainItems(raw, lang, "risks", "R");
}

export function readSlices(raw: RawList, lang: Lang): ListResult<Slice> {
  const reader = createReader(lang, "slices");
  const { none, items } = prelude(raw, reader);
  const slices = items.flatMap((item): Slice[] => {
    const head = claimedHead(item.head, item.line, "C", "slices", reader);
    if (head === undefined) return [];
    const fields = readFields(item, head.id, sliceKey, SLICE_FIELDS, reader);
    const ac = fields.get("ac");
    const depends = fields.get("depends");
    return [
      {
        id: head.id,
        title: head.text,
        ac: ac === undefined ? [] : readIdRefs(ac, head.id, "AC", reader),
        depends: depends === undefined ? [] : readIdRefs(depends, head.id, "C", reader),
      },
    ];
  });
  return finish(reader, none, slices);
}

function readPlainItems(
  raw: RawList,
  lang: Lang,
  section: ListSectionKey,
  prefix: ItemPrefix,
): ListResult<IdItem> {
  const reader = createReader(lang, section);
  const { none, items } = prelude(raw, reader);
  const plain = items.flatMap((item): IdItem[] => {
    const head = claimedHead(item.head, item.line, prefix, section, reader);
    if (head === undefined) return [];
    readFields(item, head.id, () => undefined, [NONE_WORD[lang].toLowerCase()], reader);
    return [head];
  });
  return finish(reader, none, plain);
}

function sliceKey(key: string): string | undefined {
  const lower = key.toLowerCase();
  if (lower === "dependson" || lower === "depende") return "depends";
  return SLICE_FIELDS.includes(lower) ? lower : undefined;
}
