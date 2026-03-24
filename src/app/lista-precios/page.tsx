"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { PriceListFormat } from "@/lib/price-list-pdf";
import { FORMAT_LABELS } from "@/lib/price-list-pdf";

export default function ListaPreciosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [format, setFormat] = useState<PriceListFormat>("lista");
  const [generating, setGenerating] = useState(false);

  if (status === "loading") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (!session?.user) {
    router.push("/login?callbackUrl=/lista-precios");
    return null;
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/price-list");
      const data = await res.json();

      if (!data.products || data.products.length === 0) {
        alert("No hay productos disponibles");
        return;
      }

      const { generatePriceListPdf } = await import("@/lib/price-list-pdf");
      const doc = generatePriceListPdf(format, data.products, data.isEspecial);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Error al generar el PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">


      <h1 className="text-2xl font-bold text-gray-900 mb-2">Lista de Precios</h1>
      <p className="text-sm text-gray-500 mb-6">
        Descargá la lista de precios actualizada en formato PDF con la fecha del día.
      </p>

      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-sm font-medium text-gray-700">Formato</h2>
        <div className="space-y-2">
          {(Object.keys(FORMAT_LABELS) as PriceListFormat[]).map((f) => (
            <label
              key={f}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                format === f
                  ? "border-brand-400 bg-brand-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="format"
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
                className="text-brand-400 focus:ring-brand-400"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">
                  {FORMAT_LABELS[f]}
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  {f === "lista" && "Todos los productos en una tabla simple"}
                  {f === "catalogo" && "Productos agrupados por rubro/categoría"}
                  {f === "combinado" && "Agrupados por rubro y luego por marca"}
                </p>
              </div>
            </label>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-3 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {generating ? "Generando PDF..." : "Descargar PDF"}
        </button>

        <p className="text-xs text-gray-400 text-center">
          El PDF incluye la fecha de hoy para referencia de precios vigentes.
        </p>
      </div>
    </div>
  );
}
