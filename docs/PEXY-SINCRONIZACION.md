# Sincronizar a Pexy entre el launcher y la web

Estado: **diseño, sin implementar.** Hoy cada Pexy guarda su progreso por separado:

- **Launcher:** en el `localStorage` del launcher, con la clave `px.pet.life`.
- **Web:** en el `localStorage` del navegador, con la clave `novapx.pexy.web.v2`.

La web lo dice en pantalla. Este documento explica qué hay en el proyecto y qué haría falta para sincronizar de verdad, sin trucos con `localStorage`.

## Qué existe hoy

| Pieza | Qué hace | ¿Sirve para sincronizar? |
|---|---|---|
| Worker principal (`worker/index.mjs`) | Contador de uso, amigos y presencia (Durable Object `Presence`) | Sí, como base: ya tiene almacenamiento por jugador con límites de peticiones |
| Identidad de amigos (`lib/presence-token.js`) | Token aleatorio por nick, guardado con `safeStorage`. El Worker guarda su SHA-256 la primera vez que se usa ese nick | Sirve en el launcher, pero **no es una cuenta verificada**: el primero que usa un nick se lo queda. No prueba que eres dueño de la cuenta de Minecraft |
| Login de Microsoft (`msmc`) | Sesión de Minecraft en el PC | Sus tokens **nunca** salen del equipo (regla de `CLAUDE.md`). No se pueden enviar al Worker para probar la identidad |
| Reglas de Pexy (`renderer/pet-life.js`) | Módulo puro (UMD), sin DOM, con pruebas | Sí: el mismo archivo puede correr en el Worker y validar cada acción en el servidor |

La web no tiene ninguna forma de iniciar sesión.

## Propuesta

### 1. Identidad y vinculación

1. El launcher ya tiene `nick + token de presencia`. Se usa para autenticarse en una ruta nueva, `POST /pexy/*`.
2. **Vincular la web:** en el launcher, «Vincular con la web» pide un código de 8 caracteres de un solo uso que dura 10 minutos (`POST /pexy/link/start`). El jugador lo escribe en la web (`POST /pexy/link/finish`). El Worker le da a ese navegador un token de dispositivo propio, aleatorio de 32 bytes, y guarda solo su hash. Se puede revocar desde el launcher.
3. El token del navegador se guarda en `localStorage`. Es el único sitio posible en una página estática, y por eso caduca a los 90 días y se puede revocar. **Nunca** se envían tokens de Microsoft, Xbox ni Minecraft.
4. **Limitación:** mientras la identidad sea «el primero que usa el nick», la sincronización tiene la misma garantía que los amigos. Para algo más fuerte habría que verificar la cuenta de Minecraft en el servidor. Eso queda pendiente con la migración de OAuth (ver `CLAUDE.md`).

### 2. El servidor manda

- El cliente **no envía el estado**: envía **acciones** (`feed`, `pet`, `play`, `sleep`, `game:<id>:<puntos>`, `equip`, `design`, `name`).
- El Worker aplica cada acción con el mismo `pet-life.js`, usando **su hora**:
  - pausa antiautoclic;
  - tope diario de XP: 60 por cuidados y 72 por minijuegos;
  - barras llenas;
  - sin energía no hay minijuego;
  - accesorios solo si están desbloqueados.
- Las puntuaciones de los minijuegos no se pueden comprobar, porque se juegan en el cliente. Por eso cuentan como máximo 40 puntos por partida y nunca superan el tope diario de XP.
- **Límites:** 60 acciones por minuto por jugador (más el `LIMITER` por IP que ya existe) y como mucho 1 estado guardado por jugador en el Durable Object.

### 3. Sin conexión y conflictos

- Sin red, cada cliente sigue con su copia local y guarda una **cola de acciones** con la hora local.
- Al reconectar, envía la cola (como mucho 200 acciones, de las últimas 48 h). El servidor las aplica en orden con estas reglas:
  - las horas futuras se ajustan a la hora del servidor;
  - las de antes de la última sincronización se aplican en ese momento;
  - las repetidas se descartan con un `id` por acción.
- Nombre, diseño y accesorio: gana el último cambio que recibe el servidor.
- El servidor responde con el estado oficial y el cliente lo reemplaza.

### 4. Lo que se necesita para activarlo

1. **Aprobación del dueño** para añadir rutas `/pexy/*` al Worker principal. Al unir a `main` se despliega solo: `worker/*` está en las rutas que vigila Workers Builds.
2. Una **migración de Durable Object** nueva (`PexyState`, por ejemplo con el tag `v2`), o reutilizar `Presence` con claves `pexy:<nick>`. Reutilizar evita migrar.
3. **Ningún secreto nuevo:** los tokens son aleatorios y se guardan con hash.
4. **Pruebas:** reutilizar `test/pet-life.test.js` en el Worker y añadir pruebas de vinculación, revocación, reintentos y cola sin conexión.
5. Actualizar `PRIVACY.md`: se guardaría en el servidor el estado de Pexy (nick, barras, XP, nivel, accesorios y personalidad).
