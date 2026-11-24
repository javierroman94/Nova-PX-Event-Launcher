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
| `isAdmin` filtraba la longitud de la clave y no limitaba intentos | Comparación de hashes y bloqueo tras 8 intentos fallidos por IP |
| `safeStorage` en Linux podía usar `basic_text` (llave fija) | `lib/secure-storage.js` lo trata como "sin almacén seguro" |
| IPC sin comprobar el origen | `lib/ipc-guard.js`: solo páginas de `renderer/` |
| `will-navigate` aceptaba cualquier `file://`; overlay sin bloqueo | `lockWindow()` en las dos ventanas |
| CSP sin `object-src`, `base-uri` ni `form-action` | Agregados en `index.html` y `overlay.html` |

## Pendiente (decisión del dueño)
1. **Firma de manifests.** Los datos de `data/` llegan de `raw.githubusercontent.com` sin firma. Quien tome el repositorio o la cuenta administradora puede publicar un pack no protegido con un `.jar` propio y su `sha1`. Solución: firmar `manifest.json` con Ed25519, con la llave pública en el launcher y la privada fuera del repositorio (por ejemplo guardada con `safeStorage` solo en el equipo del administrador), y verificar la firma antes de instalar. Mientras tanto, usa siempre eventos protegidos y activa la verificación en dos pasos y rama protegida en GitHub.
2. **Login de Microsoft en el navegador.** Hoy se usa la ventana embebida de `msmc`. Para igualar a Prism/Modrinth hay que registrar una aplicación propia en Azure (cliente público) y usar Device Code o PKCE con el navegador del sistema.
3. **Nicks sin dueño verificado.** En amigos y chat, el primero que reclama un nick lo conserva. Verificarlo exigiría probar la propiedad de la cuenta de Minecraft sin enviar tokens al Worker; se puede hacer con un reto firmado a través de los servidores de sesión de Mojang.
4. **Dependencias.** `npm audit` marca 7 en producción (`request`, `form-data`, `adm-zip`, `qs`, `tough-cookie`, `uuid`) que vienen de `minecraft-launcher-core`, sin arreglo compatible. Y Electron 33 ya no tiene soporte: hay que subir de versión y probar con el juego.
5. **Rate Limiting de Cloudflare.** Se puede añadir el binding `LIMITER` para un límite global (el actual es por instancia del Worker).
6. **Llave privada de soporte.** Guárdala en un gestor de contraseñas. Si se pierde, los informes sellados no se pueden abrir; si se filtra, se genera otra y se sustituye `config/soporte-informes.pub.pem`.
