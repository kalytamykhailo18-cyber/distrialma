"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HiOutlineSearch, HiOutlineX, HiOutlineArrowLeft, HiOutlineCamera } from "react-icons/hi";

interface Empleado {
  cod: string;
  nombre: string;
}

interface SearchProduct {
  sku: string;
  name: string;
  barcode: string;
  currentStock: number;
  unit: string;
}

interface CartItem {
  sku: string;
  productName: string;
  cantidad: number;
  stock: number;
  unidad: string;
}

const SUCURSALES = [
  "Local 1 Minorista",
  "Local 2 Vimar",
  "Local 3 Mayorista Merlo",
  "Local 4 Mayorista Pontevedra",
];

const MOTIVOS = [
  "Envío a local",
  "Descuento empleados",
  "Descuento local",
  "Rotura de proveedor",
  "Rotura de empleado",
  "Descuento global",
];

export default function NuevoMovimiento() {
  const router = useRouter();
  const [sucursal, setSucursal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [selectedEmpleados, setSelectedEmpleados] = useState<Empleado[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Load employees
  useEffect(() => {
    fetch("/api/admin/cierre-caja/empleados?all=1")
      .then((r) => r.json())
      .then((data) => setEmpleados(data.empleados || []))
      .catch(() => {});
  }, []);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const scanningRef = useRef(false);

  // Restore draft from sessionStorage
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem("movimiento_draft");
      if (draft) {
        const d = JSON.parse(draft);
        if (d.sucursal) setSucursal(d.sucursal);
        if (d.motivo) setMotivo(d.motivo);
        if (d.notas) setNotas(d.notas);
        if (d.items?.length) setItems(d.items);
        if (d.selectedEmpleados?.length) setSelectedEmpleados(d.selectedEmpleados);
      }
    } catch { /* ignore */ }
  }, []);

  // Save draft
  useEffect(() => {
    if (sucursal || motivo || items.length > 0) {
      sessionStorage.setItem("movimiento_draft", JSON.stringify({ sucursal, motivo, notas, items, selectedEmpleados }));
    }
  }, [sucursal, motivo, notas, items, selectedEmpleados]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scanningRef.current) {
        scanningRef.current = false;
        import("@ericblade/quagga2").then(({ default: Quagga }) => {
          Quagga.stop();
        }).catch(() => {});
      }
    };
  }, []);

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.products || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchProducts(val), 300);
  }

  function addItem(product: SearchProduct) {
    const existing = items.find((i) => i.sku === product.sku);
    if (existing) {
      setItems((prev) =>
        prev.map((i) => i.sku === product.sku ? { ...i, cantidad: i.cantidad + 1 } : i)
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          sku: product.sku,
          productName: product.name,
          cantidad: 1,
          stock: product.currentStock,
          unidad: product.unit,
        },
      ]);
    }
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateQty(sku: string, val: string) {
    const qty = parseFloat(val.replace(/,/g, ".")) || 0;
    setItems((prev) => prev.map((i) => (i.sku === sku ? { ...i, cantidad: qty } : i)));
  }

  function removeItem(sku: string) {
    setItems((prev) => prev.filter((i) => i.sku !== sku));
  }

  function toggleEmpleado(emp: Empleado) {
    setSelectedEmpleados((prev) => {
      const exists = prev.find((e) => e.cod === emp.cod);
      if (exists) return prev.filter((e) => e.cod !== emp.cod);
      return [...prev, emp];
    });
  }

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    setScanning(false);
    import("@ericblade/quagga2").then(({ default: Quagga }) => {
      Quagga.stop();
    }).catch(() => {});
  }, []);

  function handleBarcodeDetected(code: string) {
    stopScanner();
    setSearch(code);
    setSearching(true);
    fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data) => {
        const products = data.products || [];
        setResults(products);
        if (products.length === 1) {
          addItem(products[0]);
        }
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }

  async function startScanner() {
    setScanError("");
    scanningRef.current = true;
    setScanning(true);

    try {
      const { default: Quagga } = await import("@ericblade/quagga2");

      await new Promise((r) => setTimeout(r, 100));

      const target = document.getElementById("scanner-container");
      if (!target) {
        setScanError("Error al iniciar escáner");
        setScanning(false);
        scanningRef.current = false;
        return;
      }

      await Quagga.init({
        inputStream: {
          type: "LiveStream",
          target,
          constraints: {
            facingMode: "environment",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        },
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "upc_reader"],
        },
        locate: true,
        numOfWorkers: 0,
      });

      Quagga.start();

      let lastCode = "";
      let codeCount = 0;

      Quagga.onDetected((result) => {
        const code = result?.codeResult?.code;
        if (!code || !scanningRef.current) return;
        if (!/^\d{8}$|^\d{13}$/.test(code)) return;

        if (code === lastCode) {
          codeCount++;
        } else {
          lastCode = code;
          codeCount = 1;
        }

        if (codeCount >= 3) {
          handleBarcodeDetected(code);
        }
      });
    } catch {
      setScanError("No se pudo acceder a la cámara.");
      setScanning(false);
      scanningRef.current = false;
    }
  }

  async function handleSubmit() {
    if (!sucursal) { alert("Seleccioná una sucursal"); return; }
    if (!motivo) { alert("Seleccioná un motivo"); return; }
    if ((motivo === "Rotura de empleado" || motivo === "Descuento empleados") && selectedEmpleados.length === 0) {
      alert("Seleccioná al menos un empleado responsable"); return;
    }
    if (items.length === 0) { alert("Agregá al menos un producto"); return; }

    const invalid = items.filter((i) => i.cantidad <= 0);
    if (invalid.length > 0) { alert("Todos los productos deben tener cantidad mayor a 0"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal,
          destino: motivo,
          notas,
          items,
          empleados: (motivo === "Rotura de empleado" || motivo === "Descuento empleados") ? selectedEmpleados : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al crear movimiento");
        return;
      }

      sessionStorage.removeItem("movimiento_draft");
      router.push("/admin/movimientos");
    } catch {
      alert("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            if (items.length > 0 && !confirm("¿Salir? Se perderán los cambios no guardados.")) return;
            router.push("/admin/movimientos");
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo Movimiento Interno</h1>
      </div>

      {/* Step 1: Sucursal */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">1. Sucursal</label>
        <div className="grid grid-cols-2 gap-2">
          {SUCURSALES.map((s) => (
            <button
              key={s}
              onClick={() => setSucursal(s)}
              className={`px-3 py-2.5 text-sm rounded-lg border transition-colors text-left ${
                sucursal === s
                  ? "border-brand-400 bg-brand-50 text-brand-600 font-medium"
                  : "border-gray-200 hover:border-gray-300 text-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Motivo */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">2. Motivo</label>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVOS.map((m) => {
            const isRed = m.includes("Rotura") || m.includes("Descuento");
            return (
              <button
                key={m}
                onClick={() => setMotivo(m)}
                className={`px-3 py-2.5 text-sm rounded-lg border transition-colors text-left ${
                  motivo === m
                    ? isRed
                      ? "border-red-400 bg-red-50 text-red-600 font-medium"
                      : "border-brand-400 bg-brand-50 text-brand-600 font-medium"
                    : "border-gray-200 hover:border-gray-300 text-gray-700"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2b: Empleados (only for Rotura de empleado) */}
      {(motivo === "Rotura de empleado" || motivo === "Descuento empleados") && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Empleado(s) responsable(s) <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-400 mb-3">
            El descuento se divide entre los seleccionados a fin de mes.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {empleados.map((emp) => {
              const selected = selectedEmpleados.some((e) => e.cod === emp.cod);
              return (
                <button
                  key={emp.cod}
                  onClick={() => toggleEmpleado(emp)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                    selected
                      ? "border-red-400 bg-red-50 text-red-700 font-medium"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <span className="text-xs text-gray-400 mr-1">#{emp.cod}</span> {emp.nombre}
                </button>
              );
            })}
          </div>
          {selectedEmpleados.length > 0 && (
            <p className="text-xs text-red-600 mt-2 font-medium">
              {selectedEmpleados.length} empleado{selectedEmpleados.length > 1 ? "s" : ""} seleccionado{selectedEmpleados.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* Step 3: Products */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">3. Productos</label>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Nombre, SKU o código de barras..."
              className="w-full pl-10 pr-4 py-2.5 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full" />
              </div>
            )}
          </div>
          <button
            onClick={startScanner}
            disabled={scanning}
            className="px-3 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 hover:text-brand-600 transition-colors disabled:opacity-50"
            title="Escanear código de barras"
          >
            <HiOutlineCamera className="w-5 h-5" />
          </button>
        </div>

        {/* Camera scanner */}
        {scanning && (
          <div className="mt-3 relative rounded-lg overflow-hidden bg-black">
            <div
              id="scanner-container"
              className="w-full"
              style={{ minHeight: "240px" }}
            />
            <button
              onClick={stopScanner}
              className="absolute top-2 right-2 bg-white/80 rounded-full p-1.5 hover:bg-white"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
        )}
        {scanError && (
          <p className="text-xs text-red-500 mt-2">{scanError}</p>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <div className="mt-2 border rounded-lg max-h-60 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.sku}
                onClick={() => addItem(p)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 flex items-center justify-between"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  <span className="text-xs text-gray-400 ml-2">SKU: {p.sku}</span>
                  {p.barcode && (
                    <span className="text-xs text-gray-400 ml-2">CB: {p.barcode}</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">Stock: {p.currentStock}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Productos ({items.length})
          </h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.sku} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                  <p className="text-xs text-gray-400">SKU: {item.sku} — Stock: {item.stock} {item.unidad}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={item.cantidad || ""}
                    onChange={(e) => updateQty(item.sku, e.target.value)}
                    min="0"
                    step={item.unidad === "KG" ? "0.001" : "1"}
                    className="w-20 text-sm text-center border border-brand-400 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <span className="text-xs text-gray-400 w-6">{item.unidad || "UN"}</span>
                  <button onClick={() => removeItem(item.sku)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <HiOutlineX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Notas (opcional)</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full border border-brand-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          placeholder="Observaciones sobre el movimiento..."
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving || !sucursal || !motivo || items.length === 0}
        className="w-full py-3 text-sm font-medium text-white bg-brand-400 rounded-xl hover:bg-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Enviando..." : "Enviar para aprobación"}
      </button>
    </div>
  );
}
