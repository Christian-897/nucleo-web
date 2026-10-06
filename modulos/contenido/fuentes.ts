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
