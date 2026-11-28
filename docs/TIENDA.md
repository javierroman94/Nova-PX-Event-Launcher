# Publicar en Microsoft Store

La Store firma el paquete con el certificado de Microsoft, así que a los jugadores **no les sale la alerta de SmartScreen**.

Nova PX ya está publicada: <https://apps.microsoft.com/detail/9mvjl4gf5wj8>.

## Datos de la app

Están en `build/microsoft-store.json` y no son secretos: van dentro de cada paquete.

| Dato | Valor |
|---|---|
| Id. de producto de la Store | `9MVJL4GF5WJ8` |
| `Package/Identity/Name` | `NOVAPX.NovaPXEventLauncher` |
| `Package/Identity/Publisher` | `CN=26F893CA-1915-4DC9-9234-2DBF2F6F192E` |
| `PublisherDisplayName` | `NOVA PX` |
| Formato | MSIX (lo genera electron-builder con el destino `appx`) |
| Arquitectura | x64 |

La identidad sale del paquete 1.0.108 que se subió a mano el 20-11-2026 (flujo «Paquete para Microsoft Store»). Si Partner Center muestra otros datos en **Gestión de productos → Identidad del producto**, cambia ese archivo.

## Envío automático con cada versión

Cuando publicas una versión (cambias `version` en `package.json` en `main`, o subes una etiqueta `vX.Y.Z`), el flujo **Publicar versión** (`.github/workflows/release.yml`) hace esto:

1. `etiquetar` y `verificar` comprueban que la versión es nueva. Ya funcionaban así.
2. `release` corre las pruebas, compila el `.exe` y el AppImage y los publica en GitHub Releases. Ya funcionaba así.
3. En Windows, **después** de publicar en GitHub, el paso «Paquete de Microsoft Store»:
   - genera el MSIX reutilizando la app ya compilada (`--prepackaged dist/win-unpacked`), sin volver a empaquetar Electron;
   - comprueba con `node tools/tienda.js validar` la identidad, el publisher, la versión `X.Y.Z.0` y la arquitectura;
   - lo guarda como artefacto `nova-px-msix`.

   Si este paso falla, GitHub Releases ya quedó publicado y no se deshace.
4. El trabajo `tienda` solo corre si la variable `STORE_AUTO_PUBLISH` vale `true`. Además, espera tu aprobación en el entorno `microsoft-store`. Luego:
   - vuelve a validar el paquete y se conecta a Partner Center con la herramienta oficial **Microsoft Store Developer CLI** (`msstore` v0.4.4);
   - lee el último envío con `msstore submission get` y decide qué hacer (`tools/tienda.js decidir`):
     - **enviar:** la Store tiene una versión anterior publicada y no hay otro envío abierto.
     - **ya enviado:** esa versión ya está en la Store o en certificación. No se repite.
     - **envío abierto:** hay un envío tuyo abierto en Partner Center. `msstore publish` lo borraría, así que no se toca. El trabajo falla para avisarte.
     - **versión vieja:** la Store ya tiene una versión más nueva.
   - si toca enviar, ejecuta `msstore publish` y espera a que Microsoft reciba y procese el envío;
   - en el resumen de la ejecución escribe qué pasó y la salida de `msstore submission status`.

Después de enviar, Microsoft certifica la versión (suele tardar de horas a unos días) y la publica sola. El resultado lo ves en Partner Center o con `msstore submission status 9MVJL4GF5WJ8`. El flujo no espera la certificación: dejaría la ejecución abierta días.

### Qué está protegido
- **Solo desde versiones de `main`.** «Publicar versión» solo se dispara con `main` o con etiquetas `v*`, y el trabajo exige una etiqueta `vX.Y.Z`. Una rama `revision-*` no puede enviar nada.
- **Aprobación manual.** El entorno `microsoft-store` pide que un revisor apruebe cada envío. Ahí también se guardan los secretos, así que ningún otro trabajo puede leerlos.
- **Interruptor.** Sin `STORE_AUTO_PUBLISH=true`, el trabajo ni arranca.
- **Modo borrador.** Con `STORE_SOLO_BORRADOR=true`, el paquete se sube a Partner Center como borrador (`--noCommit`) y no va a certificación. Así puedes revisarlo y enviarlo a mano.
- **Sin repetir.** No se envía una versión que la Store ya tiene, y solo corre un envío a la vez (`concurrency: microsoft-store`).
- **Secretos.** Se pasan por variables de entorno y la salida de `msstore reconfigure` se descarta. Las acciones están fijadas a SHA completo.
- **Actualizaciones.** El actualizador de GitHub no cambia. En la versión de la Store se desactiva solo (`process.windowsStore`) y actualiza la Store.

## Lo que tienes que hacer una vez (en Partner Center, Entra y GitHub)

1. **Asociar Microsoft Entra ID a Partner Center.** Partner Center → ⚙️ **Configuración de la cuenta → Administración de usuarios → Aplicaciones de Microsoft Entra**. Si te pide un inquilino (tenant), asocia uno existente o crea uno nuevo desde ahí (es gratis).
2. **Crear la aplicación de Entra.** En esa misma pantalla, **Crear aplicación de Azure AD** (o registra una en <https://entra.microsoft.com> → Registros de aplicaciones y agrégala). Dale el rol **Administrador (Manager)**: Microsoft lo exige para publicar por API.
3. **Crear el secreto.** En la aplicación → **Certificados y secretos → Nuevo secreto de cliente**. Copia el **valor** en ese momento: no se vuelve a mostrar. Anota la fecha de caducidad y renuévalo antes de que caduque.
4. **Anotar los identificadores:**
   - **Id. de inquilino** (Tenant ID) e **Id. de cliente** (Application / client ID), de la aplicación de Entra.
   - **Id. de vendedor** (Seller ID), de Partner Center → Configuración de la cuenta → **Información legal / Configuración del desarrollador**.
5. **Crear el entorno en GitHub.** Repositorio → **Settings → Environments → New environment** → `microsoft-store`. Configúralo así:
   - **Required reviewers:** tú.
   - **Deployment branches and tags → Selected branches and tags:** agrega la etiqueta `v*` (el trabajo corre sobre la etiqueta de la versión).
   - **Environment secrets** (no en los secretos del repositorio):

     | Secreto | Qué es |
     |---|---|
     | `STORE_TENANT_ID` | Id. de inquilino de Entra |
     | `STORE_SELLER_ID` | Id. de vendedor de Partner Center |
     | `STORE_CLIENT_ID` | Id. de cliente de la aplicación de Entra |
     | `STORE_CLIENT_SECRET` | Valor del secreto de cliente |
6. **Activar.** Repositorio → Settings → **Secrets and variables → Actions → Variables**:
   - `STORE_SOLO_BORRADOR` = `true` para la primera vez (recomendado).
   - `STORE_AUTO_PUBLISH` = `true` para encender el envío.
7. **Primera prueba.** En la próxima versión, aprueba el trabajo `tienda`. Revisa el borrador en Partner Center y envíalo a certificación a mano. Si todo se ve bien, borra `STORE_SOLO_BORRADOR` (o ponlo en `false`): desde entonces cada versión se envía sola, con tu aprobación.

Para apagarlo, pon `STORE_AUTO_PUBLISH` en `false`.

## Limitaciones
- La automatización solo actualiza una app que ya está publicada y es **gratuita**: la API de Microsoft todavía no admite productos de pago.
- Solo se cambia el **paquete**: la descripción, las capturas y los precios se quedan como están en Partner Center.
- Si tienes un envío abierto a mano en Partner Center cuando sale una versión, el trabajo no lo toca y falla. Termínalo o bórralo y vuelve a ejecutar el trabajo `tienda` desde la ejecución.
- Microsoft puede rechazar la certificación. Eso se ve en Partner Center, no en GitHub.
- La Store y GitHub pueden tener versiones distintas durante unos días mientras dura la certificación.
- Microsoft Store Developer CLI está en *preview*: si Microsoft cambia sus comandos, hay que actualizar `release.yml`.

## Paquete a mano (sin enviar)
GitHub → **Actions → Paquete para Microsoft Store → Run workflow**. Ya no hace falta llenar los campos, porque usa `build/microsoft-store.json`. Genera y valida el `.appx` y lo deja como artefacto `nova-px-msix`. No envía nada a la Store.
