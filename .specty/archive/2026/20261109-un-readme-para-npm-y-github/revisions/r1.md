---
kind: standard
---

# Un README para npm y GitHub

## Objetivo

Resuelve P370, un bloqueante de la primera versión: no hay README ni en la raíz ni en `packages/cli`, así que la página de GitHub y la de npm saldrían vacías. Con este cambio, la raíz tiene `README.md` en inglés y `README.es.md` en español, enlazados entre sí, que presentan Specty como beta pública 0.1.0 para macOS, Linux y Windows y explican de punta a punta cómo usarlo; y el paquete de npm lleva ese mismo README, copiado al empaquetar, sin una segunda copia que mantener a mano.

## Fuera de alcance

- NOTICE, la versión de `packages/cli/package.json` y el workflow de publicación (la primera publicación es a mano y luego con publicación de confianza, OIDC).
- Traducir al inglés los documentos de `docs/`: los README dicen cuáles están solo en español.
- Resultados de la suite de cumplimiento: otra tarea los mide ahora.
- Una guía de contribución, un changelog o insignias.
- Un test que mantenga la tabla de agentes de los README igual que `AGENT_CAPABILITIES`.

## Supuestos

- A1: `README.md` va en inglés, para el público de npm y de GitHub, y `README.es.md` en español, con el mismo contenido, porque todo el texto visible de Specty existe en los dos idiomas; cada uno enlaza al otro en su primera línea.
  - impacto: alto
- A2: npm solo publica el README de la carpeta del paquete (`packages/cli`, con `files: ["dist"]`), y lo incluye siempre aunque no esté en `files`. `prepack` ejecuta `build.mjs` con `--readme README.md`, que copia allí el `README.md` de la raíz; la copia no va en git (`.gitignore`), así que la única fuente es la de la raíz.
- A3: El paquete de npm no lleva `docs/` ni `README.es.md`, y npm puede resolver los enlaces relativos del README contra el `directory` del repositorio (`packages/cli`), así que los README enlazan con URLs absolutas de GitHub en la rama `main`.
- A4: La tabla de agentes copia los estados de la tabla de capacidades de `docs/ARCHITECTURE.md` §10 (`AGENT_CAPABILITIES`), sin las columnas de la prueba de extremo a extremo ni de detección, y enlaza a esa sección para el detalle de lo indirecto y lo no posible.
- A5: El ejemplo de la Action usa `Baquia-dev/specty@v0.1.0`, la etiqueta que crea la publicación de la 0.1.0 (el workflow `release.yml` publica al empujar `v<versión>`).

## Criterios de aceptación

- AC1: CUANDO alguien abre el repositorio en GitHub o el paquete en npm ENTONCES `README.md`, en inglés, dice qué es Specty y qué problema resuelve, que es una beta pública 0.1.0 para macOS, Linux y Windows, los requisitos (Node 22 o posterior y git), la instalación (`npm i -g @baquia-dev/specty` o `npx -y @baquia-dev/specty`, con el aviso de que `npx specty` es otro paquete), `specty init`, un primer cambio de punta a punta, los carriles, la UI local, los agentes con guard y lo que da cada uno, la CI (`specty ci` y la Action), el servidor MCP, exportar e importar, los enlaces a `docs/` y la licencia (Apache-2.0, y MIT-0 para lo que Specty genera en el repositorio del usuario), y enlaza a `README.es.md`.
  - test: manual
- AC2: CUANDO alguien abre `README.es.md` ENTONCES tiene las mismas secciones y el mismo contenido en español, y enlaza a `README.md`.
  - test: manual
- AC3: CUANDO un README nombra un comando o una opción de `specty` ENTONCES ese comando y esa opción salen en `specty --help` o en la ayuda de su subcomando.
  - test: manual
- AC4: CUANDO se construye el CLI con `build.mjs --readme <archivo>` ENTONCES ese archivo es una copia del `README.md` de la raíz; sin `--readme`, el build no escribe ningún README.
- AC5: CUANDO se empaqueta el CLI en seco (`npm pack --dry-run` en `packages/cli`) ENTONCES el paquete lleva `README.md`, y `git status` no muestra esa copia.
  - test: manual

## Diseño

- `build.mjs` gana la opción `--readme <archivo>`: copia `../../README.md` a ese archivo, como ya copia LICENSE y NOTICE a `dist/`. El script `prepack` de `packages/cli/package.json` la pasa con `README.md`, la carpeta del paquete, que es de donde npm toma el README; `pnpm build` y los tests no la pasan, así que no dejan copias.
- `.gitignore` ignora `/packages/cli/README.md`.
- Secciones de los README, en este orden: qué es (con el aviso de beta y las plataformas), por qué, requisitos, instalación, poner Specty en un repositorio (`init`, `doctor`, `uninstall`), el primer cambio de punta a punta, los carriles, la UI local, los agentes y las capas de cumplimiento, la CI, MCP, exportar e importar, más comandos, documentación y licencia.

## Archivos

- crear README.md — el README en inglés, para GitHub y npm
- crear README.es.md — el README en español, enlazado con el inglés
- modificar packages/cli/build.mjs — la opción `--readme <archivo>` copia allí el README de la raíz
- modificar packages/cli/package.json — `prepack` pasa `--readme README.md`, para que el paquete lleve el README
- modificar .gitignore — la copia del README en `packages/cli` no va en git
- modificar packages/cli/test/bundle.test.ts — el build con `--readme` copia el README de la raíz, y sin la opción no escribe ninguno

## Tareas

- [ ] T1: El paquete de npm lleva el README de la raíz
  - files: packages/cli/build.mjs, packages/cli/package.json, .gitignore, packages/cli/test/bundle.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/bundle.test.ts && pnpm lint
  - type: build
- [ ] T2: El README en inglés y en español
  - files: README.md, README.es.md
  - ac: AC1, AC2, AC3
  - verify: test -s README.md && test -s README.es.md
  - type: docs

## Riesgos

- R1: Los README se desfasan de la CLI con el tiempo — cada comando y opción se comprueba con la ayuda de la CLI al escribirlos, y la tabla de agentes enlaza a su fuente en ARCHITECTURE §10.
- R2: Alguien edita la copia de `packages/cli/README.md` en vez de la de la raíz — git la ignora y cada empaquetado la sobrescribe con la de la raíz.
