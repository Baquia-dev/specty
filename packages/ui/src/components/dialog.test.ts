// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA } from "@angular/cdk/dialog";
import { Component, inject } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Button } from "./button";
import { DialogFrame, Dialogs } from "./dialog";

@Component({
  imports: [DialogFrame, Button],
  template: `
    <sp-dialog heading="Rechazar supuesto" description="El agente leerá el motivo.">
      <p>{{ data.item }}</p>
      <sp-button actions variant="primary">Rechazar</sp-button>
    </sp-dialog>
  `,
})
class Reject {
  readonly data = inject<{ item: string }>(DIALOG_DATA);
}

@Component({
  imports: [Button],
  template: `<sp-button id="open" (pressed)="open()">Abrir</sp-button>`,
})
class Opener {
  private readonly dialogs = inject(Dialogs);
  open() {
    return this.dialogs.open(Reject, { item: "A2" });
  }
}

const pane = () => document.querySelector<HTMLElement>("[role=dialog]");

async function openDialog() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Opener);
  await fixture.whenStable();
  const opener = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    "#open button",
  );
  opener?.focus();
  const ref = fixture.componentInstance.open();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  return { fixture, opener, ref };
}

describe("Dialogs", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("is announced by its title and takes the focus in (AC1)", async () => {
    await openDialog();
    const dialog = pane();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(dialog?.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Rechazar supuesto");
    expect(dialog?.textContent).toContain("A2");
    expect(dialog?.contains(document.activeElement)).toBe(true);
    expect(document.querySelector(".cdk-overlay-backdrop")?.className).toContain(
      "bg-[rgb(0_0_0/0.4)]",
    );
  });

  it("closes with Escape and gives the focus back to the opener (AC1)", async () => {
    const { fixture, opener, ref } = await openDialog();
    const closed = vi.fn();
    ref.closed.subscribe(closed);
    // The CDK reads `keyCode`, which jsdom leaves at 0 unless it is given.
    pane()?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }),
    );
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    expect(closed).toHaveBeenCalled();
    expect(pane()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes with its close button (AC1)", async () => {
    const { fixture } = await openDialog();
    pane()?.querySelector<HTMLButtonElement>("sp-icon-button button")?.click();
    await fixture.whenStable();
    expect(pane()).toBeNull();
  });
});
