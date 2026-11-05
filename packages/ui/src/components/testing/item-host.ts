// SPDX-License-Identifier: Apache-2.0
// What the tests of the item tooltips share: a host with an item of each kind and a sentence that
// names some, rendered in a language, and the pointer moving over them.
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { sampleRecords } from "../../data/fixtures";
import type { ChangeView } from "../../data/records";
import { deriveViews } from "../../data/views";
import { ItemText, ItemTooltips } from "../item-tooltip";

const EVOLUCION = "20261020-evolucion-trimestre";

export function sampleChange(): ChangeView {
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

export const hover = (element: Element | null | undefined) =>
  element?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
export const leave = (element: Element | null | undefined) =>
  element?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
export const bubble = () =>
  document.querySelector<HTMLElement>(".cdk-overlay-container [data-tooltip]");

export async function render(lang: "es" | "en" = "es") {
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
