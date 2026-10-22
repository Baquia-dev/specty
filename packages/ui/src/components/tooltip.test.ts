// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { TOOLTIP_POSITIONS, Tooltip } from "./tooltip";

@Component({
  imports: [Tooltip],
  template: `<sp-tooltip [text]="text()"><a href="#x">Ver cambio</a></sp-tooltip>`,
})
class Host {
  readonly text = signal("Abre la spec en revisión");
}

async function render() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const wrapper = element.querySelector<HTMLElement>("sp-tooltip");
  const link = element.querySelector<HTMLAnchorElement>("a");
  const description = () => wrapper?.querySelector<HTMLElement>("[role=tooltip]") ?? null;
  const bubble = () => document.querySelector<HTMLElement>(".cdk-overlay-container [data-tooltip]");
  const settle = () => fixture.whenStable();
  return { fixture, wrapper, link, description, bubble, settle, host: fixture.componentInstance };
}

describe("Tooltip", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("describes the focusable content even while closed (AC2)", async () => {
    const { link, description, bubble } = await render();
    expect(link?.getAttribute("aria-describedby")).toBe(description()?.id);
    expect(description()?.textContent?.trim()).toBe("Abre la spec en revisión");
    expect(bubble()).toBeNull();
  });

  it("floats the bubble in an overlay on focus and closes it on blur (AC2)", async () => {
    const { link, bubble, settle } = await render();
    link?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await settle();
    expect(bubble()?.textContent?.trim()).toBe("Abre la spec en revisión");
    expect(bubble()?.getAttribute("aria-hidden")).toBe("true");
    link?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await settle();
    expect(bubble()).toBeNull();
  });

  it("closes when its text goes empty while showing, with no empty bubble", async () => {
    const { link, bubble, settle, host } = await render();
    link?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await settle();
    expect(bubble()).not.toBeNull();
    host.text.set("");
    await settle();
    expect(bubble()).toBeNull();
    expect(link?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("stays while the pointer moves onto the bubble, and leaves after (WCAG 1.4.13)", async () => {
    const { wrapper, bubble } = await render();
    // The overlay attaches synchronously; only the grace timer needs a fake clock.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    wrapper?.dispatchEvent(new Event("pointerenter"));
    wrapper?.dispatchEvent(new Event("pointerleave"));
    bubble()?.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(500);
    expect(bubble()).not.toBeNull();
    bubble()?.dispatchEvent(new Event("pointerleave"));
    expect(bubble()).toBeNull();

    wrapper?.dispatchEvent(new Event("pointerenter"));
    wrapper?.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(150);
    expect(bubble()).toBeNull();
  });

  it("closes with Escape, wherever the focus is (AC2)", async () => {
    const { wrapper, bubble, settle } = await render();
    wrapper?.dispatchEvent(new Event("pointerenter"));
    await settle();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(bubble()).toBeNull();
  });

  it("prefers above, then falls back to below, right and left (AC2)", () => {
    expect(TOOLTIP_POSITIONS.map((position) => `${position.originY}/${position.originX}`)).toEqual([
      "top/center",
      "bottom/center",
      "center/end",
      "center/start",
    ]);
  });

  it("shows and describes nothing without text", async () => {
    const { wrapper, link, description, bubble, host, settle } = await render();
    host.text.set("");
    await settle();
    expect(description()).toBeNull();
    expect(link?.hasAttribute("aria-describedby")).toBe(false);
    wrapper?.dispatchEvent(new Event("pointerenter"));
    await settle();
    expect(bubble()).toBeNull();
  });
});
