// SPDX-License-Identifier: Apache-2.0
// A sample change back in review after an adjustment: revision 2 was approved and implemented,
// acceptance asked for PDFs and a notice to the family, and revision 3 waits for review.
import type { ChangeRecord } from "./records";

const ID = "20261016-justificar-faltas";
const MINUTE = 60_000;
const HASH = `sha256:${"0".repeat(64)}`;

const spec = (body: string) =>
  `---\nkind: standard\n---\n\n# Justificar faltas desde la app\n\n${body.trim()}\n`;

/** Revision 2, approved and implemented before the adjustment. */
const APPROVED = spec(`
## Objetivo

La familia justifica una falta de su hijo desde la app, adjuntando una foto del justificante, y el tutor la acepta o la rechaza.

## Fuera de alcance

- Justificar faltas futuras (ausencias previstas).
- Firmar los justificantes digitalmente.

## Supuestos

- A1: El colegio acepta justificantes digitales.
  - impacto: alto
- A2: Basta con una foto del justificante; no hace falta el original en papel.
  - impacto: alto
- A3: Los tutores revisan los justificantes desde la web de docentes.

## Criterios de aceptación

- AC1: CUANDO la familia envía un justificante ENTONCES la falta queda "pendiente de revisión".
- AC2: CUANDO el tutor acepta el justificante ENTONCES la falta queda justificada.
- AC3: CUANDO el justificante pesa más de 5 MB ENTONCES la app lo reduce antes de enviarlo.

## Archivos

- crear lib/absences/justify_screen.dart — formulario con la foto
- modificar lib/absences/absence_list.dart — botón "Justificar"
- crear test/absences/justify_screen_test.dart — pruebas del formulario

## Tareas

- [x] T1: Formulario de justificante con foto
  - files: lib/absences/justify_screen.dart, test/absences/justify_screen_test.dart
  - ac: AC1, AC3
  - verify: flutter test test/absences
- [x] T2: Botón "Justificar" en la lista de faltas
  - files: lib/absences/absence_list.dart
  - ac: AC2
  - verify: flutter test test/absences

## Riesgos

- R1: Las fotos del móvil pesan demasiado. Mitigación: reducirlas antes de enviarlas (AC3).
`);

/** Revision 3: PDFs too, and a notice to the family when the tutor decides. */
const CURRENT = APPROVED.replace(
  "adjuntando una foto del justificante, y el tutor la acepta o la rechaza.",
  "adjuntando una foto o un PDF del justificante, y recibe un aviso cuando el tutor la acepta o la rechaza.",
)
  .replace("Basta con una foto del justificante;", "Basta con una foto o un PDF del justificante;")
  .replace(
    "ENTONCES la falta queda justificada.",
    `ENTONCES la falta queda justificada y la familia recibe un aviso.
- AC4: CUANDO el tutor rechaza el justificante ENTONCES la familia recibe un aviso con el motivo.`,
  )
  .replace(
    "— pruebas del formulario",
    `— pruebas del formulario
- crear lib/notifications/absence_notice.dart — aviso a la familia`,
  )
  .replace(
    "  - ac: AC2\n  - verify: flutter test test/absences",
    `  - ac: AC2
  - verify: flutter test test/absences
- [ ] T3: Adjuntar un PDF en el formulario
  - files: lib/absences/justify_screen.dart, test/absences/justify_screen_test.dart
  - ac: AC1
  - verify: flutter test test/absences
- [ ] T4: Avisar a la familia cuando el tutor decide
  - files: lib/notifications/absence_notice.dart
  - ac: AC2, AC4
  - verify: flutter test test/notifications`,
  )
  .replace(
    "- R1: Las fotos del móvil pesan demasiado. Mitigación: reducirlas antes de enviarlas (AC3).",
    "- R2: Un PDF puede traer contenido malicioso. Mitigación: el servidor solo acepta PDF sin scripts.",
  );

/** Back in review for 30 minutes; A2 changed, so its confirmation waits again. */
export function revisedSample(now: number): ChangeRecord {
  const ago = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
  return {
    spec: CURRENT,
    approvedSpec: APPROVED,
    phaseSince: ago(30),
    state: {
      schema: 1,
      id: ID,
      kind: "standard",
      phase: "review",
      branch: `specty/${ID}`,
      revision: 3,
      approved: { revision: 2, hash: HASH, at: ago(60 * 72), by: "Ana Gómez", channel: "ui" },
      items: { A1: { hash: HASH, decision: "confirmed" } },
      tasks: {
        T1: { status: "done", attempts: 1, scopeExtra: [] },
        T2: { status: "done", attempts: 1, scopeExtra: [] },
      },
      pending: { scopeRequests: [], adjustment: null },
      maxIds: { A: 3, AC: 4, T: 4, R: 2 },
      size: { level: "M", score: 7, adjust: 0, reasons: [] },
    },
  };
}
