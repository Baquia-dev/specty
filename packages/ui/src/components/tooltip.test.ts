// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Tooltip } from "./tooltip";

@Component({
  imports: [Tooltip],
  template: `
    <sp-tooltip [text]="text()"><a href="#x">Ver cambio</a></sp-tooltip>
    <sp-tooltip text="Solo texto"><span>sin foco</span></sp-tooltip>
  `,
})
class Host {
  readonly text = signal("Abre la spec en revisión");
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const wrapper = element.querySelector<HTMLElement>("sp-tooltip");
  const link = element.querySelector<HTMLAnchorElement>("a");
  const tip = () => wrapper?.querySelector<HTMLElement>("[role=tooltip]") ?? null;
  const visible = () => tip() !== null && !tip()?.classList.contains("invisible");
  return { fixture, element, wrapper, link, tip, visible, host: fixture.componentInstance };
}

describe("Tooltip", () => {
  beforeEach(() => TestBed.resetTestingModule());

  it("describes the focusable content and shows on focus and hover (AC3)", async () => {
    const { fixture, wrapper, link, tip, visible } = await render();
    expect(link?.getAttribute("aria-describedby")).toBe(tip()?.id);
    expect(visible()).toBe(false);

    link?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await fixture.whenStable();
    expect(visible()).toBe(true);
    link?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await fixture.whenStable();
    expect(visible()).toBe(false);

    wrapper?.dispatchEvent(new Event("pointerenter"));
    await fixture.whenStable();
    expect(visible()).toBe(true);
    wrapper?.dispatchEvent(new Event("pointerleave"));
    await fixture.whenStable();
    expect(visible()).toBe(false);
  });

  it("closes with Escape, wherever the focus is (AC3)", async () => {
    const { fixture, wrapper, visible } = await render();
    wrapper?.dispatchEvent(new Event("pointerenter"));
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await fixture.whenStable();
    expect(visible()).toBe(false);
  });

  it("goes below when there is no room above", async () => {
    const { fixture, wrapper, tip } = await render();
    vi.spyOn(wrapper as HTMLElement, "getBoundingClientRect").mockReturnValue({
      top: 4,
    } as DOMRect);
    wrapper?.dispatchEvent(new Event("pointerenter"));
    await fixture.whenStable();
    expect(tip()?.classList).toContain("top-full");
  });

  it("renders nothing and describes nothing without text", async () => {
    const { fixture, wrapper, link, tip, host } = await render();
    host.text.set("");
    await fixture.whenStable();
    expect(tip()).toBeNull();
    expect(link?.hasAttribute("aria-describedby")).toBe(false);
    wrapper?.dispatchEvent(new Event("pointerenter"));
    await fixture.whenStable();
    expect(tip()).toBeNull();
  });
});
