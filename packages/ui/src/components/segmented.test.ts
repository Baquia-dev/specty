// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Segmented, type SegmentedOption } from "./segmented";

const MODES: readonly SegmentedOption[] = [
  { value: "unified", label: "Unificado" },
  { value: "split", label: "Lado a lado" },
];

@Component({
  imports: [Segmented],
  template: `
    <sp-segmented label="Vista del diff" [options]="options" [(value)]="mode" />
    <sp-segmented label="Qué cambios" [hideLabel]="true" [options]="options" [(value)]="other" />
  `,
})
class Host {
  readonly options = MODES;
  readonly mode = signal("unified");
  readonly other = signal("split");
}

async function render() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const [first, second] = [...element.querySelectorAll<HTMLElement>("sp-segmented")];
  const radios = (group: HTMLElement | undefined) => [
    ...(group?.querySelectorAll<HTMLInputElement>("input[type=radio]") ?? []),
  ];
  return { fixture, host: fixture.componentInstance, first, second, radios };
}

describe("Segmented", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("marks the chosen option and changes the value on a click (AC1)", async () => {
    const { fixture, host, first, radios } = await render();
    expect(radios(first).map((radio) => radio.checked)).toEqual([true, false]);
    first?.querySelector<HTMLElement>("[data-value=split]")?.click();
    await fixture.whenStable();
    expect(host.mode()).toBe("split");
    expect(radios(first).map((radio) => radio.checked)).toEqual([false, true]);
    // A value set from outside shows too.
    host.mode.set("unified");
    await fixture.whenStable();
    expect(radios(first).map((radio) => radio.checked)).toEqual([true, false]);
  });

  it("is one group of native radios, so the keyboard works as in any radio group (AC2)", async () => {
    const { first, second, radios } = await render();
    const names = new Set(radios(first).map((radio) => radio.name));
    expect(names.size).toBe(1);
    // Each selector keeps its own choice.
    expect(radios(second).every((radio) => !names.has(radio.name))).toBe(true);
    // No tabindex of its own: the browser moves the focus into the chosen radio.
    expect(radios(first).every((radio) => !radio.hasAttribute("tabindex"))).toBe(true);
    // The radio is out of sight, so the option draws the focus.
    const option = first?.querySelector("label");
    expect(option?.className).toContain("has-focus-visible:outline-2");
    expect(radios(first)[0]?.className).toContain("sr-only");
  });

  it("is named by its label, visible or only for a screen reader (AC3)", async () => {
    const { first, second, radios } = await render();
    const group = first?.querySelector("[role=radiogroup]");
    const label = first?.querySelector(`#${group?.getAttribute("aria-labelledby")}`);
    expect(label?.textContent?.trim()).toBe("Vista del diff");
    // Each radio is named by the option it sits in.
    expect(radios(first).map((radio) => radio.closest("label")?.textContent?.trim())).toEqual([
      "Unificado",
      "Lado a lado",
    ]);
    const hidden = second?.querySelector("[role=radiogroup]");
    expect(hidden?.getAttribute("aria-label")).toBe("Qué cambios");
    expect(hidden?.hasAttribute("aria-labelledby")).toBe(false);
    expect(second?.querySelector("span[id]")).toBeNull();
    expect(radios(second).map((radio) => radio.checked)).toEqual([false, true]);
  });

  it("lets the options wrap instead of overflowing (AC4)", async () => {
    const { first } = await render();
    expect(first?.className).toContain("flex-wrap");
    expect(first?.className).toContain("max-w-full");
    expect(first?.querySelector("[role=radiogroup]")?.className).toContain("flex-wrap");
  });
});
