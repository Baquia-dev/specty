// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Collapsible } from "./collapsible";
import { TabPanel, Tabs } from "./tabs";

@Component({
  imports: [Tabs, TabPanel, Collapsible],
  template: `
    <sp-tabs label="Cambio" [(selected)]="selected">
      <sp-tab-panel value="spec" label="Spec">Contenido de la spec</sp-tab-panel>
      <sp-tab-panel value="progress" label="Progreso">Tareas</sp-tab-panel>
      <sp-tab-panel value="history" label="Historial">Eventos</sp-tab-panel>
    </sp-tabs>
    <sp-collapsible label="Diseño" [(open)]="open"><a href="#d">Detalle</a></sp-collapsible>
  `,
})
class Host {
  readonly selected = signal<string | undefined>(undefined);
  readonly open = signal(false);
}

async function render() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const tabs = () => [...element.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const panels = () => [...element.querySelectorAll<HTMLElement>("[role=tabpanel]")];
  return { fixture, element, tabs, panels, host: fixture.componentInstance };
}

const key = (target: Element | undefined, name: string) =>
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

describe("Tabs", () => {
  it("links each tab to its panel and selects the first one (AC3)", async () => {
    const { tabs, panels } = await render();
    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual(["Spec", "Progreso", "Historial"]);
    expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs()[0]?.getAttribute("aria-controls")).toBe(panels()[0]?.id);
    expect(panels()[0]?.getAttribute("aria-labelledby")).toBe(tabs()[0]?.id);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(panels().map((panel) => panel.hidden)).toEqual([false, true, true]);
  });

  it("moves with arrows, Home and End, and binds the selection both ways (AC3)", async () => {
    const { fixture, tabs, panels, host } = await render();
    key(tabs()[0], "ArrowRight");
    await fixture.whenStable();
    expect(host.selected()).toBe("progress");
    expect(document.activeElement).toBe(tabs()[1]);
    key(tabs()[1], "End");
    await fixture.whenStable();
    expect(host.selected()).toBe("history");
    key(tabs()[2], "ArrowRight");
    await fixture.whenStable();
    expect(host.selected()).toBe("spec");
    key(tabs()[0], "ArrowLeft");
    await fixture.whenStable();
    expect(host.selected()).toBe("history");
    key(tabs()[2], "Home");
    key(tabs()[0], "Tab");
    await fixture.whenStable();
    expect(host.selected()).toBe("spec");

    host.selected.set("progress");
    await fixture.whenStable();
    expect(panels().map((panel) => panel.hidden)).toEqual([true, false, true]);
    tabs()[2]?.click();
    expect(host.selected()).toBe("history");
  });
});

describe("Collapsible", () => {
  it("reflects aria-expanded and keeps folded content out of reach (AC4)", async () => {
    const { fixture, element, host } = await render();
    const button = element.querySelector<HTMLButtonElement>("sp-collapsible button");
    const region = element.querySelector<HTMLElement>(`#${button?.getAttribute("aria-controls")}`);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(region?.hasAttribute("inert")).toBe(true);
    expect(region?.style.transitionDuration).toBe("var(--duration-base)");

    button?.click();
    await fixture.whenStable();
    expect(host.open()).toBe(true);
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(region?.hasAttribute("inert")).toBe(false);
  });
});
