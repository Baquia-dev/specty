---
kind: standard
---

# Patrón de rama propio con git.branchPattern

## Objetivo

Los flujos de `git.flow` cubren los nombres más comunes, pero hay equipos con convenciones propias (`users/ana/{slug}`, `JIRA-{slug}`, `{type}-{slug}`). Con este cambio, `config.yaml` acepta `git.branchPattern`, un patrón con `{type}`, `{slug}` e `{id}` que, si existe, nombra las ramas de los cambios por encima de `git.flow`; un patrón que no da ramas válidas y distintas no se acepta.

## Fuera de alcance

- Que `init` pregunte o detecte un patrón: va con el flujo en el cambio siguiente.
- Más marcadores que `{type}`, `{slug}` e `{id}` (usuario, fecha, número de incidencia).
- Renombrar las ramas de los cambios ya creados.

## Supuestos

- A1: El patrón gana a `git.flow`, y en él `{type}` es el tipo de commit tal cual (`fix`, no `bugfix`); el de un spike es `spike`.
  - impacto: medio
- A2: Un patrón tiene que llevar `{slug}` o `{id}`, porque sin ellos todos los cambios pedirían la misma rama y solo los distinguiría el `-2`.
- A3: Los mensajes de la configuración no válida siguen en inglés, como los demás de `config.yaml`; la tarjeta que los muestra ya es bilingüe.

## Criterios de aceptación

- AC1: CUANDO `git.branchPattern` es `team/{type}-{slug}` y el agente ejecuta `specty new "Login con Google" --type fix` ENTONCES la rama es `team/fix-login-con-google`, sea cual sea `git.flow`; con `{id}`, el id con fecha, y en un spike, `{type}` es `spike`.
- AC2: CUANDO `git.branchPattern` no lleva `{slug}` ni `{id}`, lleva otro marcador o no forma un nombre de rama que git admita (espacios, `..`, `~^:?*[\`, `//`, `@{`, `/` al principio o al final, un componente que empieza por `.` o termina en `.lock`) ENTONCES ningún comando se ejecuta y la salida dice `git.branchPattern:` con el motivo.
- AC3: CUANDO el patrón lleva `{type}` ENTONCES el SIGUIENTE de `next` sin cambio activo pide `--type`; si no lo lleva, no, aunque `git.flow` nombre por tipo.
- AC4: CUANDO se leen `docs/formats.md` §6 y ARCHITECTURE §9 ENTONCES describen `git.branchPattern`, sus marcadores, qué patrones se rechazan y que gana a `git.flow`.

## Diseño

- Core, `branches.ts`:
  - `branchName` acepta `pattern` (opcional): si está, sustituye `{type}`, `{slug}` e `{id}` en vez de usar el flujo.
  - `branchPatternIssue(pattern)`: el motivo por el que un patrón no vale, o nada; comprueba los marcadores y, con valores de ejemplo, las reglas de nombres de git (las de `git check-ref-format`).
  - `branchUsesType({ flow, branchPattern })`: con patrón, si lleva `{type}`; sin él, si el flujo no es `specty`.
- Core, `schema/config.ts`: `git.branchPattern` (texto, validado con `branchPatternIssue`).
- CLI, `commands/new.ts` pasa el patrón a `branchName`; `session.ts` calcula `branchTypes` con `branchUsesType`.

## Archivos

- modificar packages/core/src/branches.ts — patrón, su validación y `branchUsesType`
- modificar packages/core/src/index.ts — exportar lo nuevo
- modificar packages/core/test/branches.test.ts — nombres con patrón y patrones inválidos
- modificar packages/core/src/schema/config.ts — `git.branchPattern`
- modificar packages/core/test/schema/schema.test.ts — la clave nueva
- modificar packages/cli/src/commands/new.ts — la rama con el patrón
- modificar packages/cli/src/session.ts — `branchTypes` con el patrón
- modificar packages/cli/test/branch-names.test.ts — `new` y `next` con patrón, y el patrón inválido
- modificar docs/formats.md — §6
- modificar docs/ARCHITECTURE.md — §9

## Tareas

- [x] T1: el patrón nombra la rama y se valida
  - files: packages/core/src/branches.ts, packages/core/src/index.ts, packages/core/test/branches.test.ts, packages/core/src/schema/config.ts, packages/core/test/schema/schema.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/branches.test.ts test/schema/schema.test.ts
- [ ] T2: new y next usan el patrón
  - files: packages/cli/src/commands/new.ts, packages/cli/src/session.ts, packages/cli/test/branch-names.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/branch-names.test.ts
- [ ] T3: formats y ARCHITECTURE describen el patrón
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - type: docs

## Riesgos

- R1: Las reglas de git para nombres de rama son más que las que comprueba Specty. Mitigación: se cubren las de `git check-ref-format` que un patrón puede romper; si aun así git rechaza la rama, `new` falla con su mensaje.
