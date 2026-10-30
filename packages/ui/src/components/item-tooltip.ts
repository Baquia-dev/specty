// SPDX-License-Identifier: Apache-2.0
import {
  type ConnectedPosition,
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  type FlexibleConnectedPositionStrategy,
  type OverlayRef,
} from "@angular/cdk/overlay";
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
type ItemSource = ChangeView | ReviewView | ItemMap | Readonly<Record<string, string>> | string;

const ITEM_LABELS: Record<ItemPrefix, Record<Lang, string>> = {
  A: { es: "Supuesto", en: "Assumption" },
  AC: { es: "Criterio de aceptación", en: "Acceptance criterion" },
  T: { es: "Tarea", en: "Task" },
  R: { es: "Riesgo", en: "Risk" },
  S: { es: "Solicitud de alcance", en: "Scope request" },
  C: { es: "Corte", en: "Slice" },
};

export function formatItemTooltip(id: string, lang: Lang, text?: string): string {
  const match = EXACT_ITEM_RE.exec(id.trim());
  if (!match) return "";
  const label = ITEM_LABELS[match[1] as ItemPrefix][lang];
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

function visibleText(el: Element): string {
  let out = "";
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
    else if (n instanceof Element && !n.classList.contains("sr-only")) out += visibleText(n);
  }
  return out.trim();
}

interface ResolvedTarget {
  readonly origin: HTMLElement;
  readonly id: string;
  readonly text?: string | undefined;
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

function node(
  doc: Document,
  tag: string,
  attrs: Record<string, string>,
  ...kids: (Node | string)[]
): HTMLElement {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

const PINNED_PALETTE = [
  "#4e878c",
  "#c26d5c",
  "#7e6eb0",
  "#b58338",
  "#5c7fa3",
  "#638b64",
  "#ab6b88",
  "#767d8a",
] as const;

function nextPinnedColor(used: ReadonlySet<string>, index: number): string {
  return (
    PINNED_PALETTE.find((c) => !used.has(c)) ??
    PINNED_PALETTE[index % PINNED_PALETTE.length] ??
    "#4e878c"
  );
}

const activePinnedColors = new Set<string>();

function closeButton(doc: Document, lang: Lang, onClose: () => void): HTMLElement {
  const btn = node(
    doc,
    "button",
    {
      type: "button",
      "data-item-close": "",
      "aria-label": lang === "es" ? "Cerrar" : "Close",
      class:
        "cursor-pointer border-0 bg-transparent p-0 text-current opacity-75 hover:opacity-100 text-sm leading-none shrink-0",
    },
    "✕",
  );
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });
  return btn;
}

function bubbleHeader(doc: Document, title: string, lang: Lang, onClose?: () => void): HTMLElement {
  const bullet = node(doc, "span", {
    class: "inline-block size-2 rounded-full bg-current opacity-85 shrink-0",
    "data-item-bullet": "",
    "aria-hidden": "true",
  });
  const header = node(
    doc,
    "span",
    {
      class: "flex items-center gap-1.5 font-semibold text-current flex-1",
      "data-item-header": "",
    },
    bullet,
    title,
  );
  return onClose
    ? node(
        doc,
        "div",
        { class: "flex items-start justify-between gap-2" },
        header,
        closeButton(doc, lang, onClose),
      )
    : header;
}

function renderBubble(
  el: HTMLElement,
  id: string,
  lang: Lang,
  text?: string,
  onClose?: () => void,
): boolean {
  const match = EXACT_ITEM_RE.exec(id.trim());
  if (!match) return false;
  const clean = text?.replace(/\s+/g, " ").trim() ?? "";
  el.replaceChildren();
  const label = ITEM_LABELS[match[1] as ItemPrefix][lang];
  const title = clean ? `${label} ${id.trim()}: ` : `${label} ${id.trim()}`;
  el.appendChild(bubbleHeader(el.ownerDocument, title, lang, onClose));
  if (clean)
    el.appendChild(
      node(
        el.ownerDocument,
        "span",
        { class: "block text-xs opacity-90 leading-relaxed font-normal", "data-item-body": "" },
        clean,
      ),
    );
  return true;
}

interface PinnedItem {
  readonly overlay: { ref: OverlayRef; pos: FlexibleConnectedPositionStrategy };
  readonly bubble: HTMLSpanElement;
  target: ResolvedTarget;
  offset: number;
  color: string;
}

function makeDraggable(b: HTMLElement): void {
  let s: { px: number; py: number; ex: number; ey: number } | undefined;
  const onMove = (e: MouseEvent) => {
    if (!s) return;
    const pane = b.closest<HTMLElement>(".cdk-overlay-pane") ?? b;
    pane.style.position = "fixed";
    pane.style.left = `${Math.round(s.ex + e.clientX - s.px)}px`;
    pane.style.top = `${Math.round(s.ey + e.clientY - s.py)}px`;
    pane.style.transform = "none";
    b.setAttribute("data-item-dragged", "true");
  };
  const onUp = () => {
    s = undefined;
    b.removeAttribute("data-item-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  b.addEventListener("pointerdown", (e) => {
    if (e.target instanceof Element && e.target.closest("[data-item-close], a, button")) return;
    b.setAttribute("data-item-dragging", "");
    const r = (b.closest<HTMLElement>(".cdk-overlay-pane") ?? b).getBoundingClientRect();
    s = { px: e.clientX, py: e.clientY, ex: r.left, ey: r.top };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    e.preventDefault();
  });
}

function positionsFor(offset: number): ConnectedPosition[] {
  if (offset === 0) return [...TOOLTIP_POSITIONS];
  return TOOLTIP_POSITIONS.map((p) => ({
    ...p,
    offsetX: (p.offsetX ?? 0) + (p.originX === "start" ? -offset : offset),
    offsetY: (p.offsetY ?? 0) + (p.originY === "top" ? -offset : offset),
  }));
}

let activeHoverTooltip: ItemTooltips | undefined;

@Directive({
  selector: "[spItemTooltips]",
  host: {
    "(pointerover)": "onEnter($event)",
    "(pointerout)": "onLeave($event)",
    "(click)": "onClick($event)",
    "(focusin)": "onEnter($event)",
    "(focusout)": "onFocusOut()",
    "(document:keydown.escape)": "unpinAll()",
  },
})
export class ItemTooltips {
  readonly spItemTooltips = input<ItemSource | undefined>(undefined);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly preferences = inject(Preferences);
  private readonly parent = inject(ItemTooltips, { optional: true, skipSelf: true });
  private readonly fallbackSource = signal<(() => ItemSource | undefined) | undefined>(undefined);

  private hoverOverlay?: { ref: OverlayRef; pos: FlexibleConnectedPositionStrategy };
  private hoverBubble?: HTMLSpanElement;
  private hoverTarget: ResolvedTarget | undefined;

  private readonly pinned = new Map<HTMLElement, PinnedItem>();
  private leaving?: ReturnType<typeof setTimeout>;

  readonly items: Signal<ItemMap> = computed((): ItemMap => {
    const src = this.spItemTooltips() ?? this.fallbackSource()?.();
    const own = this.resolveSource(src, this.preferences.lang());
    const inherited = this.parent?.items();
    return !inherited || inherited.size === 0
      ? own
      : own.size === 0
        ? inherited
        : new Map([...inherited, ...own]);
  });

  constructor() {
    afterRenderEffect(() => this.syncBubbles());
    inject(DestroyRef).onDestroy(() => {
      this.unpinAll();
      if (activeHoverTooltip === this) activeHoverTooltip = undefined;
      this.hoverOverlay?.ref.dispose();
    });
  }

  setSource(source: () => ItemSource | undefined): void {
    this.fallbackSource.set(source);
  }

  protected onEnter(event: Event): void {
    const target = this.resolveTarget(event.target);
    if (!target || this.pinned.has(target.origin)) return;
    event.stopPropagation();
    const from = event instanceof MouseEvent ? event.relatedTarget : null;
    if (from instanceof Node && target.origin.contains(from)) clearTimeout(this.leaving);
    else this.showHover(target);
  }

  protected onClick(event: Event): void {
    const target = this.resolveTarget(event.target);
    if (!target) return;
    event.stopPropagation();
    if (this.pinned.has(target.origin)) {
      this.unpin(target.origin);
    } else {
      this.hideHover();
      this.pin(target);
    }
  }

  protected onLeave(event: MouseEvent): void {
    const origin = this.hoverTarget?.origin;
    if (!origin || (event.relatedTarget instanceof Node && origin.contains(event.relatedTarget)))
      return;
    origin.removeAttribute("data-item-active");
    clearTimeout(this.leaving);
    this.leaving = setTimeout(() => this.hideHover(), GRACE_MS);
  }

  protected onFocusOut(): void {
    this.hideHover();
  }

  private showHover(target: ResolvedTarget): void {
    if (activeHoverTooltip && activeHoverTooltip !== this) activeHoverTooltip.hideHover();
    activeHoverTooltip = this;
    clearTimeout(this.leaving);
    this.hoverTarget?.origin.removeAttribute("data-item-active");
    this.hoverTarget = target;
    target.origin.setAttribute("data-item-active", "");
    const bubble = this.ensureHoverOverlay(target.origin);
    const raw = target.text || this.items().get(target.id);
    if (renderBubble(bubble, target.id, this.preferences.lang(), raw)) {
      this.hoverOverlay?.ref.updatePosition();
    }
  }

  protected hideHover(): void {
    clearTimeout(this.leaving);
    if (activeHoverTooltip === this) activeHoverTooltip = undefined;
    this.hoverTarget?.origin.removeAttribute("data-item-active");
    this.hoverTarget = undefined;
    this.hoverOverlay?.ref.detach();
  }

  private pin(target: ResolvedTarget): void {
    if (activeHoverTooltip === this) activeHoverTooltip = undefined;
    const offset = this.pinned.size * 12;
    const pos = createFlexibleConnectedPositionStrategy(this.injector, target.origin)
      .withPositions(positionsFor(offset))
      .withViewportMargin(8);
    const ref = createOverlayRef(this.injector, {
      positionStrategy: pos,
      scrollStrategy: createRepositionScrollStrategy(this.injector),
    });
    const bubble = this.createBubble(true, offset);
    ref.attach(new DomPortal(bubble));

    const color = nextPinnedColor(activePinnedColors, this.pinned.size);
    activePinnedColors.add(color);

    target.origin.setAttribute("data-item-pinned", "");
    target.origin.setAttribute("data-item-color", color);
    target.origin.style.setProperty("--item-color", color);
    target.origin.removeAttribute("data-item-active");

    bubble.setAttribute("data-item-pinned-bubble", "");
    bubble.setAttribute("data-item-color", color);
    bubble.style.setProperty("--item-color", color);

    const raw = target.text || this.items().get(target.id);
    renderBubble(bubble, target.id, this.preferences.lang(), raw, () => this.unpin(target.origin));
    ref.updatePosition();
    this.pinned.set(target.origin, { overlay: { ref, pos }, bubble, target, offset, color });
  }

  private unpin(origin: HTMLElement): void {
    const entry = this.pinned.get(origin);
    if (!entry) return;
    activePinnedColors.delete(entry.color);
    origin.removeAttribute("data-item-pinned");
    origin.removeAttribute("data-item-color");
    origin.style.removeProperty("--item-color");
    entry.overlay.ref.dispose();
    this.pinned.delete(origin);
  }

  protected unpinAll(): void {
    for (const [origin] of [...this.pinned.entries()]) this.unpin(origin);
    this.hideHover();
  }

  protected hide(): void {
    this.unpinAll();
  }

  private syncBubbles(): void {
    const [lang, map] = [this.preferences.lang(), this.items()];
    if (this.hoverTarget && this.hoverBubble) {
      const raw = this.hoverTarget.text || map.get(this.hoverTarget.id);
      if (!renderBubble(this.hoverBubble, this.hoverTarget.id, lang, raw)) this.hideHover();
    }
    for (const [origin, entry] of this.pinned) {
      const raw = entry.target.text || map.get(entry.target.id);
      if (!renderBubble(entry.bubble, entry.target.id, lang, raw, () => this.unpin(origin))) {
        this.unpin(origin);
      } else if (!entry.bubble.hasAttribute("data-item-dragged")) {
        entry.overlay.ref.updatePosition();
      }
    }
  }

  private resolveSource(src: ItemSource | undefined, lang: Lang): ItemMap {
    if (!src) return new Map();
    if (src instanceof Map) return src;
    if (typeof src === "string") return this.fromStore(src, lang);
    if ("review" in src) return itemsOfChange(src as ChangeView, lang);
    if ("assumptions" in src) return itemsOfReview(src as ReviewView);
    return new Map(Object.entries(src));
  }

  private fromStore(id: string, lang: Lang): ItemMap {
    const all = this.injector.get(SpectyData, null) ? this.injector.get(ChangesStore).all() : [];
    const found = all.find((view) => view.id === id);
    return found ? itemsOfChange(found, lang) : new Map();
  }

  private resolveTarget(raw: EventTarget | null): ResolvedTarget | undefined {
    if (!(raw instanceof Element) || !this.host.contains(raw) || raw.closest(IGNORED_SELECTOR))
      return undefined;
    return explicitTarget(raw, this.host) ?? inferredTarget(raw, this.host);
  }

  private ensureHoverOverlay(origin: HTMLElement): HTMLSpanElement {
    if (!this.hoverOverlay) {
      const pos = createFlexibleConnectedPositionStrategy(this.injector, origin)
        .withPositions([...TOOLTIP_POSITIONS])
        .withViewportMargin(8);
      const ref = createOverlayRef(this.injector, {
        positionStrategy: pos,
        scrollStrategy: createRepositionScrollStrategy(this.injector),
      });
      this.hoverOverlay = { ref, pos };
    } else this.hoverOverlay.pos.setOrigin(origin);
    if (!this.hoverBubble) this.hoverBubble = this.createBubble(false);
    if (!this.hoverOverlay.ref.hasAttached())
      this.hoverOverlay.ref.attach(new DomPortal(this.hoverBubble));
    return this.hoverBubble;
  }

  private createBubble(pinned: boolean, offset = 0): HTMLSpanElement {
    const b = node(this.host.ownerDocument, "span", {
      role: "tooltip",
      "data-tooltip": "",
      "data-item-offset": String(offset),
      class:
        "max-w-80 rounded-lg p-2.5 text-xs shadow-md border border-border/15 transition-opacity starting:opacity-0 flex flex-col gap-1",
      style: `transition-duration: var(--duration-fast); z-index: ${pinned ? 1000 + offset : 999}`,
    });
    if (pinned) {
      makeDraggable(b);
    } else {
      b.addEventListener("pointerenter", () => {
        clearTimeout(this.leaving);
      });
      b.addEventListener("pointerleave", () => {
        this.hideHover();
      });
    }
    this.host.ownerDocument.createDocumentFragment().appendChild(b);
    return b;
  }
}

@Component({
  selector: "sp-item-text",
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [ItemTooltips],
  template: `@for (part of parts(); track $index) {@if (part.id) {<span class="cursor-help rounded-xs px-0.5" [attr.data-item-ref]="part.id">{{ part.text }}</span>} @else {<span>{{ part.text }}</span>}}`,
})
export class ItemText {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => splitItemRefs(this.text()));
}
