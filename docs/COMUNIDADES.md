# Comunidades (eventos por código)

Sagitta es un launcher limpio. Un evento (Nova PX, el de otro equipo…) **solo aparece cuando el jugador escribe el código de su comunidad**. Cada comunidad vive en **su propio repositorio de GitHub**, así nada se mezcla y no se llena el repositorio del launcher.

## Para el jugador
1. Inicio → **Unirme con un código** (o Ajustes → Comunidades → *Añadir con código*).
2. Aparece una pestaña con el evento, el historial y el equipo de esa comunidad.
3. Con varias comunidades, el selector **Comunidad** de la barra lateral cambia de una a otra.
4. *Salir* oculta la comunidad; tus mundos y archivos se conservan.

## Para el organizador
1. Crea un repositorio (puede ser público) con esta estructura en la carpeta `data/`:
   - `manifest.json` (con `event.id`), `events.json`, `team.json`, `news.json`, `admins.json`
   - Puedes partir de los archivos de la carpeta [`data/`](../data) de este repositorio.
2. Crea un token fine-grained solo para ese repositorio (Contents: lectura y escritura).
3. Ajustes → **Crear comunidad**: pega el token, escribe nombre, repositorio (`usuario/repo`) y los nicks propietarios.
4. Se genera un código `XXXX-XXXX-XXXX-XXXX`. **Compártelo solo con tus jugadores.**

Solo el dueño del launcher puede crear comunidades. Los datos del registro se guardan cifrados (scrypt + AES-256-GCM) en `data/communities.json`: sin el código no se puede leer a qué repositorio apunta.

## Permisos: quién administra cada evento
- El **dueño del launcher** (tú) decide quién administra cada comunidad: Ajustes → *Crear comunidad* → en cada comunidad escribe los nicks y pulsa **Guardar permisos**. Puedes cambiarlos cuando quieras, y **Retirar código** oculta la comunidad.
- Los administradores de una comunidad solo ven el modo administrador cuando esa comunidad está activa, y publican únicamente en **su** repositorio con **su** token. Nunca pueden tocar el evento de otra comunidad.
- Los cambios llegan a los jugadores al abrir el launcher (necesitan internet).
- Además, un administrador puede autorizar a otros nicks dentro de su evento con `data/admins.json` de su repositorio.

## Notas
- El código no es una contraseña fuerte: quien lo reciba puede reenviarlo. Si se filtra, crea otra comunidad y retira la anterior.
- Los mods cifrados del evento siguen la misma regla de cada repositorio.
