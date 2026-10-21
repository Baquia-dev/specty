# 0003 · UI web local primero, con rediseño completo

- Estado: aceptada; el framework lo actualiza el [ADR 0009](0009-angular-para-la-ui.md) (Angular en lugar de React)
- Fecha: 2026-10-20

## Contexto

- Revisar Markdown es tedioso, y por eso se aprueba sin leer.
- La UI del legacy es JavaScript sin framework, acoplado a su gobernanza.
- Una extensión de editor cubriría solo una familia de herramientas.
- Las UI dentro del chat (MCP Apps) todavía tienen un soporte desigual entre clientes.

## Decisión

- Una app web nueva (React + TypeScript), servida por el servidor local de Specty y diseñada desde cero con estándar premium. Antes de implementarla se hacen el sistema de diseño y un prototipo navegable ([ui.md](../ui.md)).
- La capa de datos se abstrae del transporte, para reutilizar después el mismo bundle en una webview de VS Code y en MCP Apps.

## Consecuencias

- El monorepo incluye una compilación de UI, y su resultado viaja dentro del paquete npm.
- Hay que proteger el servidor local: token, comprobación de `Host` y `Origin`, CSRF y, opcionalmente, WebAuthn.
- La extensión de VS Code y MCP Apps quedan para la fase 4.
