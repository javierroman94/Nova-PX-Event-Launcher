# Seguridad y privacidad

Auditoría hecha sobre el código del repositorio público. Resume qué se revisó, qué se corrigió y qué queda como decisión del dueño.

## Verificado y correcto
- Sin secretos en el árbol ni en el historial (443 commits). Los únicos hallazgos son datos falsos en pruebas.
- Los tokens de Microsoft, Xbox y Minecraft nunca salen al Worker: `lib/telemetry.js` solo envía id aleatorio, nick, premium, versión y sistema.
- El token de renovación, el token de administrador y el webhook se guardan con `safeStorage`, sin respaldo en texto plano.
- Ventanas con `contextIsolation`, `sandbox` y sin `nodeIntegration`; CSP estricta; permisos del navegador denegados; enlaces solo `https`.
- `ADMIN_KEY` es un secreto de Cloudflare. El Worker de la mascota ya limitaba por usuario, IP y global.
- Eventos protegidos: AES-256-GCM, IV aleatorio, sal propia, AAD por archivo y ninguna llave fija. Quien controle el repositorio no puede falsificar mods de un evento protegido sin la contraseña.

## Corregido en esta revisión
| Hallazgo | Corrección |
|---|---|
| Token de acceso de Minecraft visible en la consola (minecraft-launcher-core imprime los argumentos) | `lib/redact.js` limpia tokens, JWT y cabeceras en todo log e informe |
| Informe "protegido" cifrado con una llave fija del código público | Se sella con llave pública (`lib/seal.js`); la privada no está en el repositorio |
| `scrypt` N=2^15 | Sobres nuevos con N=2^17 y parámetros guardados en `kdf`; los antiguos siguen abriéndose |
| Mods de packs no protegidos sin hash obligatorio | `sha1` obligatorio y validado en `lib/pack-install.js` |
| `/ads/track` y `/ping` sin límite; claves inventadas en KV | Límite por IP, solo anuncios que existen en `data/ads.json`, `X-Content-Type-Options` |
| Amigos en tiempo real (`/presence/ws`, 1.0.189) | El nick va en la URL y el token en el primer mensaje; sin autenticar se cierra; máximo 3 conexiones por nick y 30 conexiones por minuto por IP; mensajes limitados (20/min), solicitudes (15/h), invitaciones (20/10 min); bloquear oculta al bloqueado |
| Códigos para compartir modpacks (`/pack`, 1.0.188) | Solo ids públicos de Modrinth validados (`worker/pack.mjs`), 6 creaciones por hora por IP, 40 lecturas por minuto, caducan a los 90 días; el launcher vuelve a validar lo que recibe y solo baja de `cdn.modrinth.com` con su sha1 |
| `isAdmin` filtraba la longitud de la clave y no limitaba intentos | Comparación de hashes y bloqueo tras 8 intentos fallidos por IP |
| `safeStorage` en Linux podía usar `basic_text` (llave fija) | `lib/secure-storage.js` lo trata como "sin almacén seguro" |
| IPC sin comprobar el origen | `lib/ipc-guard.js`: solo páginas de `renderer/` |
| `will-navigate` aceptaba cualquier `file://`; overlay sin bloqueo | `lockWindow()` en las dos ventanas |
| CSP sin `object-src`, `base-uri` ni `form-action` | Agregados en `index.html` y `overlay.html` |

## Permisos por rol
El panel de administración tiene tres roles: Dueño (todo), Administrador (todo menos Permisos y la llave de firma) y Moderador (advertencias, usuarios y noticias), más casillas por persona. Se comprueban en el programa en cada acción y ocultan las pestañas que no corresponden. Límite: quien tenga un token de GitHub con escritura puede escribir en el repositorio sin pasar por el launcher. Lo protege la firma: `manifest`, `plugins`, `recommended`, `launcher` y `admins` solo son válidos si los firma el dueño. `news`, `ads`, `team`, `events` y `nicks` no están firmados.

## Pendiente (decisión del dueño)
1. **Firma de datos (hecha, falta tu llave).** `manifest`, `plugins`, `recommended`, `launcher` y `admins` de `data/` van firmados con Ed25519 (`lib/firma.js`, firma en `data/<nombre>.firma.json`). El launcher trae la llave pública en `config/firma-datos.pub.pem` y rechaza lo que no cuadre, sea un archivo cambiado o una versión más vieja que la conocida. La llave privada no está en el repositorio: se importa en el modo administrador (Ajustes del launcher, "Llave de firma de datos") y se guarda cifrada con `safeStorage`; publicar sin ella se bloquea. Para firmar a mano: `node tools/firmar-datos.js llave.PRIVADA.pem`. Quedan sin firmar `news`, `ads`, `team`, `events`, `admins` y `nicks`, porque no deciden qué se descarga ni qué se ejecuta. Si alguien más publica, necesita la misma llave en su launcher. Tampoco cubre el canal de actualizaciones del propio launcher (GitHub Releases): quien controle la cuenta puede publicar una versión nueva; protege la cuenta con verificación en dos pasos y rama protegida.
2. **Login de Microsoft en el navegador.** Hoy se usa la ventana embebida de `msmc`. Para igualar a Prism/Modrinth hay que registrar una aplicación propia en Azure (cliente público) y usar Device Code o PKCE con el navegador del sistema.
3. **Nicks sin dueño verificado (resuelto para premium en 1.0.189).** Las cuentas premium verifican su nick con `sessionserver.mojang.com` (`join` desde el launcher con el token, `hasJoined` desde el Worker sin token): el dueño real recupera el nick y nadie más puede usarlo. Las cuentas no premium siguen con «el primero que lo reclama». Texto anterior: En amigos y chat, el primero que reclama un nick lo conserva. Verificarlo exigiría probar la propiedad de la cuenta de Minecraft sin enviar tokens al Worker; se puede hacer con un reto firmado a través de los servidores de sesión de Mojang.
4. **Dependencias.** `npm audit` marca 7 en producción (`request`, `form-data`, `adm-zip`, `qs`, `tough-cookie`, `uuid`) que vienen de `minecraft-launcher-core`, sin arreglo compatible. Y Electron 33 ya no tiene soporte: hay que subir de versión y probar con el juego.
5. **Rate Limiting de Cloudflare.** Se puede añadir el binding `LIMITER` para un límite global (el actual es por instancia del Worker).
6. **Llaves privadas.** Hay dos: la de soporte (`soporte-informes.PRIVADA.pem`, abre informes) y la de firma (`firma-datos.PRIVADA.pem`, firma los datos). Guárdalas en un gestor de contraseñas. Si se pierde la de soporte, los informes sellados no se pueden abrir. Si se pierde o se filtra la de firma, hay que generar otra, cambiar `config/firma-datos.pub.pem` y publicar una versión nueva del launcher; los launchers viejos no aceptarán los datos firmados con la nueva.
