// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { Preferences } from "./preferences";

type Listener = (event: { matches: boolean }) => void;

/** jsdom has no `matchMedia`: a controllable one for `prefers-color-scheme`. */
function fakeColorScheme(dark: boolean) {
  const listeners: Listener[] = [];
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: dark,
        media: query,
        addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
      }) as unknown as MediaQueryList,
  );
  return (matches: boolean) => {
    for (const listener of listeners) listener({ matches });
  };
}

function create(): Preferences {
  const preferences = TestBed.inject(Preferences);
  TestBed.tick();
  return preferences;
}

const root = () => document.documentElement;

describe("Preferences", () => {
  beforeEach(() => {
    window.matchMedia ??= (() => undefined) as unknown as typeof window.matchMedia;
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it("follows the system theme by default, also when it changes (AC6)", () => {
    const changeScheme = fakeColorScheme(true);
    const preferences = create();
    expect(preferences.theme()).toBe("system");
    expect(root().dataset.theme).toBe("dark");

    changeScheme(false);
    TestBed.tick();
    expect(preferences.resolvedTheme()).toBe("light");
    expect(root().dataset.theme).toBe("light");
  });

  it("applies and remembers the chosen theme and language (AC5)", () => {
    fakeColorScheme(false);
    const preferences = create();
    preferences.theme.set("dark");
    preferences.lang.set("en");
    TestBed.tick();
    expect(root().dataset.theme).toBe("dark");
    expect(root().lang).toBe("en");
    expect(preferences.t()("hola", "hello")).toBe("hello");

    TestBed.resetTestingModule();
    const reopened = create();
    expect(reopened.theme()).toBe("dark");
    expect(reopened.lang()).toBe("en");
  });

  it("ignores stored values it does not know", () => {
    fakeColorScheme(false);
    localStorage.setItem("specty.theme", "sepia");
    localStorage.setItem("specty.lang", "fr");
    vi.spyOn(navigator, "language", "get").mockReturnValue("es-CO");
    const preferences = create();
    expect(preferences.theme()).toBe("system");
    expect(preferences.lang()).toBe("es");
  });

  it("uses English for browsers in other languages", () => {
    fakeColorScheme(false);
    vi.spyOn(navigator, "language", "get").mockReturnValue("de-DE");
    expect(create().lang()).toBe("en");
  });

  it("keeps working when storage is unavailable", () => {
    fakeColorScheme(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const preferences = create();
    preferences.theme.set("light");
    TestBed.tick();
    expect(root().dataset.theme).toBe("light");
  });
});
