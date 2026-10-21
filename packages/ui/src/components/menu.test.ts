// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MENU_POSITIONS, Menu, type MenuEntry } from "./menu";

@Component({
  imports: [Menu],
  template: `<sp-menu label="Exportar" [items]="items" (selected)="chosen.set($event)" />`,
})
class Host {
  readonly items: readonly MenuEntry[] = [
    { id: "md", label: "Markdown" },
    { id: "json", label: "JSON" },
    { id: "openspec", label: "OpenSpec" },
  ];
  readonly chosen = signal("");
}

async function render() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    "sp-menu button",
  );
  const menu = () => document.querySelector<HTMLElement>("[role=menu]");
  const items = () => [...document.querySelectorAll<HTMLElement>("[role=menuitem]")];
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { fixture, trigger, menu, items, settle, host: fixture.componentInstance };
}

const key = (target: Element | null | undefined, name: string) =>
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

describe("Menu", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("opens from its button with the focus on the first item (AC5)", async () => {
    const { trigger, menu, items, settle } = await render();
    // Aria writes "true", which ARIA defines as a menu popup.
    expect(trigger?.getAttribute("aria-haspopup")).toBe("true");
    expect(menu()?.hidden).toBe(true);
    trigger?.focus();
    key(trigger, "ArrowDown");
    await settle();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(menu()?.hidden).toBe(false);
    expect(items().map((item) => item.textContent?.trim())).toEqual([
      "Markdown",
      "JSON",
      "OpenSpec",
    ]);
    expect(document.activeElement).toBe(items()[0]);
  });

  it("moves with arrows and typeahead, and emits the chosen id (AC5)", async () => {
    const { trigger, items, settle, host } = await render();
    trigger?.focus();
    key(trigger, "Enter");
    await settle();
    key(document.activeElement, "ArrowDown");
    await settle();
    expect(document.activeElement).toBe(items()[1]);
    key(document.activeElement, "o");
    await settle();
    expect(document.activeElement).toBe(items()[2]);
    key(document.activeElement, "Enter");
    await settle();
    expect(host.chosen()).toBe("openspec");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes with Escape and gives the focus back to its button (AC5)", async () => {
    const { trigger, menu, settle } = await render();
    trigger?.focus();
    key(trigger, "ArrowDown");
    await settle();
    key(document.activeElement, "Escape");
    await settle();
    expect(menu()?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("opens below, or above when it does not fit (AC5)", () => {
    expect(MENU_POSITIONS.map((position) => position.overlayY)).toEqual([
      "top",
      "top",
      "bottom",
      "bottom",
    ]);
  });
});
