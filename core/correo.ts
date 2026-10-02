import type { EnvBase } from "./tipos";

/**
 * Envío de correos de notificación vía Resend (https://resend.com),
 * compartido por los módulos que avisan (cotización, reseñas, etc.).
 *
 * REMITENTE POR DEFECTO — el dominio prestado de Resend. Sirve desde el
 * primer minuto, sin dominio propio. Límites: solo se puede enviar a la
 * dirección con que se creó la cuenta de Resend, y el remitente dice
 * "resend.dev". Cuando haya dominio propio, se verifica en Resend y se
 * cambia la variable RESEND_FROM — sin tocar código.
 *
 * Modo demo: si RESEND_API_KEY no está configurado, no lanza error ni
 * bloquea el flujo; deja constancia en los logs de que el correo se habría
 * enviado. Así el formulario queda funcional y solo falta la clave real.
 */
export async function sendNotificationEmail(
  env: EnvBase,
  params: {
    subject: string;
    html: string;
    replyTo?: string;
    /** Remitente de respaldo si no hay RESEND_FROM. Ej: "Mi Taller <onboarding@resend.dev>". */
    remitentePorDefecto?: string;
  }
): Promise<{ sent: boolean; simulated: boolean }> {
  // LIMPIAR LO QUE VIENE DEL PANEL DE CLOUDFLARE. Estas variables las pega
  // una persona a mano, y copiar una clave arrastra con frecuencia un
  // espacio o salto de línea invisible al final. Con eso,
  // `Authorization: Bearer <clave>` deja de ser una cabecera HTTP válida y
  // la petición revienta ANTES de salir, con un "TypeError: Invalid header
  // value" que no deja rastro en Resend. Costó una noche.
  const limpiar = (valor: unknown) =>
    typeof valor === "string"
      ? valor.replace(/\s+$/g, "").replace(/^\s+/g, "")
      : "";

  const clave = limpiar(env.RESEND_API_KEY);
  const destino = limpiar(env.ADMIN_NOTIFY_EMAIL);
  const remitente =
    limpiar(env.RESEND_FROM) ||
    params.remitentePorDefecto ||
    "Notificaciones <onboarding@resend.dev>";

  if (!clave || !destino) {
    console.log("[email:simulado]", params.subject);
    return { sent: false, simulated: true };
  }

  // Una clave con caracteres raros en medio (no solo en los bordes) también
  // rompería la cabecera. Mejor decirlo con nombre y apellido que dejar que
  // reviente con un TypeError genérico.
  if (!/^[\x21-\x7e]+$/.test(clave)) {
    console.error(
      "[email:error] RESEND_API_KEY tiene caracteres que no pueden ir en una cabecera HTTP.",
      "Largo:",
      clave.length
    );
    return { sent: false, simulated: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente,
      to: [destino],
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });

  if (!res.ok) {
    // El detalle va al registro del servidor. Los dos errores más comunes:
    //   403 "testing emails"    -> el destinatario no es el correo de la
    //                              cuenta y no hay dominio propio verificado.
    //   422 domain not verified -> RESEND_FROM usa un dominio sin verificar.
    console.error("[email:error]", res.status, await res.text());
    return { sent: false, simulated: false };
  }

  return { sent: true, simulated: false };
}
