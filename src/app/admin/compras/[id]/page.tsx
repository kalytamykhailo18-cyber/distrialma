"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { HiOutlineArrowLeft } from "react-icons/hi";

interface EntryItem {
  id: number;
  sku: string;
  productName: string;
  cantidad: number;
  costo: number | null;
  costeado: boolean;
  isNewProduct: boolean;
  porceGan2: number;
  porceGan3: number;
  porceGan4: number;
  rubro?: string;
  marca?: string;
  unidad?: string;
  cantPorCaja?: number;
}

interface StockEntry {
  id: number;
  proveedorCod: string;
  proveedorName: string;
  usuario: string;
  estado: string;
  total: number;
  notas: string | null;
  createdAt: string;
  items: EntryItem[];
}

interface CosteoRow {
  id: number;
  costo: string;
}

interface NewProductRow {
  sku: string;
  rubro: string;
  marca: string;
  unidad: string;
  cantidadPorCaja: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EntryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [entry, setEntry] = useState<StockEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Costeo form state
  const [costeoRows, setCosteoRows] = useState<CosteoRow[]>([]);
  const [newProductRows, setNewProductRows] = useState<NewProductRow[]>([]);

  // Rubros and Marcas for dropdowns
  const [rubros, setRubros] = useState<{ id: string; name: string }[]>([]);
  const [marcas, setMarcas] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadEntry();
    loadCatalogs();
  }, []);

  function loadEntry() {
    setLoading(true);
    fetch(`/api/admin/stock-entries/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setEntry(data.entry);
        // Initialize costeo rows
        setCosteoRows(
          data.entry.items.map((item: EntryItem) => ({
            id: item.id,
            costo: item.costo != null ? String(item.costo) : "",
          }))
        );
        // Initialize new product rows
        setNewProductRows(
          data.entry.items
            .filter((i: EntryItem) => i.isNewProduct)
            .map((item: EntryItem) => ({
              sku: item.sku,
              rubro: item.rubro || "",
              marca: item.marca || "",
              unidad: item.unidad || "",
              cantidadPorCaja: item.cantPorCaja ? String(item.cantPorCaja) : "",
            }))
        );
      })
      .catch(() => setError("Error al cargar ingreso"))
      .finally(() => setLoading(false));
  }

  function loadCatalogs() {
    // Load rubros
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setRubros(data || []))
      .catch(() => {});
    // Load marcas
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => setMarcas(data || []))
      .catch(() => {});
  }

  function updateCosteo(id: number, value: string) {
    setCosteoRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, costo: value } : r))
    );
  }

  function updateNewProduct(sku: string, field: keyof NewProductRow, value: string) {
    setNewProductRows((prev) =>
      prev.map((r) => (r.sku === sku ? { ...r, [field]: value } : r))
    );
  }

  function calcPrice(costo: number, margin: number): number {
    return costo * (1 + margin / 100);
  }

  async function handleCosteo() {
    if (!entry) return;

    // Validate: at least one cost
    const validItems = costeoRows.filter(
      (r) => r.costo.trim() !== "" && parseFloat(r.costo) > 0
    );
    if (validItems.length === 0) {
      setError("Ingresá al menos un costo");
      return;
    }

    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/stock-entries/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: costeoRows
            .filter((r) => r.costo.trim() !== "" && parseFloat(r.costo) > 0)
            .map((r) => ({ id: r.id, costo: parseFloat(r.costo) })),
          newProductData: newProductRows.length > 0 ? newProductRows : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");

      setSuccess(
        data.allCosteado
          ? "Costeo completado. Todos los items costeados."
          : "Costos actualizados."
      );

      // Reload
      loadEntry();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar costeo");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-red-600">{error || "Ingreso no encontrado"}</p>
      </div>
    );
  }

  const isPendiente = entry.estado === "pendiente";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Back */}
      <button
        onClick={() => router.push("/admin/compras")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 mb-4 transition-colors"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        Volver a compras
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Ingreso #{entry.id}
          </h1>
          <div className="text-sm text-gray-500 mt-1 space-y-0.5">
            <p>Proveedor: {entry.proveedorName}</p>
            <p>Fecha: {formatDate(entry.createdAt)}</p>
            <p>Usuario: {entry.usuario}</p>
            {entry.notas && <p>Notas: {entry.notas}</p>}
          </div>
        </div>
        <span
          className={`text-sm px-3 py-1 rounded-full font-medium ${
            entry.estado === "costeado"
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {entry.estado === "costeado" ? "Costeado" : "Pendiente"}
        </span>
      </div>

      {/* Total */}
      {entry.total > 0 && (
        <div className="mb-4 text-sm text-gray-700">
          Total: <span className="font-semibold">{formatPrice(entry.total)}</span>
        </div>
      )}

      {/* Items table */}
      <div className="bg-white rounded-lg border overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b">
              <th className="text-left px-4 py-2">Producto</th>
              <th className="text-left px-4 py-2 w-16">SKU</th>
              <th className="text-right px-4 py-2 w-20">Cantidad</th>
              <th className="text-right px-4 py-2 w-28">
                {isPendiente ? "Costo" : "Costo"}
              </th>
              {isPendiente && (
                <>
                  <th className="text-right px-4 py-2 w-24">Mayorista</th>
                  <th className="text-right px-4 py-2 w-24">Especial</th>
                  <th className="text-right px-4 py-2 w-24">Caja</th>
                </>
              )}
              <th className="text-center px-4 py-2 w-16">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entry.items.map((item) => {
              const costeoRow = costeoRows.find((r) => r.id === item.id);
              const costoValue = costeoRow ? parseFloat(costeoRow.costo) : 0;
              const validCosto = !isNaN(costoValue) && costoValue > 0;

              return (
                <tr key={item.id}>
                  <td className="px-4 py-2">
                    <span className="text-gray-900">{item.productName}</span>
                    {item.isNewProduct && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                        Nuevo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{item.sku}</td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {item.cantidad}
                  </td>
                  <td className="px-4 py-2">
                    {isPendiente && !item.costeado ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={costeoRow?.costo || ""}
                        onChange={(e) => updateCosteo(item.id, e.target.value)}
                        placeholder="0.00"
                        className="w-full text-right px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      />
                    ) : (
                      <span className="block text-right text-gray-700">
                        {item.costo != null ? formatPrice(item.costo) : "—"}
                      </span>
                    )}
                  </td>
                  {isPendiente && (
                    <>
                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                        {validCosto
                          ? formatPrice(calcPrice(costoValue, item.porceGan2))
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                        {validCosto
                          ? formatPrice(calcPrice(costoValue, item.porceGan3))
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                        {validCosto
                          ? formatPrice(calcPrice(costoValue, item.porceGan4))
                          : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2 text-center">
                    {item.costeado ? (
                      <span className="text-xs text-green-600 font-medium">OK</span>
                    ) : (
                      <span className="text-xs text-amber-600">Pend.</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New product extra fields */}
      {isPendiente && newProductRows.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Datos de productos nuevos
          </h2>
          <div className="space-y-3">
            {newProductRows.map((np) => {
              const item = entry.items.find((i) => i.sku === np.sku);
              return (
                <div
                  key={np.sku}
                  className="bg-gray-50 rounded-lg border p-4"
                >
                  <p className="text-sm font-medium text-gray-800 mb-2">
                    {item?.productName} (SKU: {np.sku})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Rubro
                      </label>
                      <select
                        value={np.rubro}
                        onChange={(e) =>
                          updateNewProduct(np.sku, "rubro", e.target.value)
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      >
                        <option value="">—</option>
                        {rubros.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Marca
                      </label>
                      <select
                        value={np.marca}
                        onChange={(e) =>
                          updateNewProduct(np.sku, "marca", e.target.value)
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      >
                        <option value="">—</option>
                        {marcas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Unidad
                      </label>
                      <input
                        type="text"
                        value={np.unidad}
                        onChange={(e) =>
                          updateNewProduct(np.sku, "unidad", e.target.value)
                        }
                        placeholder="Ej: UN, KG"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Cant. por caja
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={np.cantidadPorCaja}
                        onChange={(e) =>
                          updateNewProduct(
                            np.sku,
                            "cantidadPorCaja",
                            e.target.value
                          )
                        }
                        placeholder="0"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error / Success */}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {success && <p className="text-sm text-green-600 mb-4">{success}</p>}

      {/* Costeo button */}
      {isPendiente && (
        <button
          onClick={handleCosteo}
          disabled={saving}
          className="px-6 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {saving ? "Guardando costeo..." : "Confirmar costeo"}
        </button>
      )}
    </div>
  );
}
