// SPDX-License-Identifier: Apache-2.0
// The bubble that shows an item in the DOM: its header and text, its close button when pinned,
// the colors of the pinned ones, how they are dragged and where they sit next to their item.
import type { ConnectedPosition } from "@angular/cdk/overlay";
import type { Lang } from "@baquia-dev/specty-core/light";
import { itemLabel } from "./item-refs";
import { TOOLTIP_POSITIONS } from "./tooltip";

export function node(
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

export function nextPinnedColor(used: ReadonlySet<string>, index: number): string {
  return (
    PINNED_PALETTE.find((c) => !used.has(c)) ??
    PINNED_PALETTE[index % PINNED_PALETTE.length] ??
    "#4e878c"
  );
}

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
    class: "inline-block size-2 rounded-full opacity-90 shrink-0",
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

export function renderBubble(
  el: HTMLElement,
  id: string,
  lang: Lang,
  text?: string,
  onClose?: () => void,
): boolean {
  const label = itemLabel(id, lang);
  if (label === undefined) return false;
  const clean = text?.replace(/\s+/g, " ").trim() ?? "";
  el.replaceChildren();
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

export function makeDraggable(b: HTMLElement): void {
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

export function positionsFor(offset: number): ConnectedPosition[] {
  if (offset === 0) return [...TOOLTIP_POSITIONS];
  return TOOLTIP_POSITIONS.map((p) => ({
    ...p,
    offsetX: (p.offsetX ?? 0) + (p.originX === "start" ? -offset : offset),
    offsetY: (p.offsetY ?? 0) + (p.originY === "top" ? -offset : offset),
  }));
}
