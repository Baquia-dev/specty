// SPDX-License-Identifier: Apache-2.0
import {
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  type FlexibleConnectedPositionStrategy,
  type OverlayRef,
} from "@angular/cdk/overlay";
import { ComponentPortal } from "@angular/cdk/portal";
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  inject,
  input,
  type Signal,
  signal,
  ViewContainerRef,
} from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { ChangesStore } from "../data/changes-store";
import { type ChangeView, type DeltaEntryView, type ReviewView, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { TOOLTIP_POSITIONS } from "./tooltip";

declare module "../theme/preferences" {
  interface Preferences {
    setLang(lang: Lang): void;
  }
}

Preferences.prototype.setLang = function (this: Preferences, lang: Lang): void {
  this.lang.set(lang);
};

const GRACE_MS = 100;
const EXACT_ITEM_RE = /^(AC|A|T|R|S|C)([1-9]\d*)$/;
const INLINE_ITEM_RE = /\b((?:AC|A|T|R|S|C)[1-9]\d*)\b/g;
const LEADING_ITEM_RE = /^((?:AC|A|T|R|S|C)[1-9]\d*)\b/;
const IGNORED_SELECTOR = ".cdk-overlay-container, sp-tooltip, [data-tooltip], pre, code";

type ItemPrefix = "AC" | "A" | "T" | "R" | "S" | "C";

const ITEM_LABELS: Readonly<Record<ItemPrefix, Readonly<Record<Lang, string>>>> = {
  A: { es: "Supuesto", en: "Assumption" },
  AC: { es: "Criterio de aceptación", en: "Acceptance criterion" },
  T: { es: "Tarea", en: "Task" },
  R: { es: "Riesgo", en: "Risk" },
  S: { es: "Solicitud de alcance", en: "Scope request" },
  C: { es: "Corte", en: "Slice" },
};

export interface ItemTextPart {
  readonly text: string;
  readonly id?: string;
}

export type ItemSource =
  | ChangeView
  | ReviewView
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string>>
  | string
  | undefined;

export function formatItemTooltip(id: string, lang: Lang, text?: string): string {
  const trimmed = id.trim();
  const match = EXACT_ITEM_RE.exec(trimmed);
  if (match === null) return "";
  const label = ITEM_LABELS[match[1] as ItemPrefix][lang];
  const clean = text?.replace(/\s+/g, " ").trim() ?? "";
  return clean.length > 0 ? `${label} ${trimmed}: ${clean}` : `${label} ${trimmed}`;
}

export function splitItemRefs(text: string): readonly ItemTextPart[] {
  if (text.length === 0) return [];
  const parts: ItemTextPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_ITEM_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index) });
    const id = match[1] ?? match[0];
    parts.push({ text: id, id });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
  return parts;
}

function deltaEntryText(entry: DeltaEntryView): string {
  return entry.text
    .filter((part) => part.change !== "removed")
    .map((part) => part.text)
    .join("")
    .trim();
}

export function itemsOfReview(review: ReviewView): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const assumption of review.assumptions) map.set(assumption.id, assumption.text);
  for (const criterion of review.criteria) map.set(criterion.id, criterion.text);
  for (const task of review.tasks) map.set(task.id, task.title);
  for (const risk of review.risks) map.set(risk.id, risk.text);
  for (const entry of review.delta?.entries ?? []) {
    if (!EXACT_ITEM_RE.test(entry.key) || map.has(entry.key)) continue;
    const text = deltaEntryText(entry);
    if (text.length > 0) map.set(entry.key, text);
  }
  return map;
}

function addHistoryScopes(map: Map<string, string>, change: ChangeView, lang: Lang): void {
  for (const entry of change.history) {
    if (entry.type !== "scope") continue;
    const head = `${entry.details[0]?.[lang] ?? ""} ${entry.title.es}`;
    const id = /\b(S[1-9]\d*)\b/.exec(head)?.[1];
    const summary = entry.details.at(-1)?.[lang]?.trim() ?? "";
    if (id !== undefined && !map.has(id) && summary.length > 0 && summary !== id)
      map.set(id, summary);
  }
}

export function itemsOfChange(change: ChangeView, lang: Lang = "es"): ReadonlyMap<string, string> {
  const map = new Map(itemsOfReview(change.review));
  for (const task of change.progress.tasks) {
    if (!map.has(task.id) && task.title) map.set(task.id, task.title);
  }
  for (const request of change.scopeRequests) {
    const summary = request.reason.trim() || request.paths.join(", ");
    if (summary.length > 0) map.set(request.id, summary);
  }
  addHistoryScopes(map, change, lang);
  return map;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChangeView(value: unknown): value is ChangeView {
  return isObject(value) && "review" in value && "progress" in value;
}

function isReviewView(value: unknown): value is ReviewView {
  return isObject(value) && "assumptions" in value && "tasks" in value;
}

function visibleText(element: Element): string {
  let out = "";
  for (const node of element.childNodes) {
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

function explicitTarget(element: Element, host: HTMLElement): ResolvedTarget | undefined {
  const explicit = element.closest<HTMLElement>("[data-item-ref]");
  if (explicit === null || !host.contains(explicit)) return undefined;
  const id = explicit.dataset.itemRef?.trim() ?? "";
  if (!EXACT_ITEM_RE.test(id)) return undefined;
  const text = explicit.dataset.itemText?.trim();
  return { origin: explicit, id, ...(text ? { text } : {}) };
}

function nodeIdOf(node: HTMLElement): string | undefined {
  const text = visibleText(node);
  if (EXACT_ITEM_RE.test(text) && node.children.length <= 2) return text;
  if (node.children.length === 0 && node.classList.contains("font-mono"))
    return LEADING_ITEM_RE.exec(text)?.[1];
  return undefined;
}

function inferredTarget(element: Element, host: HTMLElement): ResolvedTarget | undefined {
  let node: Element | null = element;
  while (node instanceof HTMLElement && host.contains(node)) {
    const id = nodeIdOf(node);
    if (id !== undefined) return { origin: node, id };
    node = node === host ? null : node.parentElement;
  }
  return undefined;
}

@Component({
  selector: "sp-item-tooltip-bubble",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "tooltip",
    "data-tooltip": "",
    class:
      "max-w-80 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-md transition-opacity starting:opacity-0",
    style: "transition-duration: var(--duration-fast)",
    "(pointerenter)": "enter?.()",
    "(pointerleave)": "leave?.()",
  },
  template: `{{ text() }}`,
})
class ItemTooltipBubble {
  readonly text = signal("");
  enter: (() => void) | undefined;
  leave: (() => void) | undefined;
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
  readonly spItemTooltips = input<ItemSource>(undefined);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly container = inject(ViewContainerRef);
  private readonly preferences = inject(Preferences);
  private readonly parent = inject(ItemTooltips, { optional: true, skipSelf: true });
  private readonly fallbackSource = signal<(() => ItemSource) | undefined>(undefined);
  private overlay: OverlayRef | undefined;
  private position: FlexibleConnectedPositionStrategy | undefined;
  private bubbleRef: ComponentRef<ItemTooltipBubble> | undefined;
  private activeTarget: ResolvedTarget | undefined;
  private leaving: ReturnType<typeof setTimeout> | undefined;

  readonly items: Signal<ReadonlyMap<string, string>> = computed(
    (): ReadonlyMap<string, string> => {
      const lang = this.preferences.lang();
      const own = this.resolveSource(this.spItemTooltips() ?? this.fallbackSource()?.(), lang);
      const inherited: ReadonlyMap<string, string> | undefined = this.parent?.items();
      if (inherited === undefined || inherited.size === 0) return own;
      return own.size === 0 ? inherited : new Map([...inherited, ...own]);
    },
  );

  constructor() {
    afterRenderEffect(() => this.syncBubble());
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      this.overlay?.dispose();
    });
  }

  setSource(source: () => ItemSource): void {
    this.fallbackSource.set(source);
  }

  protected onEnter(event: Event): void {
    const target = this.resolveTarget(event.target);
    if (target === undefined) return;
    event.stopPropagation();
    const from = event instanceof MouseEvent ? event.relatedTarget : null;
    if (from instanceof Node && target.origin.contains(from)) {
      this.stay();
      return;
    }
    this.showTarget(target);
  }

  protected onLeave(event: MouseEvent): void {
    if (this.activeTarget === undefined) return;
    if (event.relatedTarget instanceof Node && this.activeTarget.origin.contains(event.relatedTarget))
      return;
    this.hideSoon();
  }

  private syncBubble(): void {
    const lang = this.preferences.lang();
    const map = this.items();
    if (this.activeTarget === undefined || this.bubbleRef === undefined) return;
    const content = this.activeTarget.text || map.get(this.activeTarget.id);
    const formatted = formatItemTooltip(this.activeTarget.id, lang, content);
    if (!formatted) this.hide();
    else {
      this.bubbleRef.instance.text.set(formatted);
      this.bubbleRef.changeDetectorRef.detectChanges();
    }
  }

  private resolveSource(source: ItemSource, lang: Lang): ReadonlyMap<string, string> {
    if (source === undefined) return new Map();
    if (source instanceof Map) return source;
    if (typeof source === "string") return this.fromStore(source, lang);
    if (isChangeView(source)) return itemsOfChange(source, lang);
    if (isReviewView(source)) return itemsOfReview(source);
    return new Map(Object.entries(source));
  }

  private fromStore(id: string, lang: Lang): ReadonlyMap<string, string> {
    if (this.injector.get(SpectyData, null) === null) return new Map();
    const found = this.injector.get(ChangesStore).all().find((view) => view.id === id);
    return found === undefined ? new Map() : itemsOfChange(found, lang);
  }

  private resolveTarget(rawTarget: EventTarget | null): ResolvedTarget | undefined {
    if (!(rawTarget instanceof Element) || !this.host.contains(rawTarget)) return undefined;
    if (rawTarget.closest(IGNORED_SELECTOR) !== null) return undefined;
    return explicitTarget(rawTarget, this.host) ?? inferredTarget(rawTarget, this.host);
  }

  private showTarget(target: ResolvedTarget): void {
    if (openTooltip !== undefined && openTooltip !== this) openTooltip.hide();
    openTooltip = this;
    this.stay();
    const content = target.text || this.items().get(target.id);
    const formatted = formatItemTooltip(target.id, this.preferences.lang(), content);
    if (!formatted) return;
    this.activeTarget = target;
    this.ensureOverlay(target.origin);
    this.bubbleRef?.instance.text.set(formatted);
    this.bubbleRef?.changeDetectorRef.detectChanges();
    this.overlay?.updatePosition();
  }

  private ensureOverlay(origin: HTMLElement): void {
    if (this.overlay === undefined) {
      this.position = createFlexibleConnectedPositionStrategy(this.injector, origin)
        .withPositions([...TOOLTIP_POSITIONS])
        .withViewportMargin(8);
      this.overlay = createOverlayRef(this.injector, {
        positionStrategy: this.position,
        scrollStrategy: createRepositionScrollStrategy(this.injector),
      });
    } else {
      this.position?.setOrigin(origin);
    }
    if (!this.overlay.hasAttached()) {
      this.bubbleRef = this.overlay.attach(new ComponentPortal(ItemTooltipBubble, this.container));
      this.bubbleRef.instance.enter = () => this.stay();
      this.bubbleRef.instance.leave = () => this.hide();
    }
  }

  private stay(): void {
    clearTimeout(this.leaving);
  }

  private hideSoon(): void {
    this.stay();
    this.leaving = setTimeout(() => this.hide(), GRACE_MS);
  }

  protected hide(): void {
    this.stay();
    if (openTooltip === this) openTooltip = undefined;
    this.activeTarget = undefined;
    this.bubbleRef = undefined;
    this.overlay?.detach();
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
