// Bank visual configuration — brand colors and icons for quick identification

export interface BancoConfig {
  key: string;
  nombre: string;
  abrev: string;
  logo: string; // path to logo SVG
  bg: string;
  bgSoft: string;
  text: string;
  border: string;
}

export const BANCOS: BancoConfig[] = [
  {
    key: "SUPERVIELLE",
    nombre: "Supervielle",
    abrev: "S",
    logo: "/supervielle_logo.png",
    bg: "bg-red-600",
    bgSoft: "bg-red-50",
    text: "text-white",
    border: "border-red-600",
  },
  {
    key: "GALICIA",
    nombre: "Galicia",
    abrev: "G",
    logo: "/galicia_logo.png",
    bg: "bg-orange-500",
    bgSoft: "bg-orange-50",
    text: "text-white",
    border: "border-orange-500",
  },
  {
    key: "COMAFI",
    nombre: "Comafi",
    abrev: "C",
    logo: "/comafi_logo.png",
    bg: "bg-blue-800",
    bgSoft: "bg-blue-50",
    text: "text-white",
    border: "border-blue-800",
  },
  {
    key: "NACION",
    nombre: "Nación",
    abrev: "N",
    logo: "/nacion_logo.png",
    bg: "bg-teal-700",
    bgSoft: "bg-teal-50",
    text: "text-white",
    border: "border-teal-700",
  },
  {
    key: "PROVINCIA",
    nombre: "Provincia",
    abrev: "P",
    logo: "/provincia_logo.png",
    bg: "bg-green-600",
    bgSoft: "bg-green-50",
    text: "text-white",
    border: "border-green-600",
  },
];

export function getBanco(nombre: string): BancoConfig | null {
  if (!nombre) return null;
  // Strip combining diacritical marks (U+0300–U+036F) without relying on the /u regex flag.
  const upper = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return BANCOS.find((b) => upper.includes(b.key)) || null;
}
