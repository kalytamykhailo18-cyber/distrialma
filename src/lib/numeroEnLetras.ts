// Convierte un numero a su representacion en letras en castellano rioplatense
// para usar en recibos: e.g. 12450.50 -> "Doce mil cuatrocientos cincuenta con 50/100".

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const ESPECIALES: Record<number, string> = {
  10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
  16: "dieciseis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve",
  20: "veinte", 30: "treinta", 40: "cuarenta", 50: "cincuenta",
  60: "sesenta", 70: "setenta", 80: "ochenta", 90: "noventa",
};
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function decenasYUnidades(n: number, lastInGroup: boolean): string {
  if (n === 0) return "";
  if (n < 10) {
    // "uno" → "un" cuando va antes de mil/millon (no es el ultimo en el grupo)
    if (n === 1 && !lastInGroup) return "un";
    return UNIDADES[n];
  }
  if (ESPECIALES[n]) return ESPECIALES[n];
  if (n < 30) {
    // 21..29: "veintiuno", "veintidos", ...
    const u = n - 20;
    const palabraU = u === 1 && !lastInGroup ? "un" : UNIDADES[u];
    return `veinti${palabraU}`;
  }
  const dec = Math.floor(n / 10) * 10;
  const uni = n % 10;
  if (uni === 0) return ESPECIALES[dec];
  const palabraU = uni === 1 && !lastInGroup ? "un" : UNIDADES[uni];
  return `${ESPECIALES[dec]} y ${palabraU}`;
}

function centenasCompletas(n: number, lastInGroup: boolean): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  const restoStr = decenasYUnidades(resto, lastInGroup);
  if (restoStr) partes.push(restoStr);
  return partes.join(" ").trim();
}

function tresDigitosAGrupo(n: number, lastInGroup: boolean): string {
  return centenasCompletas(n, lastInGroup);
}

function enterosALetras(n: number): string {
  if (n === 0) return "cero";
  if (n < 0) return "menos " + enterosALetras(-n);

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];

  if (millones > 0) {
    if (millones === 1) {
      partes.push("un millon");
    } else {
      partes.push(`${tresDigitosAGrupo(millones, false)} millones`);
    }
  }

  if (miles > 0) {
    if (miles === 1) {
      partes.push("mil");
    } else {
      partes.push(`${tresDigitosAGrupo(miles, false)} mil`);
    }
  }

  if (resto > 0) {
    partes.push(tresDigitosAGrupo(resto, true));
  }

  return partes.join(" ").trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convierte un monto en pesos al formato "Doce mil cuatrocientos cincuenta con 50/100"
 * usado en recibos. Trunca decimales mas alla de 2.
 */
export function numeroEnLetras(monto: number): string {
  const safe = Math.abs(monto);
  const enteros = Math.floor(safe);
  const centavos = Math.round((safe - enteros) * 100);
  const letras = enterosALetras(enteros);
  const cc = String(centavos).padStart(2, "0");
  const base = `${letras} con ${cc}/100`;
  return capitalize(base);
}
