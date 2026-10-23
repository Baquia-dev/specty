---
kind: standard
---

# Avisos de doctor y commits delegados

## Objetivo

`specty doctor` avisa de dos cosas más. Primero, cuando Biome o Prettier revisarían también los archivos de hooks que escribe `specty init` (`.claude/settings.json`, `.cursor/hooks.json`), como ya hace con `.specty/`: Specty los escribe con su propio formato, y un formateador que los revise deja la rama principal en rojo, como pasó hoy. Segundo, cuando el modo delegado está activo. Además, los commits de las decisiones que el agente toma en modo delegado llevan el trailer `Specty-Delegated: true`, para que `git log` también lo muestre, y no solo la auditoría.

## Fuera de alcance

- Que `init` escriba el JSON con el formato de cada formateador: se pide excluir esos archivos, igual que `.specty/`.
- Mostrar el canal delegado en la UI.

## Supuestos

- A1: El aviso del formateador solo mira los archivos de hooks que existen en el repo, y vale excluir el archivo o su carpeta (`!.claude/settings.json` o `!.claude` en Biome; `.claude/settings.json`, `.claude/` o `.claude` en `.prettierignore`).
- A2: El modo delegado activo no es un problema de `doctor`: va en un bloque «AVISOS», y `doctor` sigue en verde.
- A3: Llevan `Specty-Delegated: true` los commits que hace un comando de la persona cuando lo ejecuta el agente en modo delegado: la aprobación de la spec, el merge de la incorporación y el archivo al cerrar, al cancelar o al aceptar un quick. Los commits de las tareas no lo llevan, porque son trabajo del agente y no decisiones.

## Criterios de aceptación

- AC1: CUANDO Biome o Prettier revisarían `.claude/settings.json` o `.cursor/hooks.json`, y el archivo existe ENTONCES `doctor` lo marca como problema y dice qué añadir y dónde; excluido el archivo o su carpeta, lo da por bueno.
- AC2: CUANDO el modo delegado está activo ENTONCES `doctor` lo dice en un bloque «AVISOS», con quién lo activó y cómo desactivarlo, sin contarlo como problema.
- AC3: CUANDO el agente aprueba, cierra, cancela o acepta un quick en modo delegado ENTONCES esos commits llevan `Specty-Delegated: true`, y los de las tareas no; sin el modo delegado, ningún commit lo lleva.

## Diseño

- `detect/formatters.ts`: `formatterExclusions(root)` devuelve también, por cada formateador, una entrada por archivo de hooks que exista, con la ruta revisada y lo que hay que añadir.
- `commands/doctor.ts`: el texto de cada entrada nombra la ruta, y hay un bloque «AVISOS» para el modo delegado.
- `flow/commits.ts`: `decisionTrailers(session, id, extra)` añade `Specty-Delegated: true` a `changeTrailers` cuando el agente decide en modo delegado. Lo usan `commands/approve.ts`, `flow/finish.ts` (`commitArchive`) y `flow/integrate.ts` (el merge).

## Archivos

- modificar packages/cli/src/detect/formatters.ts — también los archivos de hooks que escribe `init`
- modificar packages/cli/src/commands/doctor.ts — avisos por archivo y modo delegado activo
- modificar packages/cli/src/flow/commits.ts — trailers de las decisiones
- modificar packages/cli/src/commands/approve.ts — trailer en la aprobación
- modificar packages/cli/src/flow/finish.ts — trailer en el archivo
- modificar packages/cli/src/flow/integrate.ts — trailer en el merge de la incorporación
- modificar packages/cli/test/install.test.ts — `doctor` con los archivos de hooks y el modo delegado
- modificar packages/cli/test/delegate.test.ts — los commits delegados llevan el trailer
- modificar docs/formats.md — §7: el trailer `Specty-Delegated`

## Tareas

- [ ] T1: `doctor` avisa de los archivos de hooks y del modo delegado
  - files: packages/cli/src/detect/formatters.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/install.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/install.test.ts
- [ ] T2: Los commits de las decisiones delegadas llevan su trailer
  - files: packages/cli/src/flow/commits.ts, packages/cli/src/commands/approve.ts, packages/cli/src/flow/finish.ts, packages/cli/src/flow/integrate.ts, packages/cli/test/delegate.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/delegate.test.ts test/flow.test.ts test/integrate.test.ts
- [ ] T3: Documentar el trailer
  - files: docs/formats.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: El aviso del formateador da un falso positivo con una configuración que excluye esos archivos de otra forma — dice exactamente qué línea buscar y dónde, y es solo un aviso de `doctor`.
