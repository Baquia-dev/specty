---
kind: standard
---

# Blindar AGENTS.md y anidar especificaciones dedicadas con épica al inicio

## Objetivo

Blindar `AGENTS.md` para mantenerlo conciso y ligero (< 80 líneas), evitando que los agentes vuelquen especificaciones masivas de producto o arquitectura en él, y guiar el flujo de inicio de proyectos nuevos para que las especificaciones detalladas se almacenen en archivos dedicados (`PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/`) y a partir de ellas se trace el esqueleto y la épica del MVP con cortes verticales verificables.

## Fuera de alcance

- Modificar el parser de markdown o crear analizadores de texto libre para clasificar automáticamente documentos del usuario.
- Modificar dependencias externas del monorepo.

## Supuestos

- A1: En `humanSections` de `agents-md.ts`, los comentarios de pista de `## Mapa` y `## Convenciones` instruyen explícitamente a mantener `AGENTS.md` conciso (< 80 líneas), prohibiendo volcar especificaciones de producto, arquitectura o fases en él y guiando a enlazarlas a `PRODUCT.md` y `docs/`.
- A2: En `ruleLines` de `agents-md.ts`, se añade la directiva para mantener `AGENTS.md` mínimo derivando especificaciones a `docs/` y el plan de implementación a épicas.
- A3: En `doctorWarnings` (`commands/doctor.ts`) y `doctorCard` (`cards/doctor.ts`), se emite un aviso preventivo si `AGENTS.md` supera las 120 líneas de texto (`agents-bloated`), recordando que se lee en cada sesión y sugiriendo mover especificaciones a `PRODUCT.md` y `docs/`.
- A4: En `docs/ARCHITECTURE.md` (§14 "Proyecto nuevo"), se formaliza el flujo unificado: guardar especificaciones iniciales en archivos dedicados, mantener `AGENTS.md` blindado y mínimo, crear el esqueleto y proponer la épica del MVP descompuesta en cortes verticales verificables.

## Criterios de aceptación

- AC1: CUANDO `humanSections` genera las secciones iniciales de `AGENTS.md` ENTONCES incluye comentarios que prohíben volcar especificaciones de producto, arquitectura o fases y orientan a usar `PRODUCT.md` y `docs/` manteniendo el archivo conciso (< 80 líneas).
- AC2: CUANDO `flowBlock` genera las reglas para agentes ENTONCES incluye la regla de mantener `AGENTS.md` mínimo (< 80 líneas), derivando especificaciones a `docs/` y el plan a épicas.
- AC3: CUANDO `specty doctor` analiza un `AGENTS.md` que supera las 120 líneas ENTONCES emite un aviso `agents-bloated` en español e inglés sugiriendo trasladar especificaciones a `PRODUCT.md` y `docs/`.
- AC4: CUANDO se consulta `docs/ARCHITECTURE.md` (§14 "Proyecto nuevo") ENTONCES describe el flujo anidado de guardar especificaciones en archivos dedicados, blindar `AGENTS.md`, implementar el esqueleto y proponer la épica del MVP con cortes verticales verificables.

## Diseño

- **Plantilla de AGENTS.md y reglas (`packages/core/src/agents-md.ts`)**:
  - En `humanSections`, enriquecer las pistas comentadas de `## Mapa` y `## Convenciones` para especificar que no deben colocarse aquí especificaciones de producto, arquitectura ni fases, orientando a crear archivos bajo `docs/` o `PRODUCT.md` y mantener el documento por debajo de 80 líneas.
  - En `ruleLines`, añadir una regla explícita para el agente: mantener `AGENTS.md` mínimo (< 80 líneas), guardando especificaciones en `PRODUCT.md` o `docs/` y el plan en épicas.
- **Diagnóstico en specty doctor (`packages/core/src/cards/doctor.ts`, `packages/cli/src/commands/doctor.ts`)**:
  - Añadir al tipo `DoctorLine` el código `agents-bloated` con la propiedad `lines: number`.
  - En `WRITERS` de `cards/doctor.ts`, redactar el mensaje de advertencia bilingüe explicando que `AGENTS.md` se lee en cada sesión y sugiriendo mover especificaciones a `PRODUCT.md` y `docs/`.
  - En `doctorWarnings` (`commands/doctor.ts`), medir la cantidad de líneas de `agents` y emitir el aviso cuando sea mayor a 120 líneas.
- **Documentación de arquitectura (`docs/ARCHITECTURE.md`)**:
  - En §14 ("Proyecto nuevo"), integrar el flujo paso a paso: recepción de especificaciones completas -> distribución en `PRODUCT.md` y `docs/` temáticos con `AGENTS.md` blindado -> esqueleto del proyecto -> épica del MVP con cortes verticales.

## Archivos

- modificar packages/core/src/agents-md.ts — pistas de blindaje en humanSections y regla de tamaño mínimo en ruleLines
- modificar packages/core/test/agents-md.test.ts — pruebas de pistas y reglas de blindaje en AGENTS.md
- modificar packages/core/src/cards/doctor.ts — aviso agents-bloated en doctor para AGENTS.md excesivo
- modificar packages/core/test/cards/doctor.test.ts — pruebas de renderizado del aviso agents-bloated
- modificar packages/cli/src/commands/doctor.ts — detección de AGENTS.md sobrecargado en doctorWarnings
- modificar packages/cli/test/doctor-enter.test.ts — prueba de aviso de doctor cuando AGENTS.md supera el límite
- modificar docs/ARCHITECTURE.md — documentar en §14 el flujo anidado de especificaciones dedicadas, esqueleto y épica

## Tareas

- [ ] T1: Pistas y regla de blindaje de AGENTS.md en core
  - files: packages/core/src/agents-md.ts, packages/core/test/agents-md.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts
- [ ] T2: Aviso preventivo de AGENTS.md sobrecargado en doctor
  - files: packages/core/src/cards/doctor.ts, packages/core/test/cards/doctor.test.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/doctor-enter.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/doctor-enter.test.ts
- [ ] T3: Documentación del flujo de inicio en arquitectura
  - files: docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts
  - type: docs
