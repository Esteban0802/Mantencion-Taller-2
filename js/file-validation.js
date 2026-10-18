const MARCAS_HEIF = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];
const MARCAS_AVIF = ["avif", "avis"];

function iniciaCon(bytes, firma) {
  return firma.every((valor, indice) => bytes[indice] === valor);
}

function textoAscii(bytes) {
  return new TextDecoder("latin1").decode(bytes);
}

function esContenedorIso(bytes, marcas) {
  if (bytes.length < 12 || textoAscii(bytes.slice(4, 8)) !== "ftyp") return false;
  const cabecera = textoAscii(bytes.slice(8)).toLowerCase();
  return marcas.some(marca => cabecera.includes(marca));
}

function esZip(bytes) {
  return iniciaCon(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

function coincideFirma(bytes, tipo) {
  switch (tipo) {
    case "image/jpeg": return iniciaCon(bytes, [0xff, 0xd8, 0xff]);
    case "image/png": return iniciaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp": return textoAscii(bytes.slice(0, 4)) === "RIFF" && textoAscii(bytes.slice(8, 12)) === "WEBP";
    case "image/heic":
    case "image/heif": return esContenedorIso(bytes, MARCAS_HEIF);
    case "image/avif": return esContenedorIso(bytes, MARCAS_AVIF);
    case "application/pdf": return textoAscii(bytes.slice(0, 5)) === "%PDF-";
    case "application/msword":
    case "application/vnd.ms-excel": return iniciaCon(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return esZip(bytes) && textoAscii(bytes).includes("word/");
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return esZip(bytes) && textoAscii(bytes).includes("xl/");
    default: return false;
  }
}

/** Verifica que el contenido binario corresponda al tipo permitido declarado. */
export async function validarFirmaArchivo(archivo, tipoEsperado = "") {
  if (!archivo || !Number(archivo.size)) throw new Error("El archivo está vacío o no es válido.");
  const tipo = String(tipoEsperado || archivo.type || "").toLowerCase();
  if (!tipo) throw new Error("No fue posible identificar el tipo real del archivo.");

  // Los nombres internos de DOCX/XLSX pueden estar al final del contenedor ZIP.
  const requiereContenedorCompleto = tipo.includes("openxmlformats-officedocument");
  const limite = requiereContenedorCompleto ? archivo.size : Math.min(archivo.size, 128);
  const bytes = new Uint8Array(await archivo.slice(0, limite).arrayBuffer());
  if (!coincideFirma(bytes, tipo)) {
    throw new Error("El contenido del archivo no coincide con su formato. Selecciona el archivo original sin renombrarlo.");
  }
  return true;
}

