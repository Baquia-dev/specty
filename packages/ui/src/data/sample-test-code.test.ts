// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { FixtureData } from "./fixtures";
import { deriveViews } from "./views";

const NOTICES = "20261022-avisos-calificaciones";
const PDF = "20261019-boletines-pdf";

/** The prototype's source, as the app makes it. */
function source(): FixtureData {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [FixtureData] });
  return TestBed.inject(FixtureData);
}

async function viewOf(data: FixtureData, id: string) {
  const view = deriveViews(await data.changes()).find((change) => change.id === id);
  if (view === undefined) throw new Error(`no sample change ${id}`);
  return view;
}

describe("the code of the prototype's tests", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: gives the code of the tests sent, and of the same tests once approved and locked", async () => {
    const data = source();
    const notice = await data.testCode(NOTICES, "test/grades/grade_notice_test.dart");
    expect(notice).toContain("void main() {");
    expect(notice).toContain("AC1:");
    expect(await data.testCode(NOTICES, "test/grades/notice_view_test.dart")).toContain("AC2:");
    await data.approve(NOTICES, 1);
    const locked = (await viewOf(data, NOTICES)).lockedTests?.map((test) => test.path) ?? [];
    expect(locked).toHaveLength(2);
    for (const path of locked) expect(await data.testCode(NOTICES, path)).toContain("void main()");
  });

  it("AC2: refuses what is not a test of the change, and a change it does not have", async () => {
    const data = source();
    const notATest = {
      text: {
        es: "No se puede mostrar el código de este test: no es un test del cambio o no se pudo leer.",
        en: "This test's code cannot be shown: it is not a test of the change, or it could not be read.",
      },
    };
    await expect(data.testCode(PDF, "lib/reports/pdf/report_card.dart")).rejects.toMatchObject(
      notATest,
    );
    await expect(data.testCode(PDF, "test/grades/grade_notice_test.dart")).rejects.toMatchObject(
      notATest,
    );
    await expect(
      data.testCode("20261001-no-existe", "test/grades/grade_notice_test.dart"),
    ).rejects.toMatchObject({
      text: { es: "No existe el cambio 20261001-no-existe." },
    });
  });
});
