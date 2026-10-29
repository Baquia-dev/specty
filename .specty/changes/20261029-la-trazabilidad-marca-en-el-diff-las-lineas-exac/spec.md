---
kind: standard
---

# La trazabilidad marca en el diff las líneas exactas del bloque

## Objetivo

«Ver diff» de un bloque de la trazabilidad abre el diff del archivo en su tarea, pero no dice cuáles de sus líneas son las del bloque, y en un archivo largo hay que buscarlas. El diff pasa a marcar exactamente esas líneas y a llevar la vista a la primera.

## Fuera de alcance

- Marcar líneas en la vista «Cambios» de Aceptación.
- Cambiar qué bloques ofrecen «Ver diff».

## Supuestos

- A1: Las líneas del bloque se reconocen en el diff de su tarea por el número que tenían en el commit de esa tarea: `git blame --porcelain` lo da junto al número final, y es el número nuevo de esas líneas en el diff de la tarea, aunque tareas posteriores las hayan movido. El servidor lo pasa en cada bloque (`origin`); un servidor anterior no lo trae, y el diff se abre sin marcas.
  - impacto: alto
- A2: Con líneas marcadas, `sp-diff-file` enseña el archivo entero, sin «Mostrar N líneas más», para que ninguna quede oculta.

## Criterios de aceptación

- AC1: CUANDO la UI pide la trazabilidad de un archivo ENTONCES cada bloque trae los números que sus líneas tenían en el commit de su tarea, aunque una tarea posterior las haya movido.
- AC2: CUANDO `sp-diff-file` recibe líneas que marcar ENTONCES marca esas líneas del lado nuevo, también lado a lado, nunca una quitada, y enseña el archivo entero.
- AC3: CUANDO la persona abre «Ver diff» en un bloque ENTONCES el diff marca exactamente las líneas del bloque y lleva la vista a la primera; en el prototipo también.

## Diseño

- `server/trace.ts`: al leer el blame guarda, por línea, su número en el commit que la escribió; cada bloque lleva `origin`, esos números en orden.
- `components/diff-file.ts`: la entrada `marked` (números del lado nuevo); una fila marcada lleva `data-marked`, una barra a la izquierda en el color de acento y un texto para lectores de pantalla; con marcas, sin vista previa recortada.
- `data/trace.ts`: `origin` opcional en `TraceBlock`; `data/sample-trace.ts` lo da con el número nuevo de cada línea de muestra.
- `trace-view.ts` pasa `origin` a `sp-trace-diff`, que lo da a `sp-diff-file` y, ya pintado, lleva la vista a la primera línea marcada.

## Archivos

- modificar packages/cli/src/server/trace.ts — `origin` en cada bloque
- crear packages/cli/test/server/trace-origin.test.ts — los números del commit de la tarea, con líneas movidas
- modificar packages/ui/src/components/diff-file.ts — marcar líneas
- crear packages/ui/src/components/diff-file-marks.test.ts — las marcas, lado a lado y en un archivo largo
- modificar packages/ui/src/data/trace.ts — `origin` en `TraceBlock`
- modificar packages/ui/src/data/sample-trace.ts — `origin` en la muestra
- modificar packages/ui/src/history/trace-diff.ts — marca las líneas y lleva la vista a la primera
- modificar packages/ui/src/history/trace-view.ts — pasa `origin` al diff del bloque
- crear packages/ui/src/history/trace-marks.test.ts — las líneas del bloque marcadas, y en la muestra
- modificar docs/ui.md — el diff marca las líneas del bloque
- modificar docs/ARCHITECTURE.md — `origin` en `GET /api/changes/<id>/trace`

## Tareas

- [x] T1: Los números de cada bloque en el commit de su tarea
  - files: packages/cli/src/server/trace.ts, packages/cli/test/server/trace-origin.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/trace-origin.test.ts test/server/trace.test.ts && pnpm lint
- [x] T2: `sp-diff-file` marca líneas
  - files: packages/ui/src/components/diff-file.ts, packages/ui/src/components/diff-file-marks.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/diff-file-marks.test.ts --include src/components/diff-file.test.ts && pnpm lint
- [x] T3: «Ver diff» marca las líneas del bloque
  - files: packages/ui/src/data/trace.ts, packages/ui/src/data/sample-trace.ts, packages/ui/src/history/trace-diff.ts, packages/ui/src/history/trace-view.ts, packages/ui/src/history/trace-marks.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history --include src/data/sample-trace.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
- [ ] T4: Documentar las marcas
  - files: docs/ui.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
