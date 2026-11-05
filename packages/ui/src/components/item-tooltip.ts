// SPDX-License-Identifier: Apache-2.0
import {
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
import { makeDraggable, nextPinnedColor, node, positionsFor, renderBubble } from "./item-bubble";
import {
  type ItemMap,
  itemsOfChange,
  itemsOfReview,
  itemTarget,
  type ResolvedTarget,
  splitItemRefs,
} from "./item-refs";
import { TOOLTIP_POSITIONS } from "./tooltip";

const GRACE_MS = 100;

type ItemSource = ChangeView | ReviewView | ItemMap | Readonly<Record<string, string>> | string;

const activePinnedColors = new Set<string>();

interface PinnedItem {
  readonly overlay: { ref: OverlayRef; pos: FlexibleConnectedPositionStrategy };
  readonly bubble: HTMLSpanElement;
  target: ResolvedTarget;
  offset: number;
  color: string;
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
    bubble.style.borderLeftColor = color;

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
    const all = this.injector.get(SpectyData, null) ? this.injector.get(ChangesStore).listed() : [];
    const found = all.find((view) => view.id === id);
    return found ? itemsOfChange(found, lang) : new Map();
  }

  private resolveTarget(raw: EventTarget | null): ResolvedTarget | undefined {
    return itemTarget(raw, this.host);
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
