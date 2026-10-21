# 0007 · Nombre y organización: Specty bajo Baquia-dev

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

- En npm, `specty` (sin scope) está ocupado por un paquete de 192 bytes, sin ejecutable ni repositorio, publicado en 2022 por la cuenta `mesik`. En GitHub, el usuario `specty` también está ocupado.
- Los nombres "spec" + palabra están saturados en este nicho (specgate, specd, Spec Guard, SpecForge). En cambio, no se encontró ningún software llamado Specty.
- El nombre forma parte de los formatos (`.specty/`, trailers `Specty-*`, marcadores `specty:begin`), así que había que decidirlo antes de la fase 0.

## Decisión

- La marca y el comando se llaman `specty`.
- Repositorio: `github.com/Baquia-dev/specty`.
- Paquete npm: `@baquia-dev/specty`, que instala el comando `specty`.
- Paquetes internos: `@baquia-dev/specty-core`, `@baquia-dev/specty-ui` y `@baquia-dev/specty-exporters`.
- Los identificadores de los formatos no cambian: `.specty/`, `Specty-*` y `specty:begin`.

## Consecuencias

- Instalación: `npm i -g @baquia-dev/specty`, o `npx @baquia-dev/specty init` sin instalar.
- `npx specty` descargaría el paquete ajeno. Mitigaciones:
  - el bloque de AGENTS.md indica el respaldo `npx -y @baquia-dev/specty`;
  - los hooks invocan la ruta del binario instalado;
  - el guard bloquea `npx specty` y sus equivalentes sin scope;
  - `specty doctor` verifica que el comando resuelve a `@baquia-dev/specty`.
- Para publicar hay que crear la organización `baquia-dev` en npm (gratuita para paquetes públicos).
- Opcional: pedir el nombre `specty` sin scope por el proceso de disputas de npm, porque es un placeholder sin funcionalidad. No es un requisito.
- Pendiente antes de invertir en la marca: buscarla en la WIPO Global Brand Database y en la oficina de marcas del país (clases 9 y 42).
