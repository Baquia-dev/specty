// SPDX-License-Identifier: Apache-2.0
import { Component, inject, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { keysOf, normalizeKeys, Shortcuts } from "./shortcuts";

@Component({
  template: `<input id="field" /><textarea id="notes"></textarea>`,
})
class List {
  readonly moves = signal<string[]>([]);
  constructor() {
    const shortcuts = inject(Shortcuts);
    for (const key of ["j", "k"]) {
      shortcuts.register({
        keys: key,
        description: { es: `Tecla ${key}`, en: `Key ${key}` },
        run: () => this.moves.update((moves) => [...moves, key]),
      });
    }
  }
}

const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));

async function render() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(List);
  await fixture.whenStable();
  return { fixture, list: fixture.componentInstance, shortcuts: TestBed.inject(Shortcuts) };
}

describe("Shortcuts", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("normalizes keys and reads key presses", () => {
    expect(normalizeKeys("Shift + Mod + K")).toBe("mod+shift+k");
    expect(normalizeKeys("Esc")).toBe("escape");
    const event = new KeyboardEvent("keydown", { key: "K", metaKey: true });
    expect(keysOf(event, true)).toBe("mod+k");
    expect(keysOf(event, false)).toBe("k");
    expect(keysOf(new KeyboardEvent("keydown", { key: "?", shiftKey: true }), false)).toBe("?");
    expect(keysOf(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }), false)).toBe(
      "shift+enter",
    );
  });

  it("runs registered shortcuts, except while typing in a field (AC7)", async () => {
    const { list, fixture } = await render();
    press(document.body, "j");
    press(document.body, "k");
    const field = (fixture.nativeElement as HTMLElement).querySelector("#field") as HTMLElement;
    press(field, "j");
    press((fixture.nativeElement as HTMLElement).querySelector("#notes") as HTMLElement, "k");
    expect(list.moves()).toEqual(["j", "k"]);
  });

  it("lets mod+k and Escape through while typing, and the latest registration wins", async () => {
    const { fixture, shortcuts } = await render();
    const ran: string[] = [];
    TestBed.runInInjectionContext(() => {
      shortcuts.register({
        keys: "mod+k",
        description: { es: "a", en: "a" },
        run: () => ran.push("first"),
      });
      shortcuts.register({
        keys: "Ctrl+K".replace("Ctrl", "mod"),
        description: { es: "b", en: "b" },
        run: () => ran.push("second"),
      });
    });
    const field = (fixture.nativeElement as HTMLElement).querySelector("#field") as HTMLElement;
    press(field, "k", { ctrlKey: true });
    expect(ran).toEqual(["second"]);
  });

  it("forgets a shortcut when its owner is destroyed (AC7)", async () => {
    const { fixture, list } = await render();
    fixture.destroy();
    press(document.body, "j");
    expect(list.moves()).toEqual([]);
  });

  it("opens the list of active shortcuts with ? (AC7)", async () => {
    const { fixture } = await render();
    press(document.body, "?", { shiftKey: true });
    await fixture.whenStable();
    const dialog = document.querySelector("[role=dialog]");
    expect(dialog?.textContent).toContain("Atajos de teclado");
    expect(dialog?.textContent).toContain("Tecla j");
    expect(dialog?.querySelectorAll("sp-kbd").length).toBeGreaterThanOrEqual(3);
  });
});
