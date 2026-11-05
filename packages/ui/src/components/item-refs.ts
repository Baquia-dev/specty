// SPDX-License-Identifier: Apache-2.0
// The items a text names by their id (A1, AC2, T3, R1, S1, C2): what each kind is called, what
// each item of a change says, and which element under the pointer names one.
import type { Lang } from "@baquia-dev/specty-core/light";
import type { ChangeView, ReviewView } from "../data/records";

const EXACT_ITEM_RE = /^(AC|A|T|R|S|C)([1-9]\d*)$/;
const INLINE_ITEM_RE = /\b((?:AC|A|T|R|S|C)[1-9]\d*)\b/g;
const LEADING_ITEM_RE = /^((?:AC|A|T|R|S|C)[1-9]\d*)\b/;
const IGNORED_SELECTOR = ".cdk-overlay-container, sp-tooltip, [data-tooltip], pre, code";

type ItemPrefix = "AC" | "A" | "T" | "R" | "S" | "C";
export type ItemMap = ReadonlyMap<string, string>;

const ITEM_LABELS: Record<ItemPrefix, Record<Lang, string>> = {
  A: { es: "Supuesto", en: "Assumption" },
  AC: { es: "Criterio de aceptación", en: "Acceptance criterion" },
  T: { es: "Tarea", en: "Task" },
  R: { es: "Riesgo", en: "Risk" },
  S: { es: "Solicitud de alcance", en: "Scope request" },
  C: { es: "Corte", en: "Slice" },
};

const isPrefix = (prefix: string | undefined): prefix is ItemPrefix =>
  prefix !== undefined && Object.hasOwn(ITEM_LABELS, prefix);

/** What the kind of item `id` is called, or nothing when `id` is not an item's id. */
export function itemLabel(id: string, lang: Lang): string | undefined {
  const prefix = EXACT_ITEM_RE.exec(id.trim())?.[1];
  return isPrefix(prefix) ? ITEM_LABELS[prefix][lang] : undefined;
}

export function formatItemTooltip(id: string, lang: Lang, text?: string): string {
  const label = itemLabel(id, lang);
  if (label === undefined) return "";
  const clean = text?.replace(/\s+/g, " ").trim() ?? "";
  return clean ? `${label} ${id.trim()}: ${clean}` : `${label} ${id.trim()}`;
}

export function splitItemRefs(
  text: string,
): readonly { readonly text: string; readonly id?: string }[] {
  const parts: { text: string; id?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_ITEM_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i) });
    parts.push({ text: m[0], id: m[1] ?? m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function itemsOfReview(review: ReviewView): ItemMap {
  const map = new Map<string, string>();
  for (const i of [...review.assumptions, ...review.criteria, ...review.risks])
    map.set(i.id, i.text);
  for (const t of review.tasks) map.set(t.id, t.title);
  for (const e of review.delta?.entries ?? []) {
    const text = e.text
      .filter((p) => p.change !== "removed")
      .map((p) => p.text)
      .join("")
      .trim();
    if (EXACT_ITEM_RE.test(e.key) && !map.has(e.key) && text) map.set(e.key, text);
  }
  return map;
}

function addHistoryScopes(map: Map<string, string>, change: ChangeView, lang: Lang): void {
  for (const entry of change.history) {
    if (entry.type !== "scope") continue;
    const id = /\b(S[1-9]\d*)\b/.exec(`${entry.details[0]?.[lang] ?? ""} ${entry.title.es}`)?.[1];
    const s = entry.details.at(-1)?.[lang]?.trim() ?? "";
    if (id && !map.has(id) && s && s !== id) map.set(id, s);
  }
}

export function itemsOfChange(change: ChangeView, lang: Lang = "es"): ItemMap {
  const map = new Map(itemsOfReview(change.review));
  for (const t of change.progress.tasks) if (!map.has(t.id) && t.title) map.set(t.id, t.title);
  for (const req of change.scopeRequests) {
    const s = req.reason.trim() || req.paths.join(", ");
    if (s) map.set(req.id, s);
  }
  addHistoryScopes(map, change, lang);
  return map;
}

/** An element that names an item, the item's id and, when the element gives it, its text. */
export interface ResolvedTarget {
  readonly origin: HTMLElement;
  readonly id: string;
  readonly text?: string | undefined;
}

/**
 * The item that `raw`, inside `host`, names: an explicit `data-item-ref`, or else the nearest
 * element whose visible text is an item's id. Overlays, tooltips and code name none.
 */
export function itemTarget(raw: EventTarget | null, host: HTMLElement): ResolvedTarget | undefined {
  if (!(raw instanceof Element) || !host.contains(raw) || raw.closest(IGNORED_SELECTOR))
    return undefined;
  return explicitTarget(raw, host) ?? inferredTarget(raw, host);
}

function visibleText(el: Element): string {
  let out = "";
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
    else if (n instanceof Element && !n.classList.contains("sr-only")) out += visibleText(n);
  }
  return out.trim();
}

function explicitTarget(el: Element, host: HTMLElement): ResolvedTarget | undefined {
  const ref = el.closest<HTMLElement>("[data-item-ref]");
  const id = ref && host.contains(ref) ? (ref.dataset.itemRef?.trim() ?? "") : "";
  return ref && EXACT_ITEM_RE.test(id)
    ? { origin: ref, id, text: ref.dataset.itemText?.trim() }
    : undefined;
}

function nodeIdOf(node: HTMLElement): string | undefined {
  const t = visibleText(node);
  return EXACT_ITEM_RE.test(t) && node.children.length <= 2
    ? t
    : node.children.length === 0 && node.classList.contains("font-mono")
      ? LEADING_ITEM_RE.exec(t)?.[1]
      : undefined;
}

function inferredTarget(el: Element, host: HTMLElement): ResolvedTarget | undefined {
  for (
    let n: Element | null = el;
    n instanceof HTMLElement && host.contains(n);
    n = n === host ? null : n.parentElement
  ) {
    const id = nodeIdOf(n);
    if (id !== undefined) return { origin: n, id };
  }
  return undefined;
}
