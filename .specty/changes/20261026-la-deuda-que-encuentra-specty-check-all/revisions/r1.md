---
kind: standard
follows:
  - 20261026-un-ajuste-de-un-quick-puede-anadir-tareas
---

# Las supresiones que encuentra specty check --all

## Objetivo

`specty check --all` falla en `suppressions` sobre el propio repositorio de Specty por tres `biome-ignore` que ya existían. Sobran: el carácter de escape del color ANSI puede construirse por su código, y los `${…}` que pertenecen a Dart o a un texto de ejemplo pueden escaparse en una plantilla. Así la herramienta cumple la regla que implementa.

## Fuera de alcance

- Las funciones que pasan de los límites de líneas o de complejidad: son unas 80 en los cuatro paquetes y van en una épica aparte.
- Cambiar la regla de Biome o el catálogo de supresiones.

## Supuestos

- A1: Construir el escape ANSI con `String.fromCharCode(0x1b)` deja la misma expresión que el literal `\u001b`, y Biome no la marca porque no hay un carácter de control escrito en ella.
  - impacto: alto
- A2: Una plantilla con `\${` produce el mismo texto que la cadena con `${`, así que el cambio de ejemplo de la UI y sus tests no cambian.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --all` en el repositorio ENTONCES `suppressions` pasa.
- AC2: CUANDO la salida de una herramienta trae colores ANSI ENTONCES sus hallazgos se leen igual que antes.
- AC3: CUANDO la UI muestra el cambio de ejemplo ENTONCES sus diffs de Dart traen los mismos `${…}` que antes.

## Archivos

- modificar packages/core/src/checks/output.ts — el escape ANSI por su código
- modificar packages/ui/src/data/sample-diffs.ts — los `${…}` de Dart, escapados en plantillas
- modificar packages/cli/test/commands-named.test.ts — el marcador del texto, escapado en una plantilla

## Tareas

- [ ] T1: El color ANSI sin supresión
  - files: packages/core/src/checks/output.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/output.test.ts
  - type: refactor
- [ ] T2: Los `${…}` escapados sin supresión
  - files: packages/ui/src/data/sample-diffs.ts, packages/cli/test/commands-named.test.ts
  - ac: AC1, AC3
  - verify: pnpm check
  - type: refactor
