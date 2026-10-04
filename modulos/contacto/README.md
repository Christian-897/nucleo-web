# Módulo: contacto

Arma los enlaces de **WhatsApp, teléfono, correo y redes sociales** a partir
de los datos del sitio, y descarta lo que no sea válido.

- Acepta el número en cualquier formato (`+56 9 1234 5678`, `912345678`…).
- Las redes aceptan enlace completo o `@usuario`. Solo `https` y el dominio
  de esa red; un enlace vacío o de plantilla (`https://instagram.com/`) no se muestra.
- Sin secretos y sin estado: sirve en páginas, Functions y navegador.

> Los datos de cada cliente van en la configuración del **sitio**, nunca en
> este repositorio (es público).

## Uso

```ts
import { enlacesContacto } from "nucleo-web/contacto";

const c = enlacesContacto({
  whatsapp: "+56 9 1234 5678",
  mensajeWhatsapp: "Hola, vengo del sitio web.",
  email: "contacto@mitienda.cl",
  redes: { instagram: "@mitienda", facebook: "https://facebook.com/mitienda" },
});

c.whatsapp?.url   // https://wa.me/56912345678?text=...
c.whatsapp?.texto // +56 9 1234 5678
c.redes           // [{ id: "instagram", etiqueta, url, texto: "@mitienda", externo }]
c.todos           // todo junto, sirve directo para el aviso de construcción
```

Funciones sueltas: `normalizarTelefono`, `formatearTelefono`, `enlaceWhatsapp`,
`enlaceTelefono`, `enlaceCorreo`, `urlRed`, `etiquetaRed`.
