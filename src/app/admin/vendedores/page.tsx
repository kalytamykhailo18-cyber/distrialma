"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HiOutlineCog, HiOutlineGift, HiOutlineSearch, HiOutlineUser } from "react-icons/hi";

interface Vendedor {
  cod: string;
  nombre: string;
}

interface Rubro {
  cod: string;
  nombre: string;
}

interface Comision {
  id: number;
  vendedorCod: string;
  rubroCod: string;
  porcentaje: number;
}

interface Settings {
  markup: number;
  minOrder: number;
  defaultComision: number;
}

export default function AdminVendedoresPage() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [comisiones, setComisiones] = useState<Comision[]>([]);
  const [promocionales, setPromocionales] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>({ markup: 3, minOrder: 0, defaultComision: 3 });
  const [loading, setLoading] = useState(true);
  const [selectedVendedor, setSelectedVendedor] = useState<Vendedor | null>(null);
  const [tab, setTab] = useState<"vendedores" | "promocionales" | "settings">("vendedores");
  const [searchProm, setSearchProm] = useState("");
  const [searchProdResults, setSearchProdResults] = useState<Array<{ sku: string; name: string }>>([]);
  const [savedToast, setSavedToast] = useState("");

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/vendedores")
      .then((r) => r.json())
      .then((data) => {
        setVendedores(data.vendedores || []);
        setRubros(data.rubros || []);
        setComisiones(data.comisiones || []);
        setPromocionales(data.promocionales || []);
        setSettings(data.settings || { markup: 3, minOrder: 0, defaultComision: 3 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function getComision(vendedorCod: string, rubroCod: string): number {
    const c = comisiones.find((x) => x.vendedorCod === vendedorCod && x.rubroCod === rubroCod);
    return c?.porcentaje ?? 0;
  }

  async function updateComision(vendedorCod: string, rubroCod: string, porcentaje: number) {
    await fetch("/api/admin/vendedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedorCod, rubroCod, porcentaje }),
    });
    setComisiones((prev) => {
      const filtered = prev.filter((c) => !(c.vendedorCod === vendedorCod && c.rubroCod === rubroCod));
      if (porcentaje > 0) filtered.push({ id: Date.now(), vendedorCod, rubroCod, porcentaje });
      return filtered;
    });
    showToast("Comisión guardada");
  }

  async function saveSettings() {
    await fetch("/api/admin/vendedores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    showToast("Configuración guardada");
  }

  async function togglePromocional(sku: string) {
    const res = await fetch("/api/admin/vendedores/promocionales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku }),
    });
    const data = await res.json();
    if (data.promocional) {
      setPromocionales((prev) => [...prev, sku]);
    } else {
      setPromocionales((prev) => prev.filter((s) => s !== sku));
    }
  }

  async function searchProductsForPromo(q: string) {
    setSearchProm(q);
    if (q.length < 2) { setSearchProdResults([]); return; }
    const res = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSearchProdResults(data.products || []);
  }

  function showToast(msg: string) {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(""), 2000);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendedores</h1>
        <Link
          href="/admin/vendedores/reporte"
          className="px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 transition-colors"
        >
          Reporte de comisiones
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-4">
        <button
          onClick={() => setTab("vendedores")}
          className={`px-4 py-1.5 text-sm rounded-md ${tab === "vendedores" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
        >
          <HiOutlineUser className="inline w-4 h-4 mr-1" />
          Comisiones por rubro
        </button>
        <button
          onClick={() => setTab("promocionales")}
          className={`px-4 py-1.5 text-sm rounded-md ${tab === "promocionales" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
        >
          <HiOutlineGift className="inline w-4 h-4 mr-1" />
          Promocionales
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`px-4 py-1.5 text-sm rounded-md ${tab === "settings" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
        >
          <HiOutlineCog className="inline w-4 h-4 mr-1" />
          Configuración
        </button>
      </div>

      {loading && <p className="text-gray-400">Cargando...</p>}

      {/* Comisiones tab */}
      {!loading && tab === "vendedores" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Vendedor list */}
          <div className="bg-white border rounded-xl p-2 max-h-[600px] overflow-y-auto">
            {vendedores.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">No hay vendedores cargados en PunTouch (Empleados con flag Vendedor)</p>
            ) : vendedores.map((v) => (
              <button
                key={v.cod}
                onClick={() => setSelectedVendedor(v)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedVendedor?.cod === v.cod
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                {v.nombre}
              </button>
            ))}
          </div>

          {/* Comisiones por rubro */}
          <div className="md:col-span-2 bg-white border rounded-xl p-4">
            {!selectedVendedor ? (
              <p className="text-sm text-gray-400">Seleccioná un vendedor para ver/editar sus comisiones por rubro.</p>
            ) : (
              <>
                <h3 className="font-medium text-gray-800 mb-3">
                  Comisiones de {selectedVendedor.nombre}
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Por defecto se usa {settings.defaultComision}%. Cargá un valor solo si querés sobreescribir para ese rubro. 0 = sin comisión.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
                  {rubros.map((r) => (
                    <div key={r.cod} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <span className="flex-1 text-sm text-gray-700 truncate">{r.nombre}</span>
                      <input
                        type="number"
                        step="0.5"
                        defaultValue={getComision(selectedVendedor.cod, r.cod) || ""}
                        placeholder={String(settings.defaultComision)}
                        onBlur={(e) => updateComision(selectedVendedor.cod, r.cod, parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-sm text-center border rounded"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Promocionales tab */}
      {!loading && tab === "promocionales" && (
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500 mb-3">
            Los productos marcados como promocionales no generan comisión al vendedor y no cuentan para el monto mínimo de pedido.
          </p>

          <div className="relative mb-4">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchProm}
              onChange={(e) => searchProductsForPromo(e.target.value)}
              placeholder="Buscar producto por nombre o SKU..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
            />
          </div>

          {searchProdResults.length > 0 && (
            <div className="border rounded-lg max-h-60 overflow-y-auto mb-4">
              {searchProdResults.map((p) => (
                <div key={p.sku} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-gray-50">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <span className="text-xs text-gray-400 ml-2">SKU: {p.sku}</span>
                  </div>
                  <button
                    onClick={() => togglePromocional(p.sku)}
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      promocionales.includes(p.sku)
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {promocionales.includes(p.sku) ? "Promocional ✓" : "Marcar promocional"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Productos promocionales actuales ({promocionales.length})
            </h3>
            {promocionales.length === 0 ? (
              <p className="text-sm text-gray-400">Ninguno cargado todavía.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {promocionales.map((sku) => (
                  <span key={sku} className="text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-700 flex items-center gap-2">
                    SKU {sku}
                    <button
                      onClick={() => togglePromocional(sku)}
                      className="text-purple-500 hover:text-purple-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings tab */}
      {!loading && tab === "settings" && (
        <div className="bg-white border rounded-xl p-4 max-w-xl">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Markup sobre Mayorista (%)
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Porcentaje que se suma al precio Mayorista (Precio2) para calcular el precio que ve el cliente.
              </p>
              <input
                type="number"
                step="0.5"
                value={settings.markup}
                onChange={(e) => setSettings({ ...settings, markup: parseFloat(e.target.value) || 0 })}
                className="w-32 px-3 py-2 border rounded-lg text-sm"
              />
              <span className="text-xs text-gray-400 ml-2">% (default: 3)</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monto mínimo de pedido
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Pedido mínimo que el vendedor puede tomar. Los artículos promocionales no cuentan.
              </p>
              <input
                type="number"
                step="100"
                value={settings.minOrder}
                onChange={(e) => setSettings({ ...settings, minOrder: parseFloat(e.target.value) || 0 })}
                className="w-40 px-3 py-2 border rounded-lg text-sm"
              />
              <span className="text-xs text-gray-400 ml-2">pesos (0 = sin mínimo)</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comisión por defecto
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Si un vendedor no tiene comisión específica para un rubro, usa este valor.
              </p>
              <input
                type="number"
                step="0.5"
                value={settings.defaultComision}
                onChange={(e) => setSettings({ ...settings, defaultComision: parseFloat(e.target.value) || 0 })}
                className="w-32 px-3 py-2 border rounded-lg text-sm"
              />
              <span className="text-xs text-gray-400 ml-2">% (default: 3)</span>
            </div>

            <button
              onClick={saveSettings}
              className="px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500"
            >
              Guardar configuración
            </button>
          </div>
        </div>
      )}

      {savedToast && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {savedToast}
        </div>
      )}
    </div>
  );
}
