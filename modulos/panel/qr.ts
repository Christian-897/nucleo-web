/**
 * CÓDIGOS QR, DIBUJADOS ACÁ.
 *
 * ───────────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁ ESCRITO Y NO TRAÍDO DE UNA BIBLIOTECA
 *
 * El panel de administración tiene prohibido cargar cualquier cosa que
 * venga de fuera: ni un script, ni una hoja de estilos, ni una
 * tipografía. Esa prohibición es de las defensas más útiles que tiene,
 * porque aunque alguien lograra colar código en la página, el navegador
 * se negaría a ejecutarlo.
 *
 * La forma habitual de mostrar un QR es pedirlo a un servicio externo
 * o cargar una biblioteca desde un CDN. Las dos rompen esa regla, y la
 * primera además le manda el secreto del doble factor a un tercero.
 *
 * Así que el QR se arma acá y se entrega como SVG. Son unas doscientas
 * líneas de un algoritmo cerrado y bien documentado (ISO/IEC 18004),
 * que no cambia nunca y no tiene dependencias.
 * ───────────────────────────────────────────────────────────────────
 *
 * ALCANCE
 *
 * Modo byte, corrección de errores nivel M (recupera hasta un 15 % del
 * código dañado) y versiones 1 a 10, que llegan a 271 caracteres. La
 * dirección del doble factor ocupa unos 130, así que sobra. No se
 * implementan los modos numérico ni alfanumérico: comprimirían más,
 * pero acá no hace falta y serían código que nadie usa.
 */

/** Capacidad en bytes de datos, por versión, en nivel M. */
const CAPACIDAD_M = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

/** Bytes de corrección por bloque y cantidad de bloques, nivel M. */
const BLOQUES_M: Array<{ ecc: number; g1: number; t1: number; g2: number; t2: number }> = [
  { ecc: 0, g1: 0, t1: 0, g2: 0, t2: 0 },
  { ecc: 10, g1: 1, t1: 16, g2: 0, t2: 0 },
  { ecc: 16, g1: 1, t1: 28, g2: 0, t2: 0 },
  { ecc: 26, g1: 1, t1: 44, g2: 0, t2: 0 },
  { ecc: 18, g1: 2, t1: 32, g2: 0, t2: 0 },
  { ecc: 24, g1: 2, t1: 43, g2: 0, t2: 0 },
  { ecc: 16, g1: 4, t1: 27, g2: 0, t2: 0 },
  { ecc: 18, g1: 4, t1: 31, g2: 0, t2: 0 },
  { ecc: 22, g1: 2, t1: 38, g2: 2, t2: 39 },
  { ecc: 22, g1: 3, t1: 36, g2: 2, t2: 37 },
  { ecc: 26, g1: 4, t1: 43, g2: 1, t2: 44 },
];

/** Centro de los patrones de alineación, por versión. */
const ALINEACION = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** Información de formato ya calculada, para nivel M y cada máscara. */
const FORMATO_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
];

/** Información de versión (solo se escribe desde la versión 7). */
const INFO_VERSION = [
  0, 0, 0, 0, 0, 0, 0, 0x07c94, 0x085bc, 0x09a99, 0x0a4d3,
];

// ── Aritmética del cuerpo de Galois GF(256), la que usa Reed-Solomon ──

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // polinomio del estándar
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const multiplicar = (a: number, b: number) =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];

/** Polinomio generador para la cantidad de bytes de corrección pedida. */
function generador(grado: number): Uint8Array {
  let poli = new Uint8Array([1]);
  for (let i = 0; i < grado; i++) {
    const nuevo = new Uint8Array(poli.length + 1);
    for (let j = 0; j < poli.length; j++) {
      nuevo[j] ^= poli[j];
      nuevo[j + 1] ^= multiplicar(poli[j], EXP[i]);
    }
    poli = nuevo;
  }
  return poli;
}

/** Bytes de corrección de un bloque de datos. */
function corregir(datos: Uint8Array, cuantos: number): Uint8Array {
  const gen = generador(cuantos);
  const resto = new Uint8Array(datos.length + cuantos);
  resto.set(datos, 0);
  for (let i = 0; i < datos.length; i++) {
    const coeficiente = resto[i];
    if (coeficiente === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      resto[i + j] ^= multiplicar(gen[j], coeficiente);
    }
  }
  return resto.slice(datos.length);
}

// ── Armado del código ──

export interface CodigoQr {
  /** Lado del código en módulos, sin el margen. */
  lado: number;
  /** true = módulo oscuro. */
  modulos: boolean[][];
}

/**
 * Arma la matriz del código.
 *
 * Devuelve null si el texto no cabe en la versión 10, que acá sería un
 * error de programación, no algo que pueda provocar quien usa el panel.
 */
export function armarQr(texto: string, mascaraFija?: number): CodigoQr | null {
  // `mascaraFija` existe para las pruebas: permite comparar la matriz
  // contra una implementación de referencia máscara por máscara. En uso
  // normal se omite y se eligen las ocho para quedarse con la mejor.
  const datos = new TextEncoder().encode(texto);

  // La versión más chica donde quepan los datos con su cabecera.
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    if (datos.length <= CAPACIDAD_M[v]) {
      version = v;
      break;
    }
  }
  if (version === 0) return null;

  const lado = 17 + version * 4;
  const { ecc, g1, t1, g2, t2 } = BLOQUES_M[version];
  const totalDatos = g1 * t1 + g2 * t2;

  // ── Cadena de bits: modo byte (0100), largo, datos, relleno ──
  const bits: number[] = [];
  const empujar = (valor: number, cuantos: number) => {
    for (let i = cuantos - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  empujar(0b0100, 4);
  empujar(datos.length, version <= 9 ? 8 : 16);
  for (const byte of datos) empujar(byte, 8);

  // Terminador y relleno hasta completar bytes.
  const capacidadBits = totalDatos * 8;
  for (let i = 0; i < 4 && bits.length < capacidadBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
  }
  // Los dos bytes de relleno que manda el estándar, alternados.
  const relleno = [0xec, 0x11];
  let r = 0;
  while (bytes.length < totalDatos) bytes.push(relleno[r++ % 2]);

  // ── Bloques y corrección de errores ──
  const bloques: Uint8Array[] = [];
  const correcciones: Uint8Array[] = [];
  let cursor = 0;
  for (let i = 0; i < g1 + g2; i++) {
    const largo = i < g1 ? t1 : t2;
    const bloque = new Uint8Array(bytes.slice(cursor, cursor + largo));
    cursor += largo;
    bloques.push(bloque);
    correcciones.push(corregir(bloque, ecc));
  }

  // Se entrelazan: un byte de cada bloque, por turnos. Es lo que hace
  // que un manchón sobre el código dañe un poco de cada bloque en vez
  // de destruir uno completo.
  const secuencia: number[] = [];
  const maxLargo = Math.max(t1, t2);
  for (let i = 0; i < maxLargo; i++) {
    for (const bloque of bloques) if (i < bloque.length) secuencia.push(bloque[i]);
  }
  for (let i = 0; i < ecc; i++) {
    for (const c of correcciones) secuencia.push(c[i]);
  }

  // ── Matriz ──
  const modulos: (boolean | null)[][] = Array.from({ length: lado }, () =>
    new Array<boolean | null>(lado).fill(null)
  );

  const poner = (x: number, y: number, oscuro: boolean) => {
    if (x >= 0 && x < lado && y >= 0 && y < lado) modulos[y][x] = oscuro;
  };

  // Los tres cuadrados de las esquinas.
  const buscador = (cx: number, cy: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= lado || y >= lado) continue;
        const borde = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        poner(x, y, borde !== 2 && borde <= 3);
      }
    }
  };
  buscador(0, 0);
  buscador(lado - 7, 0);
  buscador(0, lado - 7);

  // Patrones de alineación, salvo donde chocan con los buscadores.
  const centros = ALINEACION[version];
  for (const cy of centros) {
    for (const cx of centros) {
      if (
        (cx <= 8 && cy <= 8) ||
        (cx <= 8 && cy >= lado - 9) ||
        (cx >= lado - 9 && cy <= 8)
      ) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const borde = Math.max(Math.abs(dx), Math.abs(dy));
          poner(cx + dx, cy + dy, borde !== 1);
        }
      }
    }
  }

  // Líneas de sincronía.
  for (let i = 8; i < lado - 8; i++) {
    if (modulos[6][i] === null) poner(i, 6, i % 2 === 0);
    if (modulos[i][6] === null) poner(6, i, i % 2 === 0);
  }

  // Módulo siempre oscuro y reserva del formato.
  poner(8, lado - 8, true);
  const reservar = () => {
    for (let i = 0; i < 9; i++) {
      if (modulos[8][i] === null) modulos[8][i] = false;
      if (modulos[i][8] === null) modulos[i][8] = false;
    }
    for (let i = 0; i < 8; i++) {
      if (modulos[8][lado - 1 - i] === null) modulos[8][lado - 1 - i] = false;
      if (modulos[lado - 1 - i][8] === null) modulos[lado - 1 - i][8] = false;
    }
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          modulos[lado - 11 + j][i] = false;
          modulos[i][lado - 11 + j] = false;
        }
      }
    }
  };
  reservar();

  // ── Los datos, en zigzag desde abajo a la derecha ──
  let bit = 0;
  const totalBits = secuencia.length * 8;
  const siguienteBit = () => {
    if (bit >= totalBits) return false;
    const valor = (secuencia[bit >> 3] >>> (7 - (bit & 7))) & 1;
    bit++;
    return valor === 1;
  };
  for (let derecha = lado - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5; // la columna 6 es de sincronía
    for (let paso = 0; paso < lado; paso++) {
      const subiendo = ((lado - 1 - derecha) & 2) === 0;
      const y = subiendo ? lado - 1 - paso : paso;
      for (let dx = 0; dx < 2; dx++) {
        const x = derecha - dx;
        if (modulos[y][x] !== null) continue;
        modulos[y][x] = siguienteBit();
      }
    }
  }

  const definitivos = modulos as boolean[][];

  // ── Máscara: se prueban las ocho y se queda la menos penalizada ──
  let mejor = { mascara: 0, castigo: Infinity, matriz: definitivos };
  for (let m = 0; m < 8; m++) {
    if (mascaraFija !== undefined && m !== mascaraFija) continue;
    const copia = definitivos.map((fila) => [...fila]);
    aplicarMascara(copia, m, lado, version, centros);
    escribirFormato(copia, m, lado, version);
    const castigo = penalizacion(copia, lado);
    if (castigo < mejor.castigo) mejor = { mascara: m, castigo, matriz: copia };
  }

  return { lado, modulos: mejor.matriz };
}

/** true si el módulo es de servicio y no se enmascara. */
function esFuncional(
  x: number,
  y: number,
  lado: number,
  version: number,
  centros: number[]
): boolean {
  if (x === 6 || y === 6) return true;
  if (x <= 8 && y <= 8) return true;
  if (x >= lado - 8 && y <= 8) return true;
  if (x <= 8 && y >= lado - 8) return true;
  if (version >= 7) {
    if (x < 6 && y >= lado - 11) return true;
    if (y < 6 && x >= lado - 11) return true;
  }
  for (const cy of centros) {
    for (const cx of centros) {
      if (
        (cx <= 8 && cy <= 8) ||
        (cx <= 8 && cy >= lado - 9) ||
        (cx >= lado - 9 && cy <= 8)
      ) {
        continue;
      }
      if (Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) return true;
    }
  }
  return false;
}

function aplicarMascara(
  matriz: boolean[][],
  mascara: number,
  lado: number,
  version: number,
  centros: number[]
): void {
  const reglas: Array<(x: number, y: number) => boolean> = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const regla = reglas[mascara];
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (esFuncional(x, y, lado, version, centros)) continue;
      if (regla(x, y)) matriz[y][x] = !matriz[y][x];
    }
  }
}

function escribirFormato(
  matriz: boolean[][],
  mascara: number,
  lado: number,
  version: number
): void {
  const formato = FORMATO_M[mascara];
  const bitFormato = (i: number) => ((formato >>> i) & 1) === 1;

  /**
   * Los quince bits del formato van DOS VECES, en dos recorridos
   * distintos, y cada uno con su propio orden. Esa duplicación es a
   * propósito: si una esquina se raya o se tapa, el lector todavía
   * puede saber con qué nivel de corrección y con qué máscara fue
   * armado el código, que es lo que necesita para leer el resto.
   *
   * El orden de los bits salió de comparar contra una implementación de
   * referencia, celda por celda: el recorrido de abajo y de la derecha
   * va con los bits al revés que el de arriba a la izquierda.
   */

  // Copia 1: bordeando el buscador de arriba a la izquierda.
  for (let i = 0; i <= 5; i++) matriz[i][8] = bitFormato(i);
  matriz[7][8] = bitFormato(6);
  matriz[8][8] = bitFormato(7);
  matriz[8][7] = bitFormato(8);
  for (let i = 9; i <= 14; i++) matriz[8][14 - i] = bitFormato(i);

  // Copia 2: hacia arriba desde abajo a la izquierda (bits 14 a 8) y
  // hacia la derecha en la fila 8 (bits 7 a 0). La celda que queda en
  // (8, lado-8) NO es del formato: es el módulo que siempre va oscuro.
  for (let i = 0; i <= 6; i++) matriz[lado - 1 - i][8] = bitFormato(14 - i);
  for (let i = 0; i <= 7; i++) matriz[8][lado - 8 + i] = bitFormato(7 - i);

  if (version >= 7) {
    const info = INFO_VERSION[version];
    for (let i = 0; i < 18; i++) {
      const valor = ((info >>> i) & 1) === 1;
      matriz[Math.floor(i / 3)][lado - 11 + (i % 3)] = valor;
      matriz[lado - 11 + (i % 3)][Math.floor(i / 3)] = valor;
    }
  }
}

/**
 * Cuánto "castigo" tiene una máscara, según las cuatro reglas del
 * estándar. La de menor castigo es la que se lee mejor.
 */
function penalizacion(matriz: boolean[][], lado: number): number {
  let total = 0;

  // Regla 1: rachas de cinco o más del mismo color.
  const racha = (obtener: (i: number, j: number) => boolean) => {
    for (let i = 0; i < lado; i++) {
      let largo = 1;
      for (let j = 1; j < lado; j++) {
        if (obtener(i, j) === obtener(i, j - 1)) {
          largo++;
        } else {
          if (largo >= 5) total += largo - 2;
          largo = 1;
        }
      }
      if (largo >= 5) total += largo - 2;
    }
  };
  racha((i, j) => matriz[i][j]);
  racha((i, j) => matriz[j][i]);

  // Regla 2: bloques de 2×2 del mismo color.
  for (let y = 0; y < lado - 1; y++) {
    for (let x = 0; x < lado - 1; x++) {
      const v = matriz[y][x];
      if (v === matriz[y][x + 1] && v === matriz[y + 1][x] && v === matriz[y + 1][x + 1]) {
        total += 3;
      }
    }
  }

  // Regla 3: figuras que imitan un patrón buscador.
  const patron = [true, false, true, true, true, false, true];
  const buscaPatron = (obtener: (k: number) => boolean, largo: number) => {
    for (let i = 0; i <= largo - 7; i++) {
      let calza = true;
      for (let k = 0; k < 7; k++) {
        if (obtener(i + k) !== patron[k]) {
          calza = false;
          break;
        }
      }
      if (!calza) continue;
      const antes = i - 4 >= 0 && [0, 1, 2, 3].every((d) => !obtener(i - 1 - d));
      const despues = i + 10 < largo && [0, 1, 2, 3].every((d) => !obtener(i + 7 + d));
      if (antes || despues) total += 40;
    }
  };
  for (let i = 0; i < lado; i++) {
    buscaPatron((k) => matriz[i][k], lado);
    buscaPatron((k) => matriz[k][i], lado);
  }

  // Regla 4: desequilibrio entre claros y oscuros.
  let oscuros = 0;
  for (const fila of matriz) for (const v of fila) if (v) oscuros++;
  const porcentaje = (oscuros * 100) / (lado * lado);
  total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

  return total;
}

/**
 * El código como SVG.
 *
 * Se dibuja con un solo trazado para todos los módulos oscuros: un
 * rectángulo por módulo serían más de mil elementos y el archivo pesaría
 * de más sin ninguna ganancia.
 *
 * El margen de cuatro módulos que rodea al código no es decorativo: el
 * estándar lo exige y sin él muchos lectores no encuentran el código.
 */
export function qrComoSvg(texto: string, etiqueta: string): string | null {
  const codigo = armarQr(texto);
  if (!codigo) return null;

  const margen = 4;
  const total = codigo.lado + margen * 2;
  let trazado = "";
  for (let y = 0; y < codigo.lado; y++) {
    for (let x = 0; x < codigo.lado; x++) {
      if (codigo.modulos[y][x]) trazado += `M${x + margen} ${y + margen}h1v1h-1z`;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"`,
    ` role="img" aria-label="${etiqueta.replace(/[<>&"]/g, "")}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${trazado}" fill="#000000"/>`,
    `</svg>`,
  ].join("");
}
