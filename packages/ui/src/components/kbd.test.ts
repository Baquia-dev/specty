// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Kbd } from "./kbd";

@Component({
  imports: [Kbd],
  template: `<sp-kbd keys="mod+shift+k" /><sp-kbd keys="alt + enter + esc" />`,
})
class Host {}

async function render(platform: string, lang: "es" | "en") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const [first, second] = [...(fixture.nativeElement as HTMLElement).querySelectorAll("sp-kbd")];
  const keys = (kbd: Element | undefined) =>
    [...(kbd?.querySelectorAll("kbd") ?? [])].map((key) => key.textContent?.trim());
  const spoken = (kbd: Element | undefined) => kbd?.querySelector(".sr-only")?.textContent?.trim();
  return { first, second, keys, spoken };
}

describe("Kbd", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows each key with macOS symbols and reads the shortcut aloud (AC5)", async () => {
    const { first, second, keys, spoken } = await render("MacIntel", "es");
    expect(keys(first)).toEqual(["⌘", "⇧", "K"]);
    expect(spoken(first)).toBe("Comando Mayúsculas K");
    expect(keys(second)).toEqual(["⌥", "↵", "Esc"]);
    expect(first?.querySelector("kbd")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses Ctrl and Alt elsewhere, in English (AC5)", async () => {
    const { first, second, keys, spoken } = await render("Win32", "en");
    expect(keys(first)).toEqual(["Ctrl", "⇧", "K"]);
    expect(spoken(first)).toBe("Control Shift K");
    expect(spoken(second)).toBe("Alt Enter Escape");
  });
});
