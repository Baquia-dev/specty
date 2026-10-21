// SPDX-License-Identifier: Apache-2.0
import { InteractivityChecker } from "@angular/cdk/a11y";
import { Component, inject, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Commands } from "./command-palette";

@Component({ template: `` })
class Host {
  readonly ran = signal<string[]>([]);
  constructor() {
    const commands = inject(Commands);
    const add = (id: string, es: string, en: string, keys?: string) =>
      commands.register({
        id,
        label: { es, en },
        ...(keys === undefined ? {} : { keys }),
        run: () => this.ran.update((ran) => [...ran, id]),
      });
    add("colors", "Ir a Colores", "Go to Colors");
    add("dark", "Tema oscuro", "Dark theme", "mod+shift+d");
    add("lang", "Cambiar idioma", "Change language");
  }
}

async function open() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  // jsdom lays nothing out, so the CDK would think no element is visible enough to focus.
  TestBed.configureTestingModule({
    providers: [
      {
        provide: InteractivityChecker,
        useValue: {
          isFocusable: () => true,
          isTabbable: () => true,
          isVisible: () => true,
          isDisabled: () => false,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
  );
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  const input = document.querySelector<HTMLInputElement>("[role=dialog] input");
  const options = () => [...document.querySelectorAll<HTMLElement>("[role=option]")];
  const type = async (text: string) => {
    if (input === null) return;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await fixture.whenStable();
  };
  const key = async (name: string) => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
    await fixture.whenStable();
  };
  return { fixture, input, options, type, key, host: fixture.componentInstance };
}

describe("Command palette", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("opens with mod+k, focused, listing commands with their shortcuts (AC8)", async () => {
    const { input, options } = await open();
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(options()).toHaveLength(3);
    expect(options()[1]?.textContent).toContain("Tema oscuro");
    expect(options()[1]?.querySelector("sp-kbd")).not.toBeNull();
  });

  it("filters without accents or case, and says when nothing matches (AC8)", async () => {
    const { options, type } = await open();
    await type("IDIÓMA");
    expect(options()).toHaveLength(1);
    expect(options()[0]?.textContent).toContain("Cambiar idioma");
    await type("nada parecido");
    expect(options()).toHaveLength(0);
    expect(document.querySelector("[role=dialog] [role=status]")?.textContent).toContain(
      "Ningún comando coincide.",
    );
  });

  it("runs the chosen command with arrows and Enter, and closes (AC8)", async () => {
    const { key, host, fixture } = await open();
    await key("ArrowDown");
    await key("ArrowDown");
    await key("Enter");
    await fixture.whenStable();
    expect(host.ran()).toHaveLength(1);
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("registers a command's keys as a shortcut", async () => {
    const { fixture, host } = await open();
    document
      .querySelector<HTMLElement>("[role=dialog]")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    await fixture.whenStable();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "D", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(host.ran()).toEqual(["dark"]);
  });
});
