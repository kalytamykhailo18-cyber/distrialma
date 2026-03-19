import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Distrialma
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Distribuidora Mayorista — Bebidas, Alimentos, Limpieza y más
        </p>
        <Link
          href="/productos"
          className="bg-brand-400 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-brand-500 transition-colors"
        >
          Ver Productos
        </Link>
      </div>
    </div>
  );
}
