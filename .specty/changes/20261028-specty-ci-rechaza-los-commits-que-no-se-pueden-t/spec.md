---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C2
---

# `specty ci` rechaza los commits que no se pueden trazar

## Objetivo

La capa 4 de cumplimiento (ARCHITECTURE §10) es la única que el agente no puede saltarse, y aún no existe. `specty ci` revisa los commits de un pull request o de un push y falla si alguno trae código gobernado sin `Specty-Change`, si nombra un cambio que no existe, si un commit de tarea no tenía su spec aprobada o si un spike va hacia la rama destino. Usa el mismo informe y el mismo JSON que `specty check`, así que la CI lo lee igual.

## Fuera de alcance

- La GitHub Action y la plantilla de `check --install` (corte C3).
- Comprobar los recibos, que viven en `.git` de cada clon (supuesto A3 de la épica).
- Comprobar que los archivos de un commit manual o de tarea estaban en el alcance de su tarea.
- Comentarios en el pull request.

## Supuestos

- A1: El rango es `<base>..HEAD` sin los commits de merge: `--base` es la rama de destino del pull request o el commit anterior a un push, y sin `--base` es la rama destino, como en `check --changed`; si tampoco existe, el rango queda vacío y todo pasa.
  - impacto: alto
- A2: Un commit cuenta como trazable si lleva `Specty-Change` o `Specty-Init: true`. Un commit que solo toca `.specty/` o rutas no gobernadas no se juzga.
- A3: El cambio que nombra un commit existe si en ese commit, o en `HEAD`, está su carpeta en `.specty/changes/<id>/` o en `.specty/archive/<año>/<id>/`.
- A4: Un commit de tarea (`Specty-Task`) tiene su spec aprobada si, en ese mismo commit, el `state.json` del cambio tiene `approved`, la forma canónica de su `spec.md` da ese hash y el `Specty-Spec` del commit nombra ese hash.
  - impacto: alto
- A5: La rama de destino es `--into` o, sin él, la rama que nombra `--base` (sin el remoto). Los spikes se rechazan cuando va a la rama destino del repositorio (`git.target` o la principal) o cuando no se puede saber, porque es lo más seguro. Un spike es un commit con `Specty-Kind: spike` o un pull request desde una rama `spike/…` (`--head-ref`).
  - impacto: alto
- A6: Las tres verificaciones se llaman `traced`, `task-approval` y `no-spike`, y respetan `checks.levels` como las de `specty check`.

## Criterios de aceptación

- AC1: CUANDO el rango tiene un commit que no es de merge, toca rutas gobernadas y no lleva `Specty-Change` ni `Specty-Init: true` ENTONCES `specty ci` sale con 1, y `traced` falla y nombra el commit, su asunto y sus archivos gobernados.
- AC2: CUANDO un commit del rango que toca código gobernado nombra un cambio que no existe, o un commit de tarea no tenía en su commit una spec aprobada con el hash de su `Specty-Spec` ENTONCES `specty ci` sale con 1, y `task-approval` falla y lo nombra.
- AC3: CUANDO el rango tiene un commit con `Specty-Kind: spike`, o `--head-ref` es una rama `spike/…`, y el destino es la rama destino del repositorio ENTONCES `specty ci` sale con 1, y `no-spike` falla y lo nombra; con `--into` hacia otra rama, `no-spike` pasa.
- AC4: CUANDO todos los commits del rango los hizo Specty en el flujo de un cambio aprobado ENTONCES `specty ci` sale con 0 y termina en la línea de resumen de `specty check`; con `--json`, da el informe con la estructura de `specty check --json`.

## Diseño

- `core/src/cards/ci.ts`: `ciReport(facts, levels, lang)` es puro y escribe los textos. Recibe los hechos de cada commit: asunto, archivos gobernados, trailers, si su cambio existe y la aprobación de su spec; también el destino y la rama del pull request. Da un `CheckReport` con `traced`, `task-approval` y `no-spike`, que la CLI muestra con `renderReport` y `reportJson`.
- `cli/src/flow/ci-commits.ts` reúne esos hechos con git:
  - `git log --no-merges --no-renames --name-only` del rango, con los trailers;
  - `git cat-file` y `git show` en cada commit, para el cambio y su aprobación;
  - `specHash` de core.
- `cli/src/commands/ci.ts` registra `specty ci [--base <ref>] [--into <rama>] [--head-ref <rama>] [--verbose]` y devuelve un `ReportOutput`, como `specty check`. Solo lee, así que también lo ejecuta el agente.

## Archivos

- crear packages/core/src/cards/ci.ts — el informe de `specty ci` a partir de los hechos de cada commit
- modificar packages/core/src/cards/index.ts — exportar el informe y sus tipos
- crear packages/core/test/cards/ci.test.ts — el informe con hechos dados
- crear packages/cli/src/flow/ci-commits.ts — los commits del rango y lo que git dice de cada uno
- crear packages/cli/src/commands/ci.ts — el comando
- modificar packages/cli/src/program.ts — registrar `ci`
- crear packages/cli/test/ci.test.ts — `specty ci` en repositorios con commits reales
- modificar docs/ARCHITECTURE.md — §6 y §10: `specty ci` implementado
- modificar docs/checks.md — la sección de `specty ci`
- modificar docs/checks.en.md — la sección de `specty ci`

## Tareas

- [x] T1: El informe de `specty ci`
  - files: packages/core/src/cards/ci.ts, packages/core/src/cards/index.ts, packages/core/test/cards/ci.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/ci.test.ts
- [x] T2: El comando y los hechos de cada commit
  - files: packages/cli/src/flow/ci-commits.ts, packages/cli/src/commands/ci.ts, packages/cli/src/program.ts, packages/cli/test/ci.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/ci.test.ts
- [ ] T3: Documentar `specty ci`
  - files: docs/ARCHITECTURE.md, docs/checks.md, docs/checks.en.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: En un repositorio grande, leer el estado y la spec de cada commit de tarea con `git show` puede tardar. Mitigación: solo se leen los commits de tarea del rango, una vez por commit, y el rango es el del evento.
- R2: Un historial que adopta Specty con trabajo a medias trae commits sin trailers en su primer pull request. Mitigación: la línea de `traced` dice cómo documentarlo (`specty retro`), y la verificación se puede bajar a aviso con `checks.levels`.
