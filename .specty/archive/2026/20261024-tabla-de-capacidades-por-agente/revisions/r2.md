---
kind: standard
---

# Tabla de capacidades por agente

## Objetivo

Qué hace Specty con cada agente está repartido: `init` tiene su lista de herramientas con hooks, el guard la suya de herramientas que atiende, la detección sus archivos por agente, y ARCHITECTURE una tabla escrita a mano que se desfasa con cada cambio (hoy ya no dice que Cursor y OpenCode avisan tras cada comando). Una sola tabla en core dice, por agente, cómo se detecta, dónde va su guard, si avisa tras cada comando, si devuelve la tarjeta tras compactar y si entra en la worktree de un cambio por nombre. El código y la documentación salen de ella; es la idea del `capabilitymanifest` de gentle-ai.

## Fuera de alcance

- Añadir capacidades nuevas a ningún agente.
- Que `doctor` revise cada herramienta a partir de la tabla: sus comprobaciones son de archivos concretos y siguen como están.
- Sustituir la tabla detallada de ARCHITECTURE §10 (eventos, archivos y estado de cada herramienta): la nueva la resume y se genera.

## Supuestos

- A1: La tabla vive en core como datos (`as const satisfies`), así que el tipo de las herramientas con guard (`GuardTool` en la CLI) se deriva de ella y no puede desalinearse de la lista.
  - impacto: alto
- A2: La parte generada de ARCHITECTURE va entre las marcas `` y ``, y un test de core compara ese trozo con lo que genera la tabla en español; si alguien cambia la tabla, el test le pide regenerar el documento.
- A3: Los valores son los de hoy: guard en el repositorio para Claude Code y Cursor, en la configuración del usuario para Codex y OpenCode, ninguno para el resto; aviso tras cada comando en los cuatro con guard; tarjeta tras compactar y worktree por nombre solo en Claude Code.

## Criterios de aceptación

- AC1: CUANDO `init` decide a qué herramientas instalar hooks, el guard qué herramientas atiende y la detección con qué archivos reconoce cada agente ENTONCES todo sale de la tabla de capacidades, y su comportamiento no cambia.
- AC2: CUANDO la tabla de ARCHITECTURE §10 no coincide con la que genera core ENTONCES un test falla y dice qué falta.
- AC3: CUANDO se lee ARCHITECTURE §10 ENTONCES la tabla resumen dice, por agente, dónde va su guard, si avisa tras cada comando, si devuelve la tarjeta tras compactar, si entra por nombre y con qué archivos se detecta.

## Diseño

- `core/src/capabilities.ts` (nuevo): `AGENT_CAPABILITIES` por agente (`markers`, `guard`, `afterShell`, `afterCompaction`, `worktreeByName`), el tipo `GuardedAgent` derivado, `isGuardedAgent(tool)` y `capabilityTable(lang)`, que la devuelve en Markdown.
- CLI: `GuardTool` es `GuardedAgent` e `isGuardTool` usa la tabla (`enforce/actions.ts`); `init` instala hooks donde `guard` no es `none` (`commands/init.ts`); `agentTools` detecta con los `markers` (`detect/project.ts`).
- ARCHITECTURE §10: la tabla generada, antes de la detallada.

## Archivos

- crear packages/core/src/capabilities.ts — la tabla, el tipo derivado y su versión en Markdown
- modificar packages/core/src/index.ts — exporta la tabla
- crear packages/core/test/capabilities.test.ts — los valores y que ARCHITECTURE coincide
- modificar packages/cli/src/enforce/actions.ts — `GuardTool` e `isGuardTool` desde la tabla
- modificar packages/cli/src/commands/init.ts — las herramientas con hooks, desde la tabla
- modificar packages/cli/src/detect/project.ts — los archivos de cada agente, desde la tabla
- modificar docs/ARCHITECTURE.md — la tabla generada (§10)

## Tareas

- [x] T1: La tabla de capacidades en core, y ARCHITECTURE desde ella
  - files: packages/core/src/capabilities.ts, packages/core/src/index.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: feat
- [x] T2: La CLI lee la tabla
  - files: packages/cli/src/enforce/actions.ts, packages/cli/src/commands/init.ts, packages/cli/src/detect/project.ts
  - ac: AC1
  - verify: pnpm check
  - type: refactor

## Riesgos

- R1: Un valor mal copiado cambiaría qué instala `init` o qué atiende el guard — AC1 pide el mismo comportamiento, y los tests de instalación, de detección y del guard de cada herramienta siguen pasando sin tocarlos.

## Cierre

### Resumen

`core/src/capabilities.ts` tiene la tabla `AGENT_CAPABILITIES`. Por agente dice con qué archivos se detecta, dónde va su guard (en el repositorio, en la configuración del usuario o en ningún sitio), si avisa tras cada comando, si devuelve la tarjeta tras compactar y si entra por nombre en la worktree de un cambio. La CLI la lee: el tipo `GuardTool` es `GuardedAgent`, derivado de la tabla; `isGuardTool` e `init` usan `isGuardedAgent`; y la detección usa sus `markers`. ARCHITECTURE §10 lleva la tabla generada por `capabilityTable("es")` entre marcas, y un test de core falla si deja de coincidir. Los tests de instalación, detección y guard de cada herramienta pasan sin tocarlos.

### Desviaciones

- **Ninguna respecto al plan.**

### Decisiones

- **`as const satisfies`:** la tabla se comprueba contra `AgentCapabilities` y conserva sus literales, así `GuardedAgent` sale del tipo de la tabla y la CLI no puede tener otra lista.
- **Sin casts:** las claves se recorren con `isAgentTool`, que ya existía.
- **La tabla detallada de §10 se queda:** la generada la resume, y la detallada sigue explicando eventos y archivos de cada herramienta.

### Pendientes

- **`doctor` desde la tabla:** sus comprobaciones por herramienta siguen escritas a mano, porque cada una mira archivos distintos.
