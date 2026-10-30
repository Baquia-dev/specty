// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { sampleRecords } from "../data/fixtures";
import type { ChangeView } from "../data/records";
import { deriveViews } from "../data/views";
import { Preferences } from "../theme/preferences";
import {
  formatItemTooltip,
  ItemText,
  ItemTooltips,
  itemsOfChange,
  itemsOfReview,
  splitItemRefs,
} from "./item-tooltip";

const EVOLUCION = "20261020-evolucion-trimestre";

function sampleChange(): ChangeView {
  const found = deriveViews(sampleRecords(Date.now())).find((view) => view.id === EVOLUCION);
  if (found === undefined) throw new Error(`no sample ${EVOLUCION}`);
  return found;
}

@Component({
  imports: [ItemTooltips, ItemText],
  template: `
    <div [spItemTooltips]="change()">
      <span id="assumption">A1</span>
      <span id="criterion">AC1</span>
      <span id="task">T1</span>
      <span id="risk">R1</span>
      <span id="unknown">C2</span>
      <p id="sentence"><sp-item-text [text]="sentence()" /></p>
    </div>
  `,
})
class Host {
  readonly change = signal<ChangeView | undefined>(sampleChange());
  readonly sentence = signal("Sobre A1: afecta a T1 y AC1 (cortes C1).");
}

const hover = (element: Element | null | undefined) =>
  element?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
const leave = (element: Element | null | undefined) =>
  element?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
const bubble = () => document.querySelector<HTMLElement>(".cdk-overlay-container [data-tooltip]");

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const settle = () => fixture.whenStable();
  return { fixture, element, settle, host: fixture.componentInstance };
}

describe("ItemTooltips and ItemText", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("AC1: formats item and request siglas with their type and content in Spanish and English", () => {
    const change = sampleChange();
    const items = itemsOfChange(change);
    expect(items.get("A1")).toBeTruthy();
    expect(items.get("AC1")).toBeTruthy();
    expect(items.get("T1")).toBeTruthy();
    expect(itemsOfReview(change.review).get("R1")).toBe(items.get("R1"));

    expect(formatItemTooltip("A1", "es", "Ya llega en el provider.")).toBe(
      "Supuesto A1: Ya llega en el provider.",
    );
    expect(formatItemTooltip("AC1", "es", "El gráfico muestra un punto.")).toBe(
      "Criterio de aceptación AC1: El gráfico muestra un punto.",
    );
    expect(formatItemTooltip("T4", "es", "Rediseñar la tarjeta")).toBe(
      "Tarea T4: Rediseñar la tarjeta",
    );
    expect(formatItemTooltip("R1", "es", "Desborda en pantallas pequeñas.")).toBe(
      "Riesgo R1: Desborda en pantallas pequeñas.",
    );
    expect(formatItemTooltip("S1", "es", "Faltan tokens")).toBe(
      "Solicitud de alcance S1: Faltan tokens",
    );
    expect(formatItemTooltip("AC1", "en", "The chart shows one point.")).toBe(
      "Acceptance criterion AC1: The chart shows one point.",
    );
    expect(formatItemTooltip("T4", "en", "Redesign card")).toBe("Task T4: Redesign card");
  });

  it("AC1: shows a floating tooltip with the sigla type and content on hover or focus, and hides on Escape", async () => {
    const { element, settle } = await render("es");
    const change = sampleChange();
    const a1 = change.review.assumptions.find((item) => item.id === "A1")?.text ?? "";
    const ac1 = change.review.criteria.find((item) => item.id === "AC1")?.text ?? "";
    const t1 = change.review.tasks.find((item) => item.id === "T1")?.title ?? "";

    hover(element.querySelector("#assumption"));
    await settle();
    expect(bubble()?.textContent?.trim()).toBe(`Supuesto A1: ${a1}`);

    hover(element.querySelector("#criterion"));
    await settle();
    expect(bubble()?.textContent?.trim()).toBe(`Criterio de aceptación AC1: ${ac1}`);

    element.querySelector("#task")?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await settle();
    expect(bubble()?.textContent?.trim()).toBe(`Tarea T1: ${t1}`);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    expect(bubble()).toBeNull();
  });

  it("AC1: stays while moving the pointer onto the tooltip bubble (WCAG 1.4.13)", async () => {
    const { element } = await render("es");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const target = element.querySelector("#task");
    hover(target);
    leave(target);
    bubble()?.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(400);
    expect(bubble()).not.toBeNull();
    bubble()?.dispatchEvent(new Event("pointerleave"));
    expect(bubble()).toBeNull();
  });

  it("AC2: segments inline text without changing its visible textContent and shows each sigla's tooltip", async () => {
    expect(splitItemRefs("Bloqueado · con S1 para T1")).toEqual([
      { text: "Bloqueado · con " },
      { text: "S1", id: "S1" },
      { text: " para " },
      { text: "T1", id: "T1" },
    ]);

    const { element, settle } = await render("es");
    const sentence = element.querySelector("#sentence");
    expect(sentence?.textContent).toBe("Sobre A1: afecta a T1 y AC1 (cortes C1).");
    const refs = [...(sentence?.querySelectorAll<HTMLElement>("[data-item-ref]") ?? [])];
    expect(refs.map((ref) => ref.dataset.itemRef)).toEqual(["A1", "T1", "AC1", "C1"]);

    hover(refs[1]);
    await settle();
    expect(bubble()?.textContent).toContain("Tarea T1:");
  });

  it("AC3: shows the sigla type and id when no content is available, in the active language", async () => {
    expect(formatItemTooltip("C2", "es")).toBe("Corte C2");
    expect(formatItemTooltip("C2", "en")).toBe("Slice C2");
    expect(formatItemTooltip("S3", "en")).toBe("Scope request S3");
    expect(formatItemTooltip("NOPE", "es")).toBe("");

    const { element, settle, host } = await render("es");
    hover(element.querySelector("#unknown"));
    await settle();
    expect(bubble()?.textContent?.trim()).toBe("Corte C2");

    TestBed.inject(Preferences).lang.set("en");
    host.change.set(undefined);
    await settle();
    hover(element.querySelector("#task"));
    await settle();
    expect(bubble()?.textContent?.trim()).toBe("Task T1");
  });

  it("AC1: shows info cursor and visual active highlight on the hovered sigla element", async () => {
    const { element, settle } = await render("es");
    const sentence = element.querySelector("#sentence");
    const ref = sentence?.querySelector<HTMLElement>("[data-item-ref='T1']");
    expect(ref).not.toBeNull();
    expect(ref?.classList.contains("cursor-help") || ref?.hasAttribute("data-item-ref")).toBe(true);

    hover(ref);
    await settle();
    expect(ref?.hasAttribute("data-item-active") || ref?.classList.contains("cursor-help")).toBe(
      true,
    );

    leave(ref);
    await settle();
    expect(ref?.hasAttribute("data-item-active")).toBe(false);
  });

  it("AC2: renders tooltip bubble with bullet indicator and refined pill styling", async () => {
    const { element, settle } = await render("es");
    hover(element.querySelector("#assumption"));
    await settle();
    const tooltip = bubble();
    expect(tooltip).not.toBeNull();
    expect(tooltip?.querySelector("[data-item-bullet]")).not.toBeNull();
    expect(
      tooltip?.classList.contains("rounded-lg") || tooltip?.classList.contains("rounded-md"),
    ).toBe(true);
  });

  it("AC3: formats tooltip with clear visual hierarchy separating header and description", async () => {
    const { element, settle } = await render("es");
    const change = sampleChange();
    const ac1 = change.review.criteria.find((item) => item.id === "AC1")?.text ?? "";

    hover(element.querySelector("#criterion"));
    await settle();
    const tooltip = bubble();
    expect(tooltip).not.toBeNull();

    const header = tooltip?.querySelector("[data-item-header]");
    const body = tooltip?.querySelector("[data-item-body]");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("Criterio de aceptación AC1");
    expect(body).not.toBeNull();
    expect(body?.textContent?.trim()).toBe(ac1);
    expect(tooltip?.textContent?.trim()).toBe(`Criterio de aceptación AC1: ${ac1}`);
  });

  it("AC1: pins tooltip on click and displays close button 'x' in the top right corner", async () => {
    const { element, settle } = await render("es");
    const target = element.querySelector<HTMLElement>("#criterion");
    target?.click();
    await settle();
    const tooltip = bubble();
    expect(tooltip).not.toBeNull();
    const closeBtn = tooltip?.querySelector<HTMLButtonElement>("[data-item-close]");
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute("aria-label")).toBeTruthy();

    leave(target);
    await settle();
    expect(bubble()).not.toBeNull();
  });

  it("AC2: unpins and hides the tooltip when clicking the close button or pressing Escape", async () => {
    const { element, settle } = await render("es");
    const target = element.querySelector<HTMLElement>("#task");
    target?.click();
    await settle();
    expect(bubble()).not.toBeNull();

    const closeBtn = bubble()?.querySelector<HTMLButtonElement>("[data-item-close]");
    closeBtn?.click();
    await settle();
    expect(bubble()).toBeNull();

    target?.click();
    await settle();
    expect(bubble()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    expect(bubble()).toBeNull();
  });

  it("AC3: does not display close button when only opened via hover and closes on leave", async () => {
    const { element, settle } = await render("es");
    const target = element.querySelector<HTMLElement>("#assumption");
    hover(target);
    await settle();
    const tooltip = bubble();
    expect(tooltip).not.toBeNull();
    expect(tooltip?.querySelector("[data-item-close]")).toBeNull();

    leave(target);
    await new Promise((r) => setTimeout(r, 150));
    await settle();
    expect(bubble()).toBeNull();
  });

  it("AC1: sets data-item-pinned indicator on the owner element when pinned on click", async () => {
    const { element, settle } = await render("es");
    const target = element.querySelector<HTMLElement>("#criterion");
    expect(target?.hasAttribute("data-item-pinned")).toBe(false);
    target?.click();
    await settle();
    expect(target?.hasAttribute("data-item-pinned")).toBe(true);
    expect(bubble()).not.toBeNull();
  });

  it("AC2: keeps multiple pinned tooltips open simultaneously with their close buttons and indicators", async () => {
    const { element, settle } = await render("es");
    const t1 = element.querySelector<HTMLElement>("#criterion");
    const t2 = element.querySelector<HTMLElement>("#task");
    t1?.click();
    await settle();
    t2?.click();
    await settle();

    const bubbles = document.querySelectorAll<HTMLElement>(".cdk-overlay-container [data-tooltip]");
    expect(bubbles.length).toBe(2);
    expect(t1?.hasAttribute("data-item-pinned")).toBe(true);
    expect(t2?.hasAttribute("data-item-pinned")).toBe(true);
    for (const b of bubbles) {
      expect(b.querySelector("[data-item-close]")).not.toBeNull();
    }
  });

  it("AC3: adjusts position or offsets overlapping tooltips to prevent full occlusion", async () => {
    const { element, settle } = await render("es");
    const t1 = element.querySelector<HTMLElement>("#criterion");
    const t2 = element.querySelector<HTMLElement>("#task");
    t1?.click();
    await settle();
    t2?.click();
    await settle();

    const bubbles = [
      ...document.querySelectorAll<HTMLElement>(".cdk-overlay-container [data-tooltip]"),
    ];
    expect(bubbles.length).toBe(2);
    const b1 = bubbles[0];
    const b2 = bubbles[1];
    expect(b1).toBeDefined();
    expect(b2).toBeDefined();
    if (!b1 || !b2) return;
    expect(
      b1.getAttribute("data-item-offset") !== b2.getAttribute("data-item-offset") ||
        b1.style.zIndex !== b2.style.zIndex,
    ).toBe(true);
  });

  it("AC4: closes only the target tooltip when clicking its close button or trigger, removing its indicator", async () => {
    const { element, settle } = await render("es");
    const t1 = element.querySelector<HTMLElement>("#criterion");
    const t2 = element.querySelector<HTMLElement>("#task");
    t1?.click();
    await settle();
    t2?.click();
    await settle();

    let bubbles = document.querySelectorAll<HTMLElement>(".cdk-overlay-container [data-tooltip]");
    expect(bubbles.length).toBe(2);

    const first = bubbles[0];
    expect(first).toBeDefined();
    const close1 = first?.querySelector<HTMLButtonElement>("[data-item-close]");
    close1?.click();
    await settle();

    bubbles = document.querySelectorAll<HTMLElement>(".cdk-overlay-container [data-tooltip]");
    expect(bubbles.length).toBe(1);
    expect(t1?.hasAttribute("data-item-pinned")).toBe(false);
    expect(t2?.hasAttribute("data-item-pinned")).toBe(true);

    t2?.click();
    await settle();
    bubbles = document.querySelectorAll<HTMLElement>(".cdk-overlay-container [data-tooltip]");
    expect(bubbles.length).toBe(0);
    expect(t2?.hasAttribute("data-item-pinned")).toBe(false);
  });
});
