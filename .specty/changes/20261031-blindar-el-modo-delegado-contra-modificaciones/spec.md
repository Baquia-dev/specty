---
kind: standard
---

# Blindar el modo delegado contra modificaciones directas del agente

## Objetivo

Evitar que un agente de IA pueda auto-otorgarse el modo delegado o modificar el almacenamiento interno de Specty en `.git/common/specty/delegated.json`. Se bloquean antes de su ejecución los comandos que intenten manipular este archivo, se detectan y revierten alteraciones tras comandos de shell en `afterShell`, se fijan permisos de solo lectura en el archivo en disco, y se explicita la regla de no elusión en `AGENTS.md`.

## Fuera de alcance

- Cambiar el mecanismo de almacenamiento o formato de `delegated.json`.
- Restringir la lectura de `delegated.json` por parte de los comandos oficiales de Specty.

## Supuestos

- A1: Ningún comando legítimo de build, test o desarrollo de un proyecto necesita escribir en `.git/common/specty/` ni referenciar `delegated.json`.
- A2: En entornos Unix/POSIX y Windows, asignar permisos `0o444` a `delegated.json` impide la sobreescritura directa por parte de scripts estándar (`fs.writeFileSync`).

## Criterios de aceptación

- AC1: CUANDO un agente intenta ejecutar un comando de shell no perteneciente a Specty que referencia `common/specty/delegated.json` o `.git/common/specty` ENTONCES `analyzeShell` lo marca como `bypass: true` y el guard lo deniega antes de su ejecución.
- AC2: CUANDO un comando de shell del agente altera (crea, modifica o borra) `.git/common/specty/delegated.json` ENTONCES `treeSnapshot` y `afterShell` detectan el cambio como violación de archivo protegido, revierten inmediatamente la alteración en disco y deniegan la acción con la regla `protected`.
- AC3: CUANDO se activa el modo delegado con `specty delegate on` ENTONCES `delegated.json` se crea con permisos de solo lectura (`0o444`), y `specty delegate off` lo restaura y elimina limpiamente.
- AC4: CUANDO se genera el bloque de flujo (`flowBlock`) de `AGENTS.md` ENTONCES incluye la regla explícita de no eludir permisos ni alterar `.git/`, manteniéndose dentro del límite estricto de 15 líneas.

## Archivos

- modificar packages/core/src/guard/shell.ts — detectar referencias de elusión a delegated.json y .git/common/specty en analyzeShell
- modificar packages/core/test/guard/shell.test.ts — tests de detección de bypass para delegated.json y almacenamiento interno de Specty
- modificar packages/cli/src/enforce/shell-snapshot.ts — incluir huella de delegated.json en treeSnapshot
- modificar packages/cli/src/enforce/guard.ts — revertir alteraciones no autorizadas a delegated.json en afterShell
- modificar packages/cli/src/store/local.ts — permisos 0o444 al escribir delegated.json y chmod previo al limpiar
- modificar packages/cli/test/delegate.test.ts — tests de guard y permisos ante intentos de sobreescritura de delegated.json
- modificar packages/core/src/agents-md.ts — regla explícita en flowLines contra alteración de .git y elusión de permisos
- modificar packages/core/test/agents-md.test.ts — verificar límite de 15 líneas y presencia de la regla en flowBlock
- modificar docs/ARCHITECTURE.md — documentar el blindaje del modo delegado en el guard

## Tareas

- [x] T1: Detección estática de bypass en analyzeShell para delegated.json y almacenamiento de Specty
  - files: packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts
- [ ] T2: Monitoreo en treeSnapshot y reversión de alteraciones en afterShell
  - files: packages/cli/src/enforce/shell-snapshot.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/delegate.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/delegate.test.ts
- [ ] T3: Permisos de solo lectura en delegated.json, regla en flowBlock y documentación
  - files: packages/cli/src/store/local.ts, packages/core/src/agents-md.ts, packages/core/test/agents-md.test.ts, docs/ARCHITECTURE.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/delegate.test.ts
