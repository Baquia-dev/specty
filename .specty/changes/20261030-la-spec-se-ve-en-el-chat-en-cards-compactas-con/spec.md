---
kind: standard
---

# La spec se ve en el chat en cards compactas con los colores del chat

## Objetivo

Hoy la vista de Specty en el chat (MCP Apps) muestra la revisión entera de `specty ui`: el índice «Contenido», las ocho secciones seguidas y la columna de comentarios, unos 3.400 px para una spec. Con este cambio, en borrador y en revisión la spec se ve como cards compactas. Hay una cabecera con la fase, el id, el título y lo que espera el cambio, y debajo una card por sección con su número, título, pista y resumen. Solo Objetivo viene abierta y las demás se abren al pulsarlas.

Además, la vista se funde con el chat:

- no pinta fondo propio y pide al anfitrión que no la enmarque;
- toma de él el tema, los colores del texto y los bordes, y la fuente;
- se encoge cuando se cierra una card.

Así, aunque es un único iframe, cada card parece suelta en la conversación. Es el primer paso para refinar la vista del chat; Progreso y Aceptación vendrán después. Maqueta: «Specty · La spec en el chat, en cards».

## Fuera de alcance

- Pasar a cards Progreso, Aceptación e Historial: siguen como hoy, aunque toman los colores del chat porque la vista ya no pinta fondo.
- Un iframe por card: MCP Apps muestra una vista por llamada, así que haría falta una llamada por sección (A1).
- Cargar las fuentes que el anfitrión manda como `@font-face` (`styles.css.fonts`, Anthropic Sans en Claude), porque exigiría abrir la CSP a su dominio. La vista usa la familia de `--font-sans` del anfitrión con su lista de reserva.
- Cambiar la revisión de `specty ui`: las cards solo existen en la vista del chat.
- Ver en el chat el diff de palabras desde la revisión aprobada: las cards solo marcan qué secciones cambiaron, y el diff sigue en `specty ui`.

## Supuestos

- A1: Es un solo iframe. Según la especificación de MCP Apps (2026-01-26), una llamada a una herramienta muestra una sola vista, y varias vistas por resultado es una idea futura. Las cards parecen independientes porque la vista no pinta fondo, pide `prefersBorder: false` y las separa con un hueco; la persona lo aceptó el 2026-10-30.
  - impacto: alto
- A2: La vista no puede leer el color del chat porque está aislada, así que usa lo que le da el anfitrión en `hostContext`: `theme` y `styles.variables`, al saludar y en `ui/notifications/host-context-changed`, que trae solo lo que cambió. Claude manda sus variables con `light-dark()`; VS Code 1.143.1 manda `var(--vscode-*)` e ignora `prefersBorder`, aunque no dibuja marco y su webview es transparente.
  - impacto: alto
- A3: Las cards son un velo del color del texto sobre lo que haya detrás: un 4 % en oscuro y un 2,5 % en claro, con el borde del anfitrión (`--color-border-primary`) o, sin él, el texto al 12 %. El texto sale de `--color-text-primary` y el atenuado de `--color-text-secondary`. Sin esas variables se usan los colores de Specty del tema. Los colores de fase siguen siendo de Specty.
  - impacto: alto
- A4: Lo que pinta fondo y antes usaba `--color-bg`, como las barras fijas de otras pestañas, usa `--color-background-primary` del anfitrión o el de Specty; solo `body` queda transparente.
- A5: El tema del anfitrión manda sobre el del sistema: la vista lo pone en `Preferences.theme`. Si el anfitrión no da tema, sigue el del sistema, como hoy.
- A6: La cabecera en card vale para todas las fases, porque la cabecera es común a la vista embebida; el contenido de las demás pestañas no cambia.
- A7: Cada card dice en su cabecera lo que hoy dice el índice y la sección: su progreso (`sectionProgress`) o, si no lo hay, cuántos ítems tiene; los pendientes y avisos (en ámbar), sus comentarios y «Cambió» si la sección tiene entradas en el delta desde la revisión aprobada. Objetivo, Fuera de alcance y Diseño no cuentan ítems.
- A8: Las cards abiertas se mantienen mientras llegan actualizaciones del mismo cambio; con otro cambio, vuelve a abrirse solo Objetivo.
- A9: Cambian dos tests que afirman lo de antes. En `app/embedded.test.ts`, AC1 buscaba `sp-spec-review` y ahora busca las cards. En `cli/test/mcp-app.test.ts`, `resources/read` se comparaba entero sin `_meta`.

## Criterios de aceptación

- AC1: CUANDO la vista del chat muestra la spec de un cambio en borrador o en revisión ENTONCES cada sección presente es una card con su número, su título, su pista y su resumen (A7), sin el índice «Contenido», sin la columna de comentarios y sin botones para decidir.
- AC2: CUANDO la vista se abre ENTONCES solo la card de Objetivo está abierta (`aria-expanded="true"`). CUANDO la persona pulsa la cabecera de una card ENTONCES esa se abre o se cierra y las demás quedan como estaban. CUANDO llega otra lectura del mismo cambio ENTONCES siguen abiertas las mismas.
- AC3: CUANDO la spec tiene comentarios ENTONCES una card «Comentarios» los lista, sin poder comentar; sin comentarios, esa card no aparece. CUANDO el cambio tiene una revisión independiente (`specty review`) ENTONCES va en una card antes de las secciones.
- AC4: CUANDO la spec cambió desde su revisión aprobada ENTONCES las cards de las secciones con cambios lo marcan con «Cambió», y las demás no.
- AC5: CUANDO la vista embebida muestra un cambio ENTONCES su cabecera (fase, id, título y la línea de qué espera) es una card y la raíz lleva la marca `data-embedded`; en borrador y revisión, debajo van las cards de la spec y no `sp-spec-review`.
- AC6: CUANDO el anfitrión da `hostContext.theme` al responder a `ui/initialize` o en `ui/notifications/host-context-changed` ENTONCES la vista usa ese tema (`data-theme` de la raíz) aunque el sistema diga otro; sin tema, sigue el del sistema.
- AC7: CUANDO el anfitrión da `hostContext.styles.variables` ENTONCES la vista pone en la raíz cada variable que empieza por `--` y cuyo valor es texto. Una actualización parcial cambia solo las que trae, y lo que no es una variable se ignora.
- AC8: CUANDO el contenido de la vista encoge (se cierra una card) ENTONCES `ui/notifications/size-changed` da el alto del contenido, menor que el del iframe, y no el alto del iframe.
- AC9: CUANDO el anfitrión lee la vista (`resources/read`) ENTONCES su contenido lleva `_meta.ui.prefersBorder: false`.
- AC10: CUANDO la vista se abre en VS Code con Copilot y en Claude Desktop, en tema oscuro y claro ENTONCES las cards se ven sobre el fondo del chat, sin marco ni fondo opaco, con el texto y la fuente del chat.
  - test: manual

## Diseño

- `review/spec-cards.ts` (`sp-spec-cards`, entrada `change`):
  - una `<section>` por sección presente del índice, con la cabecera como `<h2><button aria-expanded aria-controls>`: número, título, pista, resumen y marcas (A7) y un chevrón;
  - el cuerpo reutiliza las piezas de `spec-review.ts` sin edición: `Markdown`, `UserRequest`, `AssumptionRow` y `ReviewItems`;
  - Diseño muestra su markdown directamente, sin `sp-collapsible`;
  - las abiertas son un `linkedSignal` por id del cambio, que empieza en `goal`;
  - la revisión independiente (`IndependentReview`) y los comentarios (`ReviewComments` con `editable` falso) van en sus propias cards.
- `app/embedded.ts`:
  - la cabecera pasa a una card y la pestaña Spec usa `sp-spec-cards`;
  - pone `data-embedded` en la raíz;
  - el `main` no tiene margen lateral y separa las cards con un hueco pequeño;
  - Progreso, Aceptación e Historial conservan su margen interior.
- `theme/host-look.ts` (`HostLook`, raíz):
  - `take(context)` lee `theme` y `styles.variables` de un `hostContext` parcial y las junta con las que ya tenía;
  - pone el tema en `Preferences.theme` y cada variable con `style.setProperty` en la raíz.
- `data/mcp-app.ts`:
  - pasa a `HostLook` el `hostContext` de la respuesta a `ui/initialize` y los parámetros de `ui/notifications/host-context-changed`;
  - mide el alto del contenido con la raíz a `height: max-content` (como el SDK de ext-apps) y no `scrollHeight`, que nunca baja del alto del iframe.
- `styles.css`, bajo `[data-embedded]`, por tema:
  - `body` transparente;
  - `--color-bg` es `--color-background-primary` del anfitrión, o el de Specty;
  - `--color-surface` es el velo de A3 y `--color-border` es el del anfitrión o el velo;
  - `--color-text` y `--color-text-muted` son los del anfitrión, o los de Specty.

  Los nombres de Specty (`--color-text`, `--color-border`…) no chocan con los del anfitrión (`--color-text-primary`, `--color-border-primary`…). `--font-sans` y `--font-mono` del anfitrión sustituyen directamente a las de Specty.
- CLI: `mcp/app.ts` exporta `VIEW_META = { ui: { prefersBorder: false } }` y `commands/mcp.ts` lo añade al contenido de `resources/read`.

## Archivos

- crear packages/ui/src/review/spec-cards.ts — las cards de la spec
- crear packages/ui/src/review/spec-cards.test.ts — AC1 a AC4
- modificar packages/ui/src/app/embedded.ts — cabecera en card, la spec en cards y la marca `data-embedded`
- modificar packages/ui/src/app/embedded.test.ts — AC5; el test de AC1 busca ahora las cards
- crear packages/ui/src/theme/host-look.ts — el tema y las variables del anfitrión en la raíz
- crear packages/ui/src/theme/host-look.test.ts — AC6 y AC7
- modificar packages/ui/src/data/mcp-app.ts — pasa el `hostContext` a `HostLook` y mide el alto del contenido
- modificar packages/ui/src/data/mcp-app.test.ts — AC6 desde el anfitrión y AC8
- modificar packages/ui/src/styles.css — en el chat, sin fondo y con los colores del anfitrión
- modificar packages/cli/src/mcp/app.ts — `VIEW_META`
- modificar packages/cli/src/commands/mcp.ts — `_meta` en `resources/read`
- modificar packages/cli/test/mcp-app.test.ts — AC9
- modificar docs/ui.md — «En el chat (MCP Apps)»: las cards, los colores del anfitrión y el alto

## Tareas

- [x] T1: La spec se ve en cards compactas en la vista del chat
  - files: packages/ui/src/review/spec-cards.ts, packages/ui/src/review/spec-cards.test.ts, packages/ui/src/app/embedded.ts, packages/ui/src/app/embedded.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/spec-cards.test.ts --include src/app/embedded.test.ts && pnpm lint
- [ ] T2: La vista toma el tema, los colores y el alto del chat
  - files: packages/ui/src/theme/host-look.ts, packages/ui/src/theme/host-look.test.ts, packages/ui/src/data/mcp-app.ts, packages/ui/src/data/mcp-app.test.ts, packages/ui/src/styles.css
  - ac: AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/theme/host-look.test.ts --include src/data/mcp-app.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
- [ ] T3: El servidor pide al anfitrión una vista sin marco
  - files: packages/cli/src/mcp/app.ts, packages/cli/src/commands/mcp.ts, packages/cli/test/mcp-app.test.ts, docs/ui.md
  - ac: AC9, AC10
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-app.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Si el `color-scheme` de la vista no coincide con el del chat, el navegador pinta un fondo opaco detrás del iframe. Mitigación: la página ya declara `<meta name="color-scheme" content="light dark">`, y la raíz toma el `color-scheme` del tema del anfitrión (A5); AC10 lo comprueba en los dos anfitriones.
- R2: En VS Code las variables son `var(--vscode-*)`, que solo resuelven si el webview las define en la raíz del documento de la vista. Mitigación: sin ellas, las reservas de Specty siguen dando un texto legible, y AC10 lo comprueba.
- R3: Con fondo transparente, Progreso y Aceptación pueden verse algo distintos (sus barras fijas usan `--color-bg`). Mitigación: A4 les da el fondo del anfitrión; su paso a cards es el siguiente cambio.
