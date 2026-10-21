---
kind: standard
---

# Sistema de diseño: tokens y catálogo

## Objetivo

Crear `packages/ui` con Angular 22 y los tokens del sistema de diseño en la dirección "Tinta" (base neutra, acento de tinta sin tono, Geist y Geist Mono), junto con un catálogo navegable que los muestra en claro y oscuro, en español e inglés. Es la base de los componentes y del prototipo de la fase 2.

## Fuera de alcance

- Componentes base (botón, insignia de fase, Kbd, Tooltip…), superposiciones y paleta ⌘K: cambios siguientes.
- Pantallas del producto, capa de datos y servidor local (`specty ui`).
- Incluir el bundle de la UI en el CLI publicado.
- Cambios en `packages/core` y `packages/cli`.

## Supuestos

- A1: Angular 22 exige TypeScript `>=6.0 <6.1`. `packages/ui` fija `typescript ~6.0` solo para sí; `core` y `cli` siguen con TypeScript 7.
  - impacto: alto
- A2: ui.md da color solo a seis fases. `adjusting` usa el azul de implementación y `closing` el violeta de aceptación; se distinguen por icono y nombre.
  - impacto: alto
- A3: Las fuentes se autoalojan con `@fontsource-variable/geist` y `@fontsource-variable/geist-mono` (OFL 1.1); la UI no pide nada a la red.
- A4: La cobertura mínima de la UI es la del CLI: 80 %.
- A5: El tema por defecto es "sistema". Tema e idioma se guardan en `localStorage`; si no está disponible, se usan los valores por defecto sin error.
- A6: El idioma por defecto es español si el navegador está en español, e inglés en otro caso.
- A7: Los textos usan `translator`, `Lang` y `PHASES` de core, sin `@angular/localize`, para cambiar de idioma sin recargar.
- A8: Los tests de la UI van junto a cada fuente (`*.test.ts`), porque el alcance implícito de Specty no reconoce `packages/ui/test/` como espejo de `packages/ui/src/`. Los ejecuta el builder de tests de Angular con Vitest 5.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `pnpm check` en la raíz ENTONCES también pasa lint, tipos (con plantillas estrictas), cabeceras y tests de `packages/ui`, y falla si su cobertura baja del 80 %.
- AC2: CUANDO se ejecuta `pnpm --filter @baquia-dev/specty-ui build` ENTONCES `packages/ui/dist` contiene la app con Geist y Geist Mono incluidas, y ningún archivo generado carga recursos de otro origen.
- AC3: CUANDO se abre el catálogo ENTONCES ofrece las páginas Colores, Tipografía y Fundamentos (espaciado, radios, sombras y movimiento), navegables con ratón y con teclado, y cada token aparece con su nombre, su descripción y su valor en el tema actual.
- AC4: CUANDO se abre la página Colores ENTONCES cada una de las ocho fases aparece con su icono, su nombre y su color, y el acento aparece con sus usos (acción primaria, enlace y foco).
- AC5: CUANDO la persona cambia el tema (claro, oscuro o sistema) o el idioma (español o inglés) ENTONCES el catálogo se actualiza sin recargar y conserva la elección al volver a abrirlo.
- AC6: CUANDO el tema es "sistema" y cambia `prefers-color-scheme` ENTONCES el catálogo pasa a claro u oscuro sin recargar.
- AC7: CUANDO se calculan los contrastes de los tokens en claro y en oscuro ENTONCES el texto principal, el secundario, el de cada fase sobre su fondo y el texto sobre el acento alcanzan al menos 4,5:1, y el anillo de foco al menos 3:1 sobre el fondo y la superficie.
- AC8: CUANDO el sistema pide movimiento reducido (`prefers-reduced-motion: reduce`) ENTONCES las duraciones de los tokens de movimiento valen 0; sin esa preferencia, ninguna supera 200 ms.

## Diseño

**Dirección Tinta.** Neutros fríos de la escala zinc. Fondo `#FAFAFA` / `#0B0B0C`, superficie `#FFFFFF` / `#141416`, texto `#18181B` / `#F4F4F5`, texto secundario `#52525B` / `#A1A1AA`, borde `#E4E4E7` / `#27272A`. El acento es la propia tinta (`#18181B` / `#F4F4F5`), sin tono, para que el único color de la pantalla sea el de las fases y los riesgos. Como el acento no tiene tono, los enlaces van subrayados y el foco es un anillo de 2 px con separación.

**Tokens.** `styles.css` es la única fuente de valores: variables CSS semánticas en `:root` (claro), redefinidas bajo `[data-theme="dark"]` y, con el tema "sistema", bajo `@media (prefers-color-scheme: dark)`. Nombres: `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-on-accent`, `--color-focus`, `--color-phase-<fase>` y `--color-phase-<fase>-bg`. Además: tipografía (12, 13, 14, 16, 18, 24 y 32 px, con su interlineado), espaciado con base de 4 px, radios (4, 6, 8 y 12 px), dos sombras mínimas, y movimiento (`--duration-fast: 120ms`, `--duration-base: 200ms` y una curva). `@theme` de Tailwind 4 expone las variables como utilidades (`bg-surface`, `text-muted`…). El tema oscuro redefine las variables, así que no hacen falta variantes `dark:`.

**Fases** (colores de ui.md; ver A2), con iconos de `@lucide/angular`: borrador `pencil-line`, revisión `eye`, implementación `code`, ajustes `wrench`, aceptación `list-checks`, cierre `archive`, terminado `circle-check`, cancelado `ban`.

**Código.**

- `theme/tokens.ts`: inventario tipado de tokens (nombre, grupo, descripción es/en) que recorre el catálogo; el valor se lee en vivo con `getComputedStyle`, así no se duplica.
- `theme/preferences.ts`: servicio con signals `theme` y `lang`. Aplica `data-theme` y `lang` en `<html>`, escucha `prefers-color-scheme` y persiste con `try/catch`.
- `main.ts`: arranque standalone sin zone.js y rutas `/catalog/colors`, `/catalog/typography` y `/catalog/foundations`.
- Las plantillas van en línea dentro de cada `.ts`, así `pnpm sources` también comprueba su cabecera y su tamaño.
- `package.json` define `build` (`ng build`), `test` (`ng test` con cobertura) y `typecheck` (`ngc` con plantillas estrictas, más `tsc` sobre los tests), así que `pnpm check` incluye la UI sin tocar la raíz.
- `tsconfig.test.json` (implícito) cubre los tests.
- La caché de Angular va a `node_modules/.cache`.

**Contraste (AC7).** Un test lee `styles.css`, extrae los pares de cada tema y calcula la relación de contraste de WCAG.

**Documentación** (rutas libres; va en los commits de las tareas):

- `docs/ui.md`: stack Angular y dirección Tinta.
- `docs/decisions/0009-angular-para-la-ui.md`: Angular para la UI, que actualiza el ADR 0003.
- `AGENTS.md`: `packages/ui` en el mapa y en los comandos.

## Archivos

- modificar pnpm-workspace.yaml — decidir los scripts de instalación de las dependencias nuevas
- crear packages/ui/package.json — paquete privado `@baquia-dev/specty-ui`: dependencias y scripts `build`, `test` y `typecheck`
- crear packages/ui/angular.json — build de la app y tests con Vitest y cobertura
- crear packages/ui/tsconfig.json — TypeScript 6 estricto con DOM y plantillas estrictas
- crear packages/ui/src/index.html — documento de la app
- crear packages/ui/src/main.ts — arranque sin zone.js y rutas del catálogo
- crear packages/ui/src/styles.css — Tailwind, fuentes y tokens en claro y oscuro
- crear packages/ui/src/theme/tokens.ts — inventario de tokens con descripción en español e inglés
- crear packages/ui/src/theme/preferences.ts — tema e idioma con signals, persistidos
- crear packages/ui/src/catalog/catalog.ts — armazón del catálogo: navegación y conmutadores de tema e idioma
- crear packages/ui/src/catalog/colors.ts — página Colores: neutros, acento y fases
- crear packages/ui/src/catalog/foundations.ts — páginas Tipografía y Fundamentos

## Tareas

- [x] T1: Paquete Angular de la UI en el monorepo
  - files: pnpm-workspace.yaml, packages/ui/package.json, packages/ui/angular.json, packages/ui/tsconfig.json
  - ac: —
  - verify: pnpm install --frozen-lockfile
  - type: chore
  - notes: Incluye el ADR 0009 y el stack de docs/ui.md.
- [x] T2: Tokens de Tinta y preferencias de tema e idioma
  - files: packages/ui/src/styles.css, packages/ui/src/theme/tokens.ts, packages/ui/src/theme/preferences.ts
  - ac: AC5, AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T3: Catálogo navegable
  - files: packages/ui/src/index.html, packages/ui/src/main.ts, packages/ui/src/catalog/catalog.ts, packages/ui/src/catalog/colors.ts, packages/ui/src/catalog/foundations.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm check
  - notes: Incluye la dirección Tinta en docs/ui.md y packages/ui en AGENTS.md.

## Riesgos

- R1: El builder de tests de Angular podría no admitir umbrales de cobertura o el patrón `*.test.ts`. Mitigación: `runnerConfig` con un `vitest.config.ts` propio, pedido con `specty scope add`.
- R2: Core se compila con TypeScript 6 al importarlo desde la UI. Si usa algo exclusivo de TypeScript 7, falla el build. Mitigación: comprobarlo en T1; si falla, se replantea A1 antes de seguir.
- R3: Biome puede marcar `@theme` como regla desconocida en CSS. Mitigación: un `biome-ignore` en `styles.css`; si no basta, se pide `biome.json` con `specty scope add` para activar las directivas de Tailwind.
- R4: Con TypeScript 6 y 7 en el mismo repositorio, el editor puede usar la versión equivocada en `packages/ui`. Mitigación: `typecheck` propio del paquete y nota en AGENTS.md.
