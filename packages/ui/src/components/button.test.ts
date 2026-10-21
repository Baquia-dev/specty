// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { LucideCheck } from "@lucide/angular";
import { Button, IconButton } from "./button";

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
    expect(tooltip?.classList).not.toContain("invisible");
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
});
