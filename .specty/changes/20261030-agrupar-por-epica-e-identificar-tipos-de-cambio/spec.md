---
kind: standard
---

# Agrupar por épica e identificar tipos de cambio en la UI

## Objetivo

Identificar visualmente en la UI cada tipo de cambio (`Épica`, `Corte`, `Individual`, `Quick`, `Manual` y `Spike`) mediante una insignia con icono y etiqueta bilingüe, y agrupar los cambios que pertenecen a una épica tanto dentro de bloques visuales por épica en cada sección de la Bandeja como mediante la opción «Épica» en el selector «Agrupar».

## Fuera de alcance

- Modificar el formato de `spec.md` o `state.json` en `@baquia-dev/specty-core`.
- Añadir nuevas rutas o pantallas independientes fuera de la Bandeja y la página del cambio.

## Supuestos

- A1: La pertenencia de un cambio a una épica se obtiene de `frontmatter.epic` y `frontmatter.slice` en su `spec.md`, resolviendo el título de la épica cuando el cambio de la épica figura entre los registros cargados y usando el identificador de la épica como respaldo.
- A2: Las etiquetas visibles de `sp-kind-badge` son `Épica` / `Epic`, `Corte <slice> · <épica>` / `Slice <slice> · <epic>`, `Individual` / `Standalone`, `Quick` / `Quick`, `Manual` / `Manual` y `Spike` / `Spike`.

## Criterios de aceptación

- AC1: CUANDO se derivan las vistas de cambios y una spec declara `epic` (y opcionalmente `slice`) en su frontmatter ENTONCES `ChangeView.epic` incluye el identificador de la épica, su corte y el título resuelto de la épica.
- AC2: CUANDO se renderiza `sp-kind-badge` para cualquier cambio ENTONCES muestra el icono y la etiqueta correspondientes a su categoría (`Épica`, `Corte`, `Individual`, `Quick`, `Manual` o `Spike`) en español e inglés.
- AC3: CUANDO una sección de la Bandeja contiene cambios vinculados a una épica ENTONCES se agrupan de forma contigua bajo un bloque visual `[data-epic-group]` identificado con el título de la épica y el conteo de cambios del grupo, preservando el orden de navegación con `j`/`k`.
- AC4: CUANDO la persona selecciona «Épica» en el control «Agrupar» de la Bandeja ENTONCES la lista se organiza en secciones por cada épica activa o presente seguida de secciones por tipo para los cambios sin épica (`Specs individuales`, `Cambios quick`, `Cambios manuales` y `Spikes`).
- AC5: CUANDO se visualiza una fila en la Bandeja o la cabecera de un cambio en `sp-change-page` ENTONCES se muestra `sp-kind-badge` junto a la información principal del cambio.

## Diseño

- **Modelo y derivación (`packages/ui/src/data/records.ts`, `packages/ui/src/data/views.ts`)**:
  - Añadir a `ChangeView` la propiedad opcional `epic?: { readonly id: string; readonly title: string; readonly slice?: string }`.
  - En `deriveView`, leer `spec.frontmatter.epic` y `spec.frontmatter.slice`. En `deriveViews`, resolver `epic.title` buscando el cambio con `id === epic.id` entre las vistas derivadas (con fallback al `id`).
- **Insignia de tipo (`packages/ui/src/components/badge.ts`)**:
  - Crear el componente `KindBadge` (`sp-kind-badge`) con entradas `kind` (`ChangeKind`) y `epic` (`ChangeView["epic"]`).
  - Exponer `data-kind` (`"slice"` cuando tiene `epic`, o el `ChangeKind` correspondiente) y `data-epic` cuando pertenece a una épica.
  - Utilizar iconos de `components/icons.ts` (`LucideLayers` para `epic`, `LucideComponent` para `slice`, `LucideFilePlus` para `standard`, `LucidePlay` para `quick`, `LucideGitCommitHorizontal` para `retro` y `LucideLightbulb` para `spike`).
- **Agrupación y bloques de épica en la Bandeja (`packages/ui/src/inbox/inbox-view.ts`, `packages/ui/src/inbox/inbox-toolbar.ts`, `packages/ui/src/inbox/inbox.ts`, `packages/ui/src/inbox/inbox-row.ts`, `packages/ui/src/change/change-page.ts`)**:
  - Ampliar `InboxGroup` e `INBOX_GROUPS` a `["state", "phase", "none", "epic"]`.
  - En `matchesQuery`, permitir buscar también por el título o identificador de la épica y por el identificador del corte (`C1`).
  - En `inboxSections`, al agrupar por `"state"`, `"phase"` o `"none"`, mantener contiguos los cambios que comparten épica y exponer `sectionBlocks(section)` para que `sp-inbox` renderice un contenedor `[data-epic-group]` con cabecera de la épica cuando hay cambios pertenecientes a una épica, y filas directas para cambios independientes.
  - Al agrupar por `"epic"`, generar una sección por cada épica y secciones por tipo para los cambios sin épica.

## Archivos

- modificar packages/ui/src/data/records.ts — añadir metadatos de épica y corte en ChangeView
- modificar packages/ui/src/data/views.ts — derivar epic y slice del frontmatter y resolver el título de la épica
- modificar packages/ui/src/data/views.test.ts — pruebas de derivación de épica y corte en ChangeView
- modificar packages/ui/src/components/badge.ts — añadir componente KindBadge con icono y etiqueta por tipo y corte de épica
- modificar packages/ui/src/components/badge.test.ts — pruebas de KindBadge en español e inglés para todos los tipos y cortes
- modificar packages/ui/src/inbox/inbox-view.ts — agrupación por épica, bloques visuales de épica por sección y búsqueda por épica
- modificar packages/ui/src/inbox/inbox-view.test.ts — pruebas de agrupación por épica y bloques de épica en secciones
- modificar packages/ui/src/inbox/inbox-toolbar.ts — añadir opción Épica en el selector Agrupar de la Bandeja
- modificar packages/ui/src/inbox/inbox-toolbar.test.ts — pruebas del botón de agrupación por épica en la barra de opciones
- modificar packages/ui/src/inbox/inbox.ts — renderizar bloques visuales de épica dentro de cada sección de la Bandeja
- modificar packages/ui/src/inbox/inbox.test.ts — pruebas de bloques visuales de épica e insignias de tipo en la Bandeja
- modificar packages/ui/src/inbox/inbox-row.ts — mostrar KindBadge en cada fila de la Bandeja
- modificar packages/ui/src/change/change-page.ts — mostrar KindBadge en la cabecera de la página del cambio
- modificar docs/ui.md — documentar la identificación visual por tipo y la agrupación por épica en la Bandeja

## Tareas

- [x] T1: Derivar pertenencia a épica en ChangeView y crear componente KindBadge
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts, packages/ui/src/components/badge.ts, packages/ui/src/components/badge.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/views.test.ts --include src/components/badge.test.ts
- [x] T2: Agrupación por épica y bloques de épica en la lógica de vista y opciones de la Bandeja
  - files: packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox-view.test.ts, packages/ui/src/inbox/inbox-toolbar.ts, packages/ui/src/inbox/inbox-toolbar.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-view.test.ts --include src/inbox/inbox-toolbar.test.ts
- [ ] T3: Mostrar bloques visuales de épica e insignia de tipo en Bandeja y cabecera del cambio
  - files: packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox.test.ts, packages/ui/src/inbox/inbox-row.ts, packages/ui/src/change/change-page.ts, docs/ui.md
  - ac: AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox.test.ts --include src/change/change-page.test.ts
