// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { Preferences } from "../theme/preferences";
import { Decisions } from "./decisions";
import { FixtureData } from "./fixtures";
import { type Bilingual, type ChangeRecord, SpectyData } from "./records";

/** A source with no actions of its own: what any source says unless it overrides it. */
class Plain extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

/** A source whose answer the test gives. */
class Says extends Plain {
  static answer: () => Promise<Bilingual | undefined> = () => Promise.resolve(undefined);
  override readOnly(): Promise<Bilingual | undefined> {
    return Says.answer();
  }
}

function decisions(source: new () => SpectyData): Decisions {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: source }] });
  return TestBed.inject(Decisions);
}

const settled = () => new Promise((done) => setTimeout(done));

describe("Decisions", () => {
  it("says why the person cannot decide, in their language (AC1)", async () => {
    Says.answer = () => Promise.resolve({ es: "Solo lectura.", en: "Read only." });
    const said = decisions(Says);
    // Until the source answers, the decisions stay open.
    expect(said.allowed()).toBe(true);
    await settled();
    expect([said.blocked(), said.allowed()]).toEqual(["Solo lectura.", false]);
    TestBed.inject(Preferences).lang.set("en");
    expect(said.blocked()).toBe("Read only.");
  });

  it("lets the person decide on the sample data, and when the source cannot tell (AC1)", async () => {
    const sample = decisions(FixtureData);
    await settled();
    expect(sample.allowed()).toBe(true);
    Says.answer = () => Promise.reject(new Error("caído"));
    const unknown = decisions(Says);
    await settled();
    expect(unknown.allowed()).toBe(true);
  });

  it("is read only on a source that takes no actions (AC1)", async () => {
    const plain = decisions(Plain);
    await settled();
    expect(plain.blocked()).toBe("Esta fuente de datos es de solo lectura: no admite acciones.");
  });
});
