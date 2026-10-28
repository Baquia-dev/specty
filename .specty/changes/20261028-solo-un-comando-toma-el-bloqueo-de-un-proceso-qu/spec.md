---
kind: standard
follows:
  - 20261027-un-solo-comando-a-la-vez-sobre-cada-cambio
---

# Solo un comando toma el bloqueo de un proceso que ya no existe

## Objetivo

El bloqueo de un cambio cuyo proceso ya no existe no cuenta, y el siguiente comando lo reemplaza. Pero si dos comandos lo encuentran a la vez, los dos lo borran y crean el suyo, y uno puede borrar el que el otro acaba de crear: los dos creerían tener el cambio. Con este cambio, para reemplazar un bloqueo muerto un comando debe tomar antes un permiso exclusivo y breve (`<id>.json.claim`), y comprobar con él tomado que el bloqueo sigue muerto. El que no lo consigue se niega como ante cualquier bloqueo vivo.

## Fuera de alcance

- Un permiso de reemplazo que también deja un proceso caído: si su proceso ya no existe, el siguiente lo borra, como el bloqueo.

## Supuestos

- A1: El permiso es un archivo junto al bloqueo, `.git/common/specty/locks/<id>.json.claim`, creado igual (escrito aparte y enlazado), con el pid y la hora de quien reemplaza. Se borra en cuanto el reemplazo termina, también tras un fallo.
- A2: Mientras otro proceso vivo tiene el permiso, el comando se niega con la tarjeta del cambio ocupado, que nombra a ese proceso.

## Criterios de aceptación

- AC1: CUANDO un comando encuentra el bloqueo de un proceso que ya no existe mientras otro proceso vivo lo está reemplazando ENTONCES se niega con la tarjeta del cambio ocupado, sin borrar nada.
- AC2: CUANDO el permiso de reemplazo lo dejó un proceso que ya no existe ENTONCES no cuenta, y el comando reemplaza el bloqueo muerto como siempre y no deja ningún permiso.

## Archivos

- modificar packages/cli/src/store/lock.ts — el permiso de reemplazo
- modificar packages/cli/test/lock.test.ts — los dos casos
- modificar docs/formats.md — §1: el permiso junto al bloqueo
- modificar docs/ARCHITECTURE.md — §9: cómo se reemplaza un bloqueo muerto

## Tareas

- [x] T1: Reemplazar un bloqueo muerto pide un permiso exclusivo
  - files: packages/cli/src/store/lock.ts, packages/cli/test/lock.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/lock.test.ts test/shell-snapshot.test.ts
  - type: fix
  - notes: documenta el permiso en docs/formats.md §1 y ARCHITECTURE §9.
