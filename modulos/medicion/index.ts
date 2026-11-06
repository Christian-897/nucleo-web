/**
 * Módulo medicion: aviso de cookies + herramientas de medición opcionales.
 * Cada sitio activa SOLO las que usa: Google Analytics 4 y el píxel de Meta.
 * Todo corre en el navegador; no hay variables nuevas en Cloudflare.
 */
export {
  CLAVE_DECISION,
  DIAS_DECISION,
  decisionVigente,
  leerDecision,
  guardarDecision,
  cuandoAcepte,
  iniciarAvisoCookies,
  type Decision,
} from "./consentimiento";
export {
  EVENTO_AGREGAR,
  EVENTO_INICIAR_COMPRA,
  EVENTO_COMPRA,
  emitirAgregar,
  emitirIniciarCompra,
  avisarCompraConfirmada,
  escucharEventos,
  type EventoTienda,
  type ProductoMedido,
} from "./eventos";
export { iniciarPixelMeta, idPixelMetaValido, eventoParaMeta, type OpcionesPixelMeta } from "./pixel-meta";
export { iniciarGoogleAnalytics, idGoogleAnalyticsValido, eventoParaGoogle, type OpcionesGoogleAnalytics } from "./google-analytics";
