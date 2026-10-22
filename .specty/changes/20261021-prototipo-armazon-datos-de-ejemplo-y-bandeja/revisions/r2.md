---
kind: standard
follows:
  - 20261021-sistema-de-diseno-superposiciones-y-teclado
---

# Prototipo: armazón, datos de ejemplo y Bandeja

## Objetivo

Empezar el prototipo navegable de la fase 2 con datos de ejemplo:

- el armazón de la app (cabecera común, rutas y ⌘K);
- la capa de datos independiente del transporte;
- la Bandeja, donde se ve primero lo que espera una decisión de la persona;
- la página de un cambio con sus pestañas.

Las pantallas solo dependen de un contrato de datos. Así, al conectar el servidor (cambio 7) no cambian.

## Fuera de alcance

- El contenido de las pestañas: revisión de spec y delta (cambio 5); progreso, aceptación y cierre (cambio 6); historial (fase 3).
- Las acciones humanas reales (aprobar, aceptar, cerrar…): las acciones de la Bandeja solo llevan a la pestaña del cambio.
- El servidor local, las épicas, la trazabilidad y los ajustes.

## Supuestos

- A1: Contrato de datos crudo. Por cada cambio, la fuente entrega el texto de `spec.md`, su `state.json` y desde cuándo está en su fase; la UI deriva todo lo demás con core (`parseSpec`, `computeSize`, `recommendEffort`, `parseChangeState`). Así el servidor solo lee archivos y emite eventos, y la misma UI sirve con fetch + SSE, con `postMessage` o en MCP Apps. Decidido por la persona en la revisión 1: para que core (y con él zod y yaml) no viaje en el bundle inicial, la derivación corre en un web worker y, si el navegador no admite workers, en un fragmento que se carga bajo demanda; la Bandeja y el cambio también se cargan bajo demanda.
  - impacto: alto
- A2: Rutas: `/` es la Bandeja, `/changes/:id` el cambio (con la pestaña en `?tab=`) y `/catalog/…` el catálogo. La cabecera, el tema, el idioma y ⌘K pasan del catálogo a un armazón común, y el catálogo queda como una sección con su navegación.
  - impacto: alto
- A3: Datos de ejemplo de un proyecto ficticio, "Mi colegio" (como el ejemplo de formats.md): seis cambios que cubren las cuatro decisiones pendientes y varias fases. Sus tiempos son relativos al momento de abrir la UI.
- A4: Para probar el directo sin servidor, la paleta del prototipo incluye comandos "Simular: …" (aprobar la spec, aprobar el alcance, terminar una tarea) que cambian los datos de ejemplo. Se quitarán al conectar el servidor.
- A5: Los tiempos se escriben con `Intl.RelativeTimeFormat` en el idioma elegido ("hace 12 min", "12 min ago").

## Criterios de aceptación

- AC1: CUANDO se abre la UI ENTONCES la Bandeja (`/`) muestra primero "Esperan tu decisión" (spec por revisar, solicitud de alcance, resultado por aceptar y cierre por confirmar), cada tarjeta con título, insignia de fase, tamaño, cuánto lleva esperando y su acción directa; debajo, los cambios en curso agrupados por fase, y al final los recientes (terminados o cancelados).
- AC2: CUANDO una spec en revisión tiene supuestos de alto impacto sin decidir ENTONCES su tarjeta dice cuántos son; una solicitud de alcance muestra la tarea, las rutas pedidas y el motivo.
- AC3: CUANDO la persona usa `j`/`k` en la Bandeja ENTONCES la selección recorre las tarjetas (anillo de foco y `aria-current`) y Enter abre el cambio seleccionado; además, la paleta (`mod+k`) ofrece ir a la Bandeja y abrir cada cambio por su título.
- AC4: CUANDO se abre un cambio ENTONCES la cabecera muestra título, fase, revisión, rama, tamaño con sus razones y esfuerzo recomendado, y las pestañas Spec · Progreso · Aceptación · Historial abren en la que corresponde a la fase (borrador y revisión → Spec; implementación y ajustes → Progreso; aceptación y cierre → Aceptación; terminado y cancelado → Historial); un id desconocido muestra un estado vacío con vuelta a la Bandeja.
- AC5: CUANDO cambian los datos en la fuente ENTONCES la Bandeja y el cambio abierto se actualizan sin recargar; los comandos "Simular: …" lo demuestran con los datos de ejemplo.
- AC6: CUANDO los datos están cargando ENTONCES se ven esqueletos con la forma final; si la fuente falla, un mensaje dice qué pasó y ofrece reintentar.
- AC7: CUANDO se sustituye la fuente de datos por otra que cumple el contrato ENTONCES las pantallas funcionan igual, porque solo dependen de `SpectyData`.
- AC8: CUANDO se navega por la UI ENTONCES una cabecera común ofrece la Bandeja, el catálogo, la paleta (un botón con su atajo) y el cambio de tema e idioma; el catálogo sigue en `/catalog` con su navegación.
- AC9: CUANDO se cargan los datos de ejemplo ENTONCES cada spec es válida para core y cada estado pasa `parseChangeState`.
- AC10: CUANDO se construye la UI (`ng build --stats-json`) ENTONCES el parser de core, zod y yaml no están en el bundle inicial: viven en el worker de derivación y en el fragmento de respaldo bajo demanda; la Bandeja y la página del cambio son fragmentos bajo demanda; y la derivación funciona igual por las dos vías.

## Diseño

- **Contrato** (`data/records.ts`): `ChangeRecord { spec: string; state: ChangeState; phaseSince: string }` y la clase abstracta `SpectyData`, que se inyecta como token. Tiene `changes(): Promise<readonly ChangeRecord[]>` y `subscribe(listener): () => void`. Las acciones humanas se añadirán al contrato en los cambios siguientes.
- **Vistas** (`data/views.ts`): funciones puras que derivan con core la vista de cada cambio:
  - título, fase, revisión, rama y tamaño (con `formatSizeReason`);
  - esfuerzo recomendado;
  - la decisión pendiente (`review`; `implementing` con solicitudes de alcance; `acceptance`; `closing` con el cierre enviado);
  - los supuestos de alto impacto sin decidir;
  - la pestaña inicial según la fase;
  - el tiempo relativo.
- **Derivación fuera del hilo principal:**
  - `data/views.ts` importa core y solo lo cargan el worker o el respaldo.
  - `data/derive.worker.ts` recibe `ChangeRecord[]` y devuelve las vistas, que son serializables: los textos traducibles van con sus dos idiomas y el tiempo relativo se calcula en el hilo principal.
  - El almacén crea el worker con `new Worker(new URL("./derive.worker", import.meta.url), { type: "module" })`, que el builder empaqueta como un archivo aparte. Si no hay `Worker` (jsdom en los tests, algunos anfitriones), usa `import("./views")` bajo demanda.
  - `records.ts` y el resto del hilo principal solo importan tipos de core (`import type`), salvo las utilidades ligeras ya en uso (`translator`, `PHASES`, `fold`).
- **Almacén** (`data/changes-store.ts`): un `resource()` sobre `SpectyData` que deriva por el worker y recarga con cada aviso de `subscribe`, más `summaries`, `decisions`, `active`, `recent` y `byId(id)` como señales.
- **Rutas bajo demanda:** la Bandeja y la página del cambio usan `loadComponent`, igual que el catálogo.
- **Datos de ejemplo** (`data/sample-specs.ts` y `data/fixtures.ts`): las specs son Markdown real en cadenas, y `FixtureData` implementa `SpectyData` con estados validados por `parseChangeState`. También registra los comandos "Simular: …".
- **Armazón** (`app/shell.ts` y `app/routes.ts`):
  - la cabecera con el logotipo, la Bandeja, el catálogo, el botón "Buscar o ejecutar… ⌘K", tema e idioma;
  - `sp-toaster`;
  - los comandos globales: ir a la Bandeja, al catálogo y a cada cambio, tema e idioma.

  `main.ts` arranca el armazón y provee `SpectyData` con `FixtureData`. `catalog.ts` deja la cabecera y los comandos al armazón.
- **Bandeja** (`inbox/inbox.ts`): secciones con encabezados. Las tarjetas son `sp-card` con `sp-phase-badge`, `sp-badge` para el tamaño y el tiempo de espera, y un `sp-button` como acción directa. `j`/`k` y Enter se registran en `Shortcuts`.
- **Cambio** (`change/change-page.ts`): la cabecera y `sp-tabs` sincronizadas con `?tab=`. Cada panel muestra por ahora un resumen (objetivo, tareas hechas o pendientes) y dice qué llegará en el cambio 5 o 6.

## Archivos

- crear packages/ui/src/data/records.ts — contrato de datos independiente del transporte
- crear packages/ui/src/data/views.ts — vistas derivadas con core
- crear packages/ui/src/data/derive.worker.ts — web worker que deriva las vistas fuera del hilo principal
- crear packages/ui/src/data/changes-store.ts — almacén reactivo sobre SpectyData
- crear packages/ui/src/data/sample-specs.ts — specs de ejemplo en Markdown
- crear packages/ui/src/data/fixtures.ts — FixtureData, estados de ejemplo y comandos Simular
- crear packages/ui/src/app/shell.ts — armazón común
- crear packages/ui/src/app/routes.ts — rutas de la app
- modificar packages/ui/src/main.ts — arrancar el armazón con FixtureData
- modificar packages/ui/src/catalog/catalog.ts — el catálogo como sección del armazón
- crear packages/ui/src/inbox/inbox.ts — Bandeja
- crear packages/ui/src/change/change-page.ts — página del cambio con pestañas

## Tareas

- [ ] T1: Contrato de datos y vistas derivadas con core
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/derive.worker.ts
  - ac: AC2, AC4, AC7, AC10
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T2: Datos de ejemplo y almacén reactivo
  - files: packages/ui/src/data/sample-specs.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/changes-store.ts
  - ac: AC5, AC6, AC9
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T3: Armazón común y rutas
  - files: packages/ui/src/app/shell.ts, packages/ui/src/app/routes.ts, packages/ui/src/main.ts, packages/ui/src/catalog/catalog.ts
  - ac: AC8
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T4: Bandeja
  - files: packages/ui/src/inbox/inbox.ts
  - ac: AC1, AC2, AC3, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T5: Página del cambio con pestañas
  - files: packages/ui/src/change/change-page.ts
  - ac: AC4, AC5, AC10
  - verify: pnpm check
  - notes: Comprobar AC10 con `ng build --stats-json` y anotar en el resumen qué paquetes quedan en cada fragmento.

## Riesgos

- R1: Derivar con core en el cliente metería zod y yaml en el bundle. (Hoy no están: el tree-shaking deja core fuera porque la UI solo usa utilidades ligeras.) Mitigación (A1): worker y respaldo bajo demanda, comprobado con `ng build --stats-json` (AC10).
- R4: Un worker no comparte memoria y hay que serializar: las vistas no pueden llevar funciones ni señales. Mitigación: vistas como datos planos, y un test que deriva por las dos vías y compara.
- R2: `resource()` de Angular puede cambiar de API entre versiones menores. Mitigación: queda encerrado en `changes-store.ts`.
- R3: Mover la cabecera al armazón rompe tests del catálogo (tema e idioma, ⌘K). Mitigación: esos tests pasan al armazón, y los del catálogo se quedan con su navegación.
