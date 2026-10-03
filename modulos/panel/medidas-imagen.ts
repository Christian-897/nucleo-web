/**
 * MIDE UNA IMAGEN SIN ABRIRLA.
 *
 * Toda imagen guarda su ancho y su alto en los primeros bytes del
 * archivo, antes de los datos de la foto. Acá se leen esos bytes y
 * nada más: no se descomprime nada.
 *
 * POR QUÉ IMPORTA NO DESCOMPRIMIR
 *
 * Un archivo de 40 KB puede desplegarse a 50.000 × 50.000 píxeles. Eso
 * son dos mil quinientos millones de puntos, unos diez gigabytes de
 * memoria al abrirlo. Es un ataque conocido —«bomba de descompresión»—
 * y no necesita ningún código escondido: basta con la imagen.
 *
 * Comprobar el tamaño DESPUÉS de abrirla no sirve de nada, porque el
 * daño ocurre al abrirla. Por eso se mide leyendo la cabecera, que son
 * unos pocos bytes y ningún riesgo.
 */

export interface MedidasImagen {
  ancho: number;
  alto: number;
}

/**
 * Devuelve las medidas declaradas en la cabecera, o null si no se
 * pudieron leer.
 *
 * Null significa "no me consta": quien llama decide si eso basta para
 * rechazar el archivo.
 */
export function medidasDeImagen(datos: Uint8Array): MedidasImagen | null {
  if (datos.length < 16) return null;
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);

  // PNG: el bloque IHDR va siempre primero, con ancho y alto en los
  // bytes 16 a 23.
  if (datos[0] === 0x89 && datos[1] === 0x50 && datos[2] === 0x4e && datos[3] === 0x47) {
    if (datos.length < 24) return null;
    return { ancho: vista.getUint32(16), alto: vista.getUint32(20) };
  }

  // JPEG: hay que recorrer los bloques hasta encontrar el que declara
  // el marco de la imagen (SOF). Los demás son metadatos, miniaturas y
  // tablas.
  if (datos[0] === 0xff && datos[1] === 0xd8) {
    let i = 2;
    while (i + 9 < datos.length) {
      if (datos[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marca = datos[i + 1];
      // Relleno entre bloques.
      if (marca === 0xff) {
        i += 1;
        continue;
      }
      // Bloques sin cuerpo.
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
        i += 2;
        continue;
      }
      // Empiezan los datos comprimidos: ya no hay cabeceras que leer.
      if (marca === 0xda || marca === 0xd9) return null;

      const largo = vista.getUint16(i + 2);
      if (largo < 2) return null;

      const esMarco =
        (marca >= 0xc0 && marca <= 0xc3) ||
        (marca >= 0xc5 && marca <= 0xc7) ||
        (marca >= 0xc9 && marca <= 0xcb) ||
        (marca >= 0xcd && marca <= 0xcf);

      if (esMarco) {
        if (i + 9 >= datos.length) return null;
        return { alto: vista.getUint16(i + 5), ancho: vista.getUint16(i + 7) };
      }
      i += 2 + largo;
    }
    return null;
  }

  // WebP: tres variantes, cada una guarda las medidas en otro lugar.
  const texto = (inicio: number, largo: number) =>
    String.fromCharCode(...datos.slice(inicio, inicio + largo));

  if (texto(0, 4) === "RIFF" && texto(8, 4) === "WEBP") {
    const tipo = texto(12, 4);

    // Extendido: las medidas del lienzo van en tres bytes cada una.
    if (tipo === "VP8X" && datos.length >= 30) {
      const ancho = 1 + (datos[24] | (datos[25] << 8) | (datos[26] << 16));
      const alto = 1 + (datos[27] | (datos[28] << 8) | (datos[29] << 16));
      return { ancho, alto };
    }

    // Con pérdida: después del código de inicio 9D 01 2A.
    if (tipo === "VP8 " && datos.length >= 30) {
      if (datos[23] === 0x9d && datos[24] === 0x01 && datos[25] === 0x2a) {
        return {
          ancho: vista.getUint16(26, true) & 0x3fff,
          alto: vista.getUint16(28, true) & 0x3fff,
        };
      }
      return null;
    }

    // Sin pérdida: catorce bits para cada medida, empaquetados.
    if (tipo === "VP8L" && datos.length >= 25) {
      if (datos[20] !== 0x2f) return null;
      const bits = vista.getUint32(21, true);
      return {
        ancho: 1 + (bits & 0x3fff),
        alto: 1 + ((bits >> 14) & 0x3fff),
      };
    }
    return null;
  }

  return null;
}
