"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="bg-gray-50 border-t mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap justify-between items-start gap-6">
          <div>
            <p className="text-sm font-semibold text-gray-700">Distrialma</p>
            <p className="text-xs text-gray-500 mt-1">Av. Calle Real 387, Merlo, Buenos Aires</p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <Link href="/" className="hover:text-brand-500">Inicio</Link>
            <Link href="/productos" className="hover:text-brand-500">Productos</Link>
            <Link href="/privacidad" className="hover:text-brand-500">Privacidad</Link>
            <Link href="/terms" className="hover:text-brand-500">Términos</Link>
          </div>
        </div>
        <div className="text-xs text-gray-400 mt-4 text-center">
          © {new Date().getFullYear()} Distrialma. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
