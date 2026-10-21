// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { MAX_TOASTS, TOAST_MS, Toaster, Toasts } from "./toast";

async function render() {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Toaster);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const toasts = TestBed.inject(Toasts);
  const shown = () => [...element.querySelectorAll<HTMLElement>("sp-toast")];
  const region = (live: string) => element.querySelector(`[aria-live=${live}]`);
  return { fixture, element, toasts, shown, region };
}

describe("Toasts", () => {
  afterEach(() => vi.useRealTimers());

  it("announces politely, errors assertively, with icon and spoken kind (AC6)", async () => {
    const { fixture, toasts, region } = await render();
    toasts.show("Spec aprobada.", "success");
    toasts.show("Se perdió la conexión.", "error");
    await fixture.whenStable();
    const calm = region("polite")?.querySelector("sp-toast");
    expect(calm?.getAttribute("data-kind")).toBe("success");
    expect(calm?.textContent).toContain("Spec aprobada.");
    expect(calm?.querySelector("svg[aria-hidden=true]")).not.toBeNull();
    expect(calm?.querySelector(".sr-only")?.textContent).toContain("Hecho");
    expect(region("assertive")?.textContent).toContain("Se perdió la conexión.");
  });

  it("leaves after 5 s unless hovered or focused; errors stay (AC6)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { toasts } = await render();
    const info = toasts.show("Guardado.");
    const kept = toasts.show("Revisa esto.", "warning");
    toasts.show("Falló la verificación.", "error");
    toasts.pause(kept);
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts.items().map((item) => item.text)).toEqual([
      "Revisa esto.",
      "Falló la verificación.",
    ]);
    toasts.resume(kept);
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts.items().map((item) => item.kind)).toEqual(["error"]);
    expect(info).toBe(0);
  });

  it("keeps at most three and closes with its button (AC6)", async () => {
    const { fixture, toasts, shown } = await render();
    for (const text of ["1", "2", "3", "4"]) toasts.show(text);
    await fixture.whenStable();
    expect(shown()).toHaveLength(MAX_TOASTS);
    expect(shown()[0]?.textContent).toContain("2");
    shown()[0]?.querySelector<HTMLButtonElement>("button")?.click();
    await fixture.whenStable();
    expect(shown()).toHaveLength(2);

    shown()[0]?.dispatchEvent(new Event("pointerenter"));
    shown()[0]?.dispatchEvent(new Event("pointerleave"));
    shown()[0]?.dispatchEvent(new FocusEvent("focusin"));
    shown()[0]?.dispatchEvent(new FocusEvent("focusout"));
    expect(toasts.items()).toHaveLength(2);
  });
});
