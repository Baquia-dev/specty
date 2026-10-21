// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Field } from "./field";

@Component({
  imports: [Field],
  template: `
    <sp-field id="title" label="Título" hint="Una frase." [error]="error()" [(value)]="title" />
    <sp-field id="comment" label="Comentario" [multiline]="true" />
  `,
})
class Host {
  readonly title = signal("Inicial");
  readonly error = signal("");
}

async function render() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const input = element.querySelector<HTMLInputElement>("#title input");
  if (input === null) throw new Error("no input");
  return { fixture, element, input, host: fixture.componentInstance };
}

describe("Field", () => {
  it("links label and hint to a native input and binds the value both ways (AC7)", async () => {
    const { fixture, element, input, host } = await render();
    const label = element.querySelector<HTMLLabelElement>("#title label");
    expect(label?.htmlFor).toBe(input.id);
    expect(input.value).toBe("Inicial");
    expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-hint`);
    expect(input.hasAttribute("aria-invalid")).toBe(false);

    input.value = "Nuevo título";
    input.dispatchEvent(new Event("input"));
    expect(host.title()).toBe("Nuevo título");
    host.title.set("Desde fuera");
    await fixture.whenStable();
    expect(input.value).toBe("Desde fuera");
  });

  it("marks and explains an error with icon and text, not only color (AC7)", async () => {
    const { fixture, element, input, host } = await render();
    host.error.set("Escribe el motivo.");
    await fixture.whenStable();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-hint ${input.id}-error`);
    const error = element.querySelector(`#${input.id}-error`);
    expect(error?.textContent?.trim()).toBe("Escribe el motivo.");
    expect(error?.querySelector("svg")).not.toBeNull();
  });

  it("uses a textarea for multiline text, without empty descriptions", async () => {
    const { element } = await render();
    const textarea = element.querySelector<HTMLTextAreaElement>("#comment textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.hasAttribute("aria-describedby")).toBe(false);
    if (textarea === null) return;
    textarea.value = "Hola";
    textarea.dispatchEvent(new Event("input"));
    expect(textarea.value).toBe("Hola");
  });
});
