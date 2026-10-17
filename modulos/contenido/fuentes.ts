/**
 * Tipografías disponibles: una LISTA CERRADA y curada. Todas son de Google
 * Fonts (licencia libre), pero el sitio las sirve desde su propio dominio
 * (más rápido, sin cookies de terceros y compatible con una CSP estricta):
 *
 *   /fuentes/<id>/fuente.css   + sus archivos .woff2 (solo letras latinas)
 *
 * Esos archivos se generan una vez con `scripts/copiar-fuentes.ts` (ver
 * README del módulo). El navegador descarga SOLO la tipografía elegida.
 */
export type RolFuente = "titulo" | "texto" | "firma";

export interface Fuente {
  id: string;
  nombre: string;
  /** Valor de font-family (con respaldos). */
  familia: string;
  roles: RolFuente[];
  /** Paquete de Fontsource del que se copian los archivos. */
  paquete: string;
  /** Hojas del paquete que se copian (variable: "index.css"; fija: un archivo por grosor). */
  archivos: string[];
}

export const FUENTES: Fuente[] = [
  // Títulos (con personalidad)
  { id: "caveat-brush", nombre: "Caveat Brush", familia: '"Caveat Brush", "Comic Sans MS", cursive', roles: ["titulo"], paquete: "@fontsource/caveat-brush", archivos: ["400.css"] },
  { id: "pacifico", nombre: "Pacifico", familia: '"Pacifico", cursive', roles: ["titulo"], paquete: "@fontsource/pacifico", archivos: ["400.css"] },
  { id: "fredoka", nombre: "Fredoka", familia: '"Fredoka Variable", "Fredoka", system-ui, sans-serif', roles: ["titulo", "texto"], paquete: "@fontsource-variable/fredoka", archivos: ["index.css"] },
  { id: "playfair-display", nombre: "Playfair Display", familia: '"Playfair Display Variable", "Playfair Display", Georgia, serif', roles: ["titulo"], paquete: "@fontsource-variable/playfair-display", archivos: ["index.css"] },
  { id: "amatic-sc", nombre: "Amatic SC", familia: '"Amatic SC", cursive', roles: ["titulo"], paquete: "@fontsource/amatic-sc", archivos: ["700.css"] },
  { id: "comfortaa", nombre: "Comfortaa", familia: '"Comfortaa Variable", "Comfortaa", system-ui, sans-serif', roles: ["titulo", "texto"], paquete: "@fontsource-variable/comfortaa", archivos: ["index.css"] },
  // Texto (legibles)
  { id: "nunito", nombre: "Nunito", familia: '"Nunito Variable", "Nunito", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/nunito", archivos: ["index.css"] },
  { id: "quicksand", nombre: "Quicksand", familia: '"Quicksand Variable", "Quicksand", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/quicksand", archivos: ["index.css"] },
  { id: "poppins", nombre: "Poppins", familia: '"Poppins", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource/poppins", archivos: ["400.css", "600.css", "700.css"] },
  { id: "lato", nombre: "Lato", familia: '"Lato", system-ui, sans-serif', roles: ["texto"], paquete: "@fontsource/lato", archivos: ["400.css", "700.css"] },
  { id: "montserrat", nombre: "Montserrat", familia: '"Montserrat Variable", "Montserrat", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/montserrat", archivos: ["index.css"] },
  { id: "raleway", nombre: "Raleway", familia: '"Raleway Variable", "Raleway", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/raleway", archivos: ["index.css"] },
  // ── Agregadas para Isatin (v0.25.0): marca elegante ──
  // Serif de lectura (textos y títulos)
  { id: "lora", nombre: "Lora", familia: '"Lora Variable", "Lora", Georgia, serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/lora", archivos: ["index.css"] },
  { id: "eb-garamond", nombre: "EB Garamond", familia: '"EB Garamond Variable", "EB Garamond", Garamond, Georgia, serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/eb-garamond", archivos: ["index.css"] },
  { id: "libre-baskerville", nombre: "Libre Baskerville", familia: '"Libre Baskerville", Baskerville, Georgia, serif', roles: ["texto", "titulo"], paquete: "@fontsource/libre-baskerville", archivos: ["400.css", "700.css"] },
  { id: "source-serif-4", nombre: "Source Serif 4", familia: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/source-serif-4", archivos: ["index.css"] },
  { id: "crimson-pro", nombre: "Crimson Pro", familia: '"Crimson Pro Variable", "Crimson Pro", Georgia, serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/crimson-pro", archivos: ["index.css"] },
  { id: "merriweather", nombre: "Merriweather", familia: '"Merriweather Variable", "Merriweather", Georgia, serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/merriweather", archivos: ["index.css"] },
  // Serif de lujo (solo títulos: muy finas o decorativas para párrafos)
  { id: "cormorant-garamond", nombre: "Cormorant Garamond", familia: '"Cormorant Garamond Variable", "Cormorant Garamond", Garamond, Georgia, serif', roles: ["titulo"], paquete: "@fontsource-variable/cormorant-garamond", archivos: ["index.css"] },
  { id: "dm-serif-display", nombre: "DM Serif Display", familia: '"DM Serif Display", Georgia, serif', roles: ["titulo"], paquete: "@fontsource/dm-serif-display", archivos: ["400.css"] },
  { id: "bodoni-moda", nombre: "Bodoni Moda", familia: '"Bodoni Moda Variable", "Bodoni Moda", Didot, Georgia, serif', roles: ["titulo"], paquete: "@fontsource-variable/bodoni-moda", archivos: ["index.css"] },
  { id: "cinzel", nombre: "Cinzel", familia: '"Cinzel Variable", "Cinzel", Georgia, serif', roles: ["titulo"], paquete: "@fontsource-variable/cinzel", archivos: ["index.css"] },
  // Sin serif limpias (textos y títulos)
  { id: "inter", nombre: "Inter", familia: '"Inter Variable", "Inter", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/inter", archivos: ["index.css"] },
  { id: "open-sans", nombre: "Open Sans", familia: '"Open Sans Variable", "Open Sans", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/open-sans", archivos: ["index.css"] },
  { id: "dm-sans", nombre: "DM Sans", familia: '"DM Sans Variable", "DM Sans", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/dm-sans", archivos: ["index.css"] },
  { id: "work-sans", nombre: "Work Sans", familia: '"Work Sans Variable", "Work Sans", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/work-sans", archivos: ["index.css"] },
  { id: "jost", nombre: "Jost", familia: '"Jost Variable", "Jost", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/jost", archivos: ["index.css"] },
  { id: "manrope", nombre: "Manrope", familia: '"Manrope Variable", "Manrope", system-ui, sans-serif', roles: ["texto", "titulo"], paquete: "@fontsource-variable/manrope", archivos: ["index.css"] },
  // Sin serif elegante (solo títulos)
  { id: "josefin-sans", nombre: "Josefin Sans", familia: '"Josefin Sans Variable", "Josefin Sans", system-ui, sans-serif', roles: ["titulo"], paquete: "@fontsource-variable/josefin-sans", archivos: ["index.css"] },
  // Firma (el nombre de la marca)
  { id: "sacramento", nombre: "Sacramento", familia: '"Sacramento", "Brush Script MT", cursive', roles: ["firma"], paquete: "@fontsource/sacramento", archivos: ["400.css"] },
  { id: "great-vibes", nombre: "Great Vibes", familia: '"Great Vibes", "Brush Script MT", cursive', roles: ["firma"], paquete: "@fontsource/great-vibes", archivos: ["400.css"] },
  { id: "dancing-script", nombre: "Dancing Script", familia: '"Dancing Script Variable", "Dancing Script", cursive', roles: ["firma", "titulo"], paquete: "@fontsource-variable/dancing-script", archivos: ["index.css"] },
  { id: "allura", nombre: "Allura", familia: '"Allura", "Brush Script MT", cursive', roles: ["firma"], paquete: "@fontsource/allura", archivos: ["400.css"] },
  { id: "parisienne", nombre: "Parisienne", familia: '"Parisienne", "Brush Script MT", cursive', roles: ["firma"], paquete: "@fontsource/parisienne", archivos: ["400.css"] },
];

/** Combinaciones probadas, para elegir de un clic. */
export const COMBINACIONES: { id: string; nombre: string; titulo: string; texto: string; firma: string }[] = [
  { id: "tejido", nombre: "Hecho a mano", titulo: "caveat-brush", texto: "nunito", firma: "sacramento" },
  { id: "dulce", nombre: "Dulce", titulo: "pacifico", texto: "quicksand", firma: "great-vibes" },
  { id: "jugueton", nombre: "Juguetón", titulo: "fredoka", texto: "nunito", firma: "dancing-script" },
  { id: "elegante", nombre: "Elegante", titulo: "playfair-display", texto: "lato", firma: "parisienne" },
  { id: "rustico", nombre: "Rústico", titulo: "amatic-sc", texto: "raleway", firma: "allura" },
  { id: "suave", nombre: "Suave", titulo: "comfortaa", texto: "quicksand", firma: "sacramento" },
  { id: "moderno", nombre: "Moderno", titulo: "montserrat", texto: "poppins", firma: "great-vibes" },
  { id: "clasico", nombre: "Clásico", titulo: "playfair-display", texto: "nunito", firma: "dancing-script" },
  { id: "editorial", nombre: "Editorial (todo serif)", titulo: "playfair-display", texto: "lora", firma: "parisienne" },
  { id: "lujo", nombre: "Lujo", titulo: "bodoni-moda", texto: "eb-garamond", firma: "allura" },
  { id: "boutique", nombre: "Boutique", titulo: "cormorant-garamond", texto: "jost", firma: "great-vibes" },
  { id: "contemporaneo", nombre: "Contemporáneo", titulo: "dm-serif-display", texto: "dm-sans", firma: "dancing-script" },
];

const POR_ID = new Map(FUENTES.map((f) => [f.id, f]));

export function fuentePorId(id: string): Fuente | undefined {
  return POR_ID.get(id);
}

/** Fuentes que sirven para un papel. */
export function fuentesPara(rol: RolFuente): Fuente[] {
  return FUENTES.filter((f) => f.roles.includes(rol));
}

/** Dirección de la hoja de una tipografía en el sitio. */
export function cssDeFuente(id: string): string {
  return `/fuentes/${id}/fuente.css`;
}
