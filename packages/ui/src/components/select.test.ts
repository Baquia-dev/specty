// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Select, type SelectOption } from "./select";

@Component({
  imports: [Select],
  template: `<sp-select label="Ordenar" [options]="options" [(value)]="value" />`,
})
class Host {
  readonly options: readonly SelectOption[] = [
    { value: "waiting", label: "Lo que más espera primero" },
    { value: "recent", label: "Lo más reciente primero" },
    { value: "title", label: "Título, de la A a la Z" },
    { value: "size", label: "Tamaño, de mayor a menor" },
  ];
  readonly value = signal("waiting");
}

async function render() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const trigger = element.querySelector<HTMLElement>("[data-select]");
  const list = () => document.querySelector<HTMLElement>(".cdk-overlay-container [role=listbox]");
  const options = () => [...document.querySelectorAll<HTMLElement>("[role=option]")];
  const active = () => options().find((option) => option.dataset.active === "true");
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  const key = async (name: string, init: KeyboardEventInit = {}) => {
    trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, ...init }));
    await settle();
  };
  return { element, trigger, list, options, active, settle, key, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Select", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("is named by its label, shows the chosen option and says it opens a list (AC3)", async () => {
    const { element, trigger } = await render();
    expect(element.querySelector("select")).toBeNull();
    expect(trigger?.getAttribute("role")).toBe("combobox");
    const label = trigger?.getAttribute("aria-labelledby") ?? "";
    expect(text(element.querySelector(`[id="${label}"]`))).toBe("Ordenar");
    expect(text(trigger)).toBe("Lo que más espera primero");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens its own list in the style of the UI, with the chosen option marked (AC1)", async () => {
    const { trigger, list, options, settle } = await render();
    trigger?.click();
    await settle();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(list()?.hidden).toBe(false);
    expect(list()?.className).toContain("shadow-md");
    expect(options().map(text)).toEqual([
      "Lo que más espera primero",
      "Lo más reciente primero",
      "Título, de la A a la Z",
      "Tamaño, de mayor a menor",
    ]);
    const marks = options().map((option) => option.querySelector("svg")?.getAttribute("class"));
    expect(options()[0]?.getAttribute("aria-selected")).toBe("true");
    expect(marks[0]).not.toContain("invisible");
    expect(marks.slice(1).every((mark) => mark?.includes("invisible"))).toBe(true);
  });

  it("moves with the arrows, chooses with Enter and closes, focus on the trigger (AC2)", async () => {
    const { trigger, active, options, key, host } = await render();
    trigger?.focus();
    await key("ArrowDown");
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const from = options().indexOf(active() ?? options()[0] ?? document.body);
    await key("ArrowDown");
    const to = active();
    expect(options().indexOf(to ?? document.body)).toBe(from + 1);
    expect(trigger?.getAttribute("aria-activedescendant")).toBe(to?.id);
    await key("Enter");
    expect(host.value()).toBe(to?.getAttribute("value") ?? host.options[from + 1]?.value);
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("jumps by typing and to the ends with Home and End (AC2)", async () => {
    const { trigger, active, key, host } = await render();
    trigger?.focus();
    await key("Enter");
    await key("End");
    expect(text(active())).toBe("Tamaño, de mayor a menor");
    await key("Home");
    expect(text(active())).toBe("Lo que más espera primero");
    await key("t");
    expect(text(active())).toBe("Título, de la A a la Z");
    await key("Enter");
    expect(host.value()).toBe("title");
  });

  it("closes with Escape without changing the value; Alt+↓ opens it too (AC2)", async () => {
    const { trigger, key, host } = await render();
    trigger?.focus();
    await key("ArrowDown", { altKey: true });
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    await key("ArrowDown");
    await key("Escape");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(host.value()).toBe("waiting");
  });

  it("chooses with a click, without the press taking the focus from the trigger (AC2)", async () => {
    const { trigger, list, options, settle, host } = await render();
    trigger?.focus();
    trigger?.click();
    await settle();
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    options()[3]?.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    options()[3]?.click();
    await settle();
    expect(host.value()).toBe("size");
    expect(list()?.hidden ?? true).toBe(true);
    expect(text(trigger)).toBe("Tamaño, de mayor a menor");
  });
});
