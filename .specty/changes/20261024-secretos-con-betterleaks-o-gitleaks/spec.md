---
kind: standard
follows:
  - 20261024-verificaciones-transversales-tests-enfocados-tod
---

# Secretos con Betterleaks o gitleaks

## Objetivo

`specty check` busca secretos en lo que mira (por defecto, en las líneas que el cambio añade) con Betterleaks, o con gitleaks si no lo hay, desde un solo adaptador. Si no hay ninguno instalado, la verificación `secrets` no corre y explica cómo instalarlo, sin hacer fallar el resto.

## Fuera de alcance

- Instalar Betterleaks o gitleaks, o añadirlos como dependencia del proyecto: eso es de la instalación con diff y confirmación (corte 6).
- Buscar secretos en el historial de git (`betterleaks git`, `gitleaks git`): `specty check` mira archivos, como el resto de verificaciones.
- Validar si un secreto sigue activo (`--validate` de Betterleaks).
- Los pendientes heredados que no son de secretos (comentario HTML en las specs, el tope de 512 KB de `execute`, `isTestFile`, las épicas, `init.ts`): siguen como pendientes.

## Supuestos

- A1: Betterleaks 2 se invoca como `betterleaks --no-banner fs . --redact --output <informe> --exit-code 0` y escribe un objeto `{ schema_version, findings, scan }` cuyos hallazgos traen `rule_id` y `location.path` y `location.start_line`, según su guía de migración a v2.
  - impacto: alto
- A2: gitleaks 8, y Betterleaks 1, que aún llega por algunos gestores de paquetes, se invocan como `<binario> dir . --report-format json --report-path <informe> --redact --no-banner --exit-code 0` y escriben una lista de `{ File, StartLine, RuleID }`; un Betterleaks que rechaza `fs` es la versión 1.
  - impacto: alto
- A3: Analizar una copia temporal de los archivos de la ejecución, tal como los ve el modo, da lo mismo que analizar el repositorio, siempre que la copia lleve `.gitleaks.toml`, `.gitleaksignore` y `.betterleaksignore` de la raíz (gitleaks los busca en la carpeta analizada y en la actual; Betterleaks, su archivo de ignorados en la analizada) y que Betterleaks reciba `.betterleaks.toml` con `--config`, porque no lo carga solo; si el entorno ya define `BETTERLEAKS_CONFIG` o `BETTERLEAKS_CONFIG_TOML`, manda el entorno.
- A4: Un binario que no se puede lanzar (el código 127 de `execute`) no está instalado; cualquier otro código distinto de 0 es un error del escáner, que deja la verificación sin correr con su último mensaje como motivo.
- A5: Como las de marcas, con `--changed` y `--staged` `secrets` solo muestra los hallazgos de líneas añadidas: un secreto que ya estaba en la rama destino sale con `--all`.

## Criterios de aceptación

- AC1: CUANDO Betterleaks 2 está en el PATH y una línea añadida tiene un secreto ENTONCES `specty check` sale con 1 y muestra `FALLA secrets` con `ruta:línea posible secreto: <regla>`; un secreto que ya estaba no se muestra con `--changed` y sí con `--all`.
- AC2: CUANDO solo está gitleaks, o un Betterleaks que no conoce `fs`, ENTONCES `secrets` usa la forma de gitleaks, lee su informe en forma de lista y da el mismo resultado.
- AC3: CUANDO no hay ni Betterleaks ni gitleaks ENTONCES `secrets` no corre: el resumen dice `SIN EJECUTAR: secrets`, `--verbose` explica que se instale Betterleaks (o gitleaks), y `specty check` no falla por ello.
- AC4: CUANDO el escáner sale con un código de error ENTONCES `secrets` no corre y `--verbose` muestra el último mensaje del escáner.
- AC5: CUANDO la raíz tiene `.gitleaks.toml`, `.gitleaksignore` o `.betterleaksignore` ENTONCES el escáner los encuentra en la carpeta que analiza; CUANDO tiene `.betterleaks.toml` ENTONCES Betterleaks lo recibe con `--config`.
- AC6: CUANDO se ejecuta con `--staged` ENTONCES analiza lo preparado y no lo que hay en el disco; el escáner siempre recibe `--redact`, su informe queda fuera de la carpeta analizada y la copia temporal desaparece al terminar.
- AC7: CUANDO el idioma es inglés ENTONCES el hallazgo y el motivo para no correr están en inglés.

## Diseño

- `check/secrets.ts` define la verificación `secrets`: crea una carpeta temporal con `files/` (la copia, con los archivos del escáner de la raíz primero) y `report.json` al lado, lanza el escáner con la carpeta `files/` como directorio de trabajo y objetivo `.`, lee el informe en cualquiera de las dos formas y devuelve las rutas al repositorio.
- El orden de intento es Betterleaks 2, luego la forma de gitleaks con el mismo Betterleaks si rechazó la primera, y por último gitleaks. Si las dos formas de Betterleaks fallan, el motivo es el error de la primera.
- Un hallazgo cuenta si su ruta es un archivo de la ejecución (no los archivos del escáner copiados) y su línea es añadida. El escáner corre con el entorno de la sesión y el tiempo límite de `verify.timeoutSec`.
- `check/common.ts` añade `secrets` al proveedor común. Los tests de `check.test.ts` y `check-markers.test.ts` lo ponen en `off` para no depender de lo instalado en la máquina; `check-secrets.test.ts` usa escáneres falsos en un PATH que solo tiene además `git`.

## Archivos

- crear packages/cli/src/check/secrets.ts — el adaptador de Betterleaks y gitleaks
- modificar packages/cli/src/check/common.ts — añadir `secrets` al proveedor común
- crear packages/cli/test/check-secrets.test.ts — los escáneres falsos y cada criterio
- modificar packages/cli/test/check.test.ts — `secrets: off` para no depender de la máquina
- modificar packages/cli/test/check-markers.test.ts — `secrets: off` para no depender de la máquina
- modificar docs/formats.md — la verificación `secrets` y los archivos del escáner que usa
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [x] T1: La verificación `secrets` con Betterleaks o gitleaks
  - files: packages/cli/src/check/secrets.ts, packages/cli/src/check/common.ts, packages/cli/test/check-secrets.test.ts, packages/cli/test/check.test.ts, packages/cli/test/check-markers.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-secrets.test.ts test/check.test.ts test/check-markers.test.ts
- [x] T2: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC3, AC5
  - verify: pnpm check

## Riesgos

- R1: Una versión de Betterleaks cambia sus opciones o la forma del informe — el adaptador lee las dos formas conocidas, un informe que no entiende deja la verificación sin correr con ese motivo, nunca en verde, y el test fija las invocaciones.
- R2: Copiar un repositorio grande con `--all` tarda — solo se copian los archivos de la ejecución, sin dependencias ni generados, y la copia se borra siempre.
