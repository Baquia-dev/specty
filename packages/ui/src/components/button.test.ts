// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Button, IconButton } from "./button";
import { LucideCheck } from "./icons";

@Component({
  imports: [Button, IconButton],
  template: `
    <sp-button id="save" variant="primary" size="sm" [disabledReason]="reason()" (pressed)="count.set(count() + 1)">
      Aprobar
    </sp-button>
    <sp-icon-button id="icon" label="Confirmar" [icon]="check" (pressed)="count.set(count() + 1)" />
  `,
})
class Host {
  readonly reason = signal("");
  readonly count = signal(0);
  readonly check = LucideCheck;
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const button = element.querySelector<HTMLButtonElement>("#save button");
  if (button === null) throw new Error("no button");
  return { fixture, element, button, host: fixture.componentInstance };
}

describe("Button", () => {
  beforeEach(() => TestBed.resetTestingModule());

  it("renders a native button with its variant and size, and emits pressed (AC1)", async () => {
    const { button, host } = await render();
    expect(button.type).toBe("button");
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("h-8");
    expect(button.textContent?.trim()).toBe("Aprobar");
    button.click();
    expect(host.count()).toBe(1);
  });

  it("is disabled with a reason: not focusable, not pressed, explained (AC2)", async () => {
    const { fixture, element, button, host } = await render();
    host.reason.set("Faltan 2 supuestos de alto impacto por decidir.");
    await fixture.whenStable();

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.focus();
    expect(document.activeElement).not.toBe(button);
    button.click();
    expect(host.count()).toBe(0);

    const tooltip = element.querySelector<HTMLElement>("#save [role=tooltip]");
    expect(tooltip?.textContent?.trim()).toBe("Faltan 2 supuestos de alto impacto por decidir.");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip?.id);
    element.querySelector("#save sp-tooltip")?.dispatchEvent(new Event("pointerenter"));
    await fixture.whenStable();
    expect(document.querySelector("[data-tooltip]")?.textContent).toContain("Faltan 2 supuestos");
  });

  it("ripples from the pressed point while held, and fades on release (AC1)", async () => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const { button } = await render();
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 40,
    } as DOMRect);
    const press = (type: string) =>
      button.dispatchEvent(new MouseEvent(type, { clientX: 10, clientY: 20, bubbles: true }));

    press("pointerdown");
    const wave = button.querySelector<HTMLElement>("[data-ripple]");
    expect(wave?.getAttribute("aria-hidden")).toBe("true");
    // Radius to the farthest corner: hypot(90, 20).
    expect(Number.parseFloat(wave?.style.width ?? "")).toBeCloseTo(2 * Math.hypot(90, 20));
    expect(wave?.style.left).toBe(`${10 - Math.hypot(90, 20)}px`);

    press("pointerup");
    expect(button.querySelector("[data-ripple]")).toBeNull();
  });

  it("animates within the motion tokens when the browser can", async () => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const { button } = await render();
    const finished: { onfinish: (() => void) | null } = { onfinish: null };
    const animate = vi.fn(() => finished as unknown as Animation);
    HTMLElement.prototype.animate = animate;
    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(animate).toHaveBeenCalledWith(
      [{ transform: "scale(0)" }, { transform: "scale(1)" }],
      expect.objectContaining({ duration: 200 }),
    );
    button.dispatchEvent(new MouseEvent("pointerleave"));
    expect(animate).toHaveBeenLastCalledWith(
      [{ opacity: 0.2 }, { opacity: 0 }],
      expect.objectContaining({ duration: 120 }),
    );
    expect(button.querySelector("[data-ripple]")).not.toBeNull();
    finished.onfinish?.();
    expect(button.querySelector("[data-ripple]")).toBeNull();
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("does not ripple when the system asks for reduced motion (AC1)", async () => {
    window.matchMedia = (() => ({
      matches: true,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const { button } = await render();
    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(button.querySelector("[data-ripple]")).toBeNull();
  });

  it("names an icon button with its label, without repeating it as a description (AC1)", async () => {
    const { element, host } = await render();
    const icon = element.querySelector<HTMLButtonElement>("#icon button");
    expect(icon?.getAttribute("aria-label")).toBe("Confirmar");
    expect(icon?.hasAttribute("aria-describedby")).toBe(false);
    expect(icon?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    icon?.click();
    expect(host.count()).toBe(1);
  });

  it("AC1: shows an animated spinner and disables clicking while loading", async () => {
    const { fixture, button, element } = await render();
    const btnCmp = element.querySelector("sp-button") as unknown as {
      loading?: { set?: (v: boolean) => void };
    };
    btnCmp?.loading?.set?.(true);
    await fixture.whenStable();
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(button.querySelector(".animate-spin")).not.toBeNull();
  });
});
