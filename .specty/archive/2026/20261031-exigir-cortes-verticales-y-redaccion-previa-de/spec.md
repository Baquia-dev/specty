---
kind: standard
---

# Exigir cortes verticales y redacción previa de specs en épicas

## Objetivo

Hacer cumplir que toda épica (`kind: epic`), tanto en proyectos nuevos como existentes, defina sus funcionalidades mediante cortes verticales verificables de punta a punta (con criterios observables y sin capas técnicas horizontales aisladas), y guiar al agente para priorizar la redacción y propuesta de las specs de todos los cortes listos antes de codificar, habilitando el trabajo concurrente de agentes en worktrees independientes.

## Fuera de alcance

- Automatizar el despacho o arranque de procesos de agentes independientes (la asignación de sesiones en worktrees sigue a cargo de la persona o del orquestador).
- Alterar la estructura de carpetas de worktrees o los cerrojos de sesiones en git.

## Supuestos

- A1: En la validación de referencias (`references.ts`), cada corte de una épica debe declarar al menos un criterio de aceptación en `ac`; un corte sin criterios (`ac: []` o ausente) se rechaza con el diagnóstico `slice-without-criteria`.
- A2: En la validación de calidad (`quality.ts`), se detectan y rechazan cortes de épica con títulos de capas técnicas horizontales puras (como base de datos, backend, frontend, endpoints o modelos aislados) mediante el diagnóstico `slice-horizontal`.
- A3: En `ruleLines` (`agents-md.ts`), se incluye la regla que prohíbe cortes horizontales y exige la redacción anticipada de specs de cortes para habilitar agentes concurrentes.
- A4: En `epicCard` (`epic.ts`), cuando hay cortes listos (`ready`), la tarjeta instruye a redactar y proponer las specs de los cortes listos para habilitar el trabajo concurrente en worktrees.
- A5: `docs/ARCHITECTURE.md` (§11, §14 y carril `epic`) y `docs/dominio.md` documentan formalmente la obligatoriedad de cortes verticales verificables y la estrategia de redacción previa de specs para agentes en paralelo.

## Criterios de aceptación

- AC1: CUANDO se valida la spec de una épica y un corte no declara ningún criterio de aceptación en `ac` ENTONCES `validateSpec` / `specty check` emite el error `slice-without-criteria` en español e inglés.
- AC2: CUANDO se valida la spec de una épica y el título de un corte corresponde a una capa técnica horizontal pura ENTONCES `validateSpec` / `specty check` emite el diagnóstico `slice-horizontal` en español e inglés exigiendo un corte vertical verificable.
- AC3: CUANDO una épica aprobada tiene cortes listos para empezar ENTONCES la tarjeta `epicCard` (`specty next`) informa que se pueden redactar las specs de los cortes listos para trabajar en paralelo.
- AC4: CUANDO se genera el bloque de reglas de `AGENTS.md` (`flowBlock`) ENTONCES incluye la regla que prohíbe cortes horizontales y prioriza redactar las specs de los cortes para habilitar agentes concurrentes.
- AC5: CUANDO se consultan `docs/ARCHITECTURE.md` y `docs/dominio.md` ENTONCES describen la obligatoriedad de cortes verticales verificables en toda épica y el flujo de redacción anticipada para agentes concurrentes.

## Diseño

- **Diagnósticos y validación semántica (`packages/core/src/spec/diagnostics.ts`, `packages/core/src/spec/messages.es.ts`, `packages/core/src/spec/messages.en.ts`, `packages/core/src/validate/references.ts`, `packages/core/src/validate/quality.ts`)**:
  - Incorporar los códigos `slice-without-criteria` y `slice-horizontal` al tipo `DiagnosticCode`.
  - Definir las traducciones en `messages.es.ts` y `messages.en.ts`.
  - En `checkSlices` (`references.ts`), verificar que cada corte tenga `slice.ac.length > 0`, reportando `slice-without-criteria` si está vacío o ausente.
  - En `quality.ts`, añadir `checkVerticalSlices` para inspeccionar si el título de un corte coincide con patrones de capas técnicas puras (`/^(?:solo\s+)?(?:base\s+de\s+datos|bd|database|migraciones|migrations|backend|frontend|modelos|models|endpoints|api)\b/i`), reportando `slice-horizontal`.
- **Reglas del agente y orquestación (`packages/core/src/agents-md.ts`, `packages/core/src/cards/epic.ts`)**:
  - En `ruleLines` (`agents-md.ts`), incorporar la regla inmutable que exige cortes verticales verificables y la redacción anticipada de specs de cortes para agentes en paralelo.
  - En `epicCard` (`cards/epic.ts`), al listar cortes listos (`ready`), enriquecer el mensaje de `next` para orientar a preparar y redactar las specs de todos los cortes listos antes de codificar, habilitando el trabajo concurrente en sus carpetas.
- **Documentación de arquitectura y dominio (`docs/ARCHITECTURE.md`, `docs/dominio.md`)**:
  - En `docs/ARCHITECTURE.md`:
    - En el carril `epic`, detallar que los cortes deben ser verticales verificables de punta a punta.
    - En §11 ("Tamaño y división"), explicar la regla contra capas horizontales y la redacción previa de specs para agentes en paralelo.
    - En §14 ("Proyecto nuevo"), incorporar el paso de descomposición del MVP en épica con cortes verticales y preparación de specs.
  - En `docs/dominio.md`:
    - Actualizar los términos Épica y Corte resaltando la verticalidad funcional y la verificabilidad autónoma.

## Archivos

- modificar packages/core/src/spec/diagnostics.ts — añadir códigos de diagnóstico slice-without-criteria y slice-horizontal
- modificar packages/core/src/spec/messages.es.ts — textos en español para slice-without-criteria y slice-horizontal
- modificar packages/core/src/spec/messages.en.ts — textos en inglés para slice-without-criteria y slice-horizontal
- modificar packages/core/test/spec/messages.test.ts — pruebas de mensajes de diagnóstico para cortes
- modificar packages/core/src/validate/references.ts — exigir que cada corte de épica declare al menos un criterio de aceptación
- modificar packages/core/src/validate/quality.ts — detectar y rechazar cortes horizontales en épicas
- modificar packages/core/test/validate/references.test.ts — pruebas de corte sin criterios de aceptación
- modificar packages/core/test/validate/quality.test.ts — pruebas de detección de cortes horizontales en épicas
- modificar packages/core/src/agents-md.ts — regla de cortes verticales y redacción previa de specs en AGENTS.md
- modificar packages/core/test/agents-md.test.ts — prueba de regla de épicas en AGENTS.md
- modificar packages/core/src/cards/epic.ts — orientar a redactar specs de cortes listos para trabajo en paralelo
- modificar packages/core/test/cards/epic.test.ts — prueba de tarjeta de épica con recomendación de redacción de cortes listos
- modificar docs/ARCHITECTURE.md — documentar cortes verticales obligatorios y redacción previa de specs
- modificar docs/dominio.md — actualizar definiciones de épica y corte

## Tareas

- [x] T1: Diagnósticos y mensajes para cortes de épica
  - files: packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/spec/messages.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec/messages.test.ts
- [x] T2: Validación semántica de criterios y detección de cortes horizontales
  - files: packages/core/src/validate/references.ts, packages/core/src/validate/quality.ts, packages/core/test/validate/references.test.ts, packages/core/test/validate/quality.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/references.test.ts test/validate/quality.test.ts
- [x] T3: Reglas para agentes y orientación en tarjetas para trabajo concurrente
  - files: packages/core/src/agents-md.ts, packages/core/test/agents-md.test.ts, packages/core/src/cards/epic.ts, packages/core/test/cards/epic.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts test/cards/epic.test.ts
- [x] T4: Documentación de cortes verticales y redacción anticipada en arquitectura y dominio
  - files: docs/ARCHITECTURE.md, docs/dominio.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: docs

## Cierre

### Resumen

Se estableció en Specty la obligatoriedad universal de que toda épica (`kind: epic`) defina sus funcionalidades mediante cortes verticales verificables de punta a punta, prohibiendo capas técnicas horizontales puras (como base de datos o endpoints aislados) y exigiendo que cada corte declare al menos un criterio de aceptación en `ac` (`slice-without-criteria` y `slice-horizontal`). Además, se integró en `AGENTS.md` y en las tarjetas de `specty next` (`epicCard`) la orientación explícita para redactar y proponer las specs de todos los cortes listos antes de codificar, habilitando el trabajo concurrente de múltiples agentes en worktrees independientes, y se documentó en `docs/ARCHITECTURE.md` (§11, §14 y carril `epic`) y `docs/dominio.md`.

### Desviaciones

- Ninguna respecto al alcance acordado.

### Decisiones

- La detección de capas horizontales en épicas se implementó como regla semántica en `quality.ts` dentro de `checkSplit`, verificando los títulos de cortes contra patrones técnicos típicos de capas aisladas.
- La orientación hacia el trabajo paralelo en `AGENTS.md` se ubicó de manera concisa en la regla de flujo que describe el trabajo en worktrees para preservar el límite estricto de 15 líneas del bloque de flujo.

### Pendientes

- Ninguno.
