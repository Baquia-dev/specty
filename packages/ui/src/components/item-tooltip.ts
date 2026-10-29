// SPDX-License-Identifier: Apache-2.0
import * as overlay from "@angular/cdk/overlay";
import { DomPortal } from "@angular/cdk/portal";
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  inject,
  input,
  type Signal,
  signal,
} from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { ChangesStore } from "../data/changes-store";
import { type ChangeView, type ReviewView, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { TOOLTIP_POSITIONS } from "./tooltip";

const GRACE_MS = 100;
const EXACT_ITEM_RE = /^(AC|A|T|R|S|C)([1-9]\d*)$/;
const INLINE_ITEM_RE = /\b((?:AC|A|T|R|S|C)[1-9]\d*)\b/g;
const LEADING_ITEM_RE = /^((?:AC|A|T|R|S|C)[1-9]\d*)\b/;
const IGNORED_SELECTOR = ".cdk-overlay-container, sp-tooltip, [data-tooltip], pre, code";

type ItemPrefix = "AC" | "A" | "T" | "R" | "S" | "C";
type ItemMap = ReadonlyMap<string, string>;
type ItemRecord = Readonly<Record<string, string>>;
type ItemSource = ChangeView | ReviewView | ItemMap | ItemRecord | string;

const ITEM_LABELS: Readonly<Record<ItemPrefix, Readonly<Record<Lang, string>>>> = {
  A: { es: "Supuesto", en: "Assumption" },
  AC: { es: "Criterio de aceptación", en: "Acceptance criterion" },
  T: { es: "Tarea", en: "Task" },
  R: { es: "Riesgo", en: "Risk" },
  S: { es: "Solicitud de alcance", en: "Scope request" },
  C: { es: "Corte", en: "Slice" },
};

interface ItemTextPart {
  readonly text: string;
  readonly id?: string;
}

export function formatItemTooltip(id: string, lang: Lang, text?: string): string {
  const trimmed = id.trim();
  const match = EXACT_ITEM_RE.exec(trimmed);
  if (match === null) return "";
  const label = ITEM_LABELS[match[1] as ItemPrefix][lang];
  const clean = text?.replace(/\s+/g, " ").trim() ?? "";
  return clean.length > 0 ? `${label} ${trimmed}: ${clean}` : `${label} ${trimmed}`;
}

export function splitItemRefs(text: string): readonly ItemTextPart[] {
  const parts: ItemTextPart[] = [];
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
  for (const task of review.tasks) map.set(task.id, task.title);
  for (const e of review.delta?.entries ?? []) {
    const text = e.text
      .reduce((acc, p) => (p.change === "removed" ? acc : acc + p.text), "")
      .trim();
    if (EXACT_ITEM_RE.test(e.key) && !map.has(e.key) && text) map.set(e.key, text);
  }
  return map;
}

function addHistoryScopes(map: Map<string, string>, change: ChangeView, lang: Lang): void {
  for (const entry of change.history) {
    if (entry.type !== "scope") continue;
    const id = /\b(S[1-9]\d*)\b/.exec(`${entry.details[0]?.[lang] ?? ""} ${entry.title.es}`)?.[1];
    const summary = entry.details.at(-1)?.[lang]?.trim() ?? "";
    if (id !== undefined && !map.has(id) && summary.length > 0 && summary !== id)
      map.set(id, summary);
  }
}

export function itemsOfChange(change: ChangeView, lang: Lang = "es"): ItemMap {
  const map = new Map(itemsOfReview(change.review));
  for (const t of change.progress.tasks) if (!map.has(t.id) && t.title) map.set(t.id, t.title);
  for (const req of change.scopeRequests) {
    const summary = req.reason.trim() || req.paths.join(", ");
    if (summary.length > 0) map.set(req.id, summary);
  }
  addHistoryScopes(map, change, lang);
  return map;
}

function visibleText(el: Element): string {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node instanceof Element && !node.classList.contains("sr-only"))
      out += visibleText(node);
  }
  return out.trim();
}

interface ResolvedTarget {
  readonly origin: HTMLElement;
  readonly id: string;
  readonly text?: string;
}

function explicitTarget(el: Element, host: HTMLElement): ResolvedTarget | undefined {
  const ref = el.closest<HTMLElement>("[data-item-ref]");
  const id = ref !== null && host.contains(ref) ? (ref.dataset.itemRef?.trim() ?? "") : "";
  if (ref === null || !EXACT_ITEM_RE.test(id)) return undefined;
  const text = ref.dataset.itemText?.trim();
  return { origin: ref, id, ...(text ? { text } : {}) };
}

function nodeIdOf(node: HTMLElement): string | undefined {
  const text = visibleText(node);
  if (EXACT_ITEM_RE.test(text) && node.children.length <= 2) return text;
  return node.children.length === 0 && node.classList.contains("font-mono")
    ? LEADING_ITEM_RE.exec(text)?.[1]
    : undefined;
}

function inferredTarget(el: Element, host: HTMLElement): ResolvedTarget | undefined {
  let node: Element | null = el;
  while (node instanceof HTMLElement && host.contains(node)) {
    const id = nodeIdOf(node);
    if (id !== undefined) return { origin: node, id };
    node = node === host ? null : node.parentElement;
  }
  return undefined;
}

let openTooltip: ItemTooltips | undefined;

@Directive({
  selector: "[spItemTooltips]",
  host: {
    "(pointerover)": "onEnter($event)",
    "(pointerout)": "onLeave($event)",
    "(focusin)": "onEnter($event)",
    "(focusout)": "hide()",
    "(document:keydown.escape)": "hide()",
  },
})
export class ItemTooltips {
  readonly spItemTooltips = input<ItemSource | undefined>(undefined);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly preferences = inject(Preferences);
  private readonly parent = inject(ItemTooltips, { optional: true, skipSelf: true });
  private readonly fallbackSource = signal<(() => ItemSource | undefined) | undefined>(undefined);
  private overlayRef: overlay.OverlayRef | undefined;
  private position: overlay.FlexibleConnectedPositionStrategy | undefined;
  private bubble: HTMLSpanElement | undefined;
  private activeTarget: ResolvedTarget | undefined;
  private leaving: ReturnType<typeof setTimeout> | undefined;

  readonly items: Signal<ItemMap> = computed((): ItemMap => {
    const src = this.spItemTooltips() ?? this.fallbackSource()?.();
    const own = this.resolveSource(src, this.preferences.lang());
    const inherited = this.parent?.items();
    if (inherited === undefined || inherited.size === 0) return own;
    return own.size === 0 ? inherited : new Map([...inherited, ...own]);
  });

  constructor() {
    afterRenderEffect(() => this.syncBubble());
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      this.overlayRef?.dispose();
    });
  }

  setSource(source: () => ItemSource | undefined): void {
    this.fallbackSource.set(source);
  }

  protected onEnter(event: Event): void {
    const target = this.resolveTarget(event.target);
    if (!target) return;
    event.stopPropagation();
    const from = event instanceof MouseEvent ? event.relatedTarget : null;
    if (from instanceof Node && target.origin.contains(from)) clearTimeout(this.leaving);
    else this.showTarget(target);
  }

  protected onLeave(event: MouseEvent): void {
    const origin = this.activeTarget?.origin;
    if (!origin || (event.relatedTarget instanceof Node && origin.contains(event.relatedTarget)))
      return;
    clearTimeout(this.leaving);
    this.leaving = setTimeout(() => this.hide(), GRACE_MS);
  }

  private syncBubble(): void {
    const [lang, map, t] = [this.preferences.lang(), this.items(), this.activeTarget];
    if (!t || !this.bubble) return;
    const text = formatItemTooltip(t.id, lang, t.text || map.get(t.id));
    if (text) this.bubble.textContent = text;
    else this.hide();
  }

  private resolveSource(source: ItemSource | undefined, lang: Lang): ItemMap {
    if (!source) return new Map();
    if (source instanceof Map) return source;
    if (typeof source === "string") return this.fromStore(source, lang);
    if ("review" in source) return itemsOfChange(source as ChangeView, lang);
    if ("assumptions" in source) return itemsOfReview(source as ReviewView);
    return new Map(Object.entries(source));
  }

  private fromStore(id: string, lang: Lang): ItemMap {
    const all = this.injector.get(SpectyData, null) ? this.injector.get(ChangesStore).all() : [];
    const found = all.find((view) => view.id === id);
    return found ? itemsOfChange(found, lang) : new Map();
  }

  private resolveTarget(rawTarget: EventTarget | null): ResolvedTarget | undefined {
    if (!(rawTarget instanceof Element) || !this.host.contains(rawTarget)) return undefined;
    if (rawTarget.closest(IGNORED_SELECTOR) !== null) return undefined;
    return explicitTarget(rawTarget, this.host) ?? inferredTarget(rawTarget, this.host);
  }

  private showTarget(target: ResolvedTarget): void {
    if (openTooltip !== undefined && openTooltip !== this) openTooltip.hide();
    openTooltip = this;
    clearTimeout(this.leaving);
    const raw = target.text || this.items().get(target.id);
    const formatted = formatItemTooltip(target.id, this.preferences.lang(), raw);
    if (!formatted) return;
    this.activeTarget = target;
    this.ensureOverlay(target.origin).textContent = formatted;
    this.overlayRef?.updatePosition();
  }

  private ensureOverlay(origin: HTMLElement): HTMLSpanElement {
    if (this.overlayRef === undefined) {
      const pos = overlay.createFlexibleConnectedPositionStrategy(this.injector, origin);
      const positionStrategy = pos.withPositions([...TOOLTIP_POSITIONS]).withViewportMargin(8);
      const scrollStrategy = overlay.createRepositionScrollStrategy(this.injector);
      this.position = positionStrategy;
      this.overlayRef = overlay.createOverlayRef(this.injector, {
        positionStrategy,
        scrollStrategy,
      });
    } else this.position?.setOrigin(origin);
    if (this.bubble === undefined) {
      const span = this.host.ownerDocument.createElement("span");
      span.setAttribute("role", "tooltip");
      span.setAttribute("data-tooltip", "");
      span.className =
        "max-w-80 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-md transition-opacity starting:opacity-0";
      span.style.transitionDuration = "var(--duration-fast)";
      span.addEventListener("pointerenter", () => clearTimeout(this.leaving));
      span.addEventListener("pointerleave", () => this.hide());
      this.host.ownerDocument.createDocumentFragment().appendChild(span);
      this.bubble = span;
    }
    if (!this.overlayRef.hasAttached()) this.overlayRef.attach(new DomPortal(this.bubble));
    return this.bubble;
  }

  protected hide(): void {
    clearTimeout(this.leaving);
    if (openTooltip === this) openTooltip = undefined;
    this.activeTarget = undefined;
    this.overlayRef?.detach();
  }
}

@Component({
  selector: "sp-item-text",
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [ItemTooltips],
  template: `@for (part of parts(); track $index) {@if (part.id) {<span [attr.data-item-ref]="part.id">{{ part.text }}</span>} @else {<span>{{ part.text }}</span>}}`,
})
export class ItemText {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => splitItemRefs(this.text()));
}
