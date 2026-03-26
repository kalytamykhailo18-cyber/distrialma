"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { HiOutlineTrash, HiOutlinePlus, HiOutlineSearch, HiOutlineCamera, HiOutlineX } from "react-icons/hi";

interface Proveedor {
  cod: string;
  nombre: string;
  saldo: number;
}

interface SearchResult {
  sku: string;
  name: string;
  barcode: string;
  currentStock: number;
  unit: string;
}

interface CartItem {
  sku: string;
  productName: string;
  cantidad: string;
  isNewProduct: boolean;
  barcode?: string;
  newProductName?: string;
}

export default function NuevoIngresoPage() {
  const router = useRouter();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [selectedProv, setSelectedProv] = useState("");
  const [selectedProvName, setSelectedProvName] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");


  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const scanningRef = useRef(false);

  // New product form
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newBarcode, setNewBarcode] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch("/api/admin/proveedores")
      .then((r) => r.json())
      .then((data) => setProveedores(data.proveedores || []))
      .catch(() => {});
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    setScanning(false);
    import("@ericblade/quagga2").then(({ default: Quagga }) => {
      Quagga.stop();
    }).catch(() => {});
  }, []);

  function handleBarcodeDetected(code: string) {
    stopScanner();
    setSearchQuery(code);
    setSearching(true);
    fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data) => {
        const products = data.products || [];
        setSearchResults(products);
        setShowResults(true);
        if (products.length === 1) {
          addProduct(products[0]);
        }
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }

  async function startScanner() {
    setScanError("");
    scanningRef.current = true;
    setScanning(true);

    try {
      const { default: Quagga } = await import("@ericblade/quagga2");

      // Wait for the scanner container to be in the DOM
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

      Quagga.onDetected((result) => {
        const code = result?.codeResult?.code;
        if (code && scanningRef.current) {
          handleBarcodeDetected(code);
        }
      });
    } catch {
      setScanError("No se pudo acceder a la cámara.");
      setScanning(false);
      scanningRef.current = false;
    }
  }

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

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(() => {
      fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => {
          setSearchResults(data.products || []);
          setShowResults(true);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }

  function addProduct(product: SearchResult) {
    // Don't add duplicates
    if (items.some((i) => i.sku === product.sku && !i.isNewProduct)) return;
    setItems((prev) => [
      ...prev,
      {
        sku: product.sku,
        productName: product.name,
        cantidad: "1",
        isNewProduct: false,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
  }

  function addNewProduct() {
    if (!newName.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        sku: `new-${Date.now()}`,
        productName: newName.trim(),
        cantidad: "1",
        isNewProduct: true,
        barcode: newBarcode.trim(),
        newProductName: newName.trim(),
      },
    ]);
    setNewBarcode("");
    setNewName("");
    setShowNewProduct(false);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCantidad(index: number, value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, cantidad: value } : item))
    );
  }

  async function handleSubmit() {
    if (!selectedProv) {
      setError("Seleccioná un proveedor");
      return;
    }
    if (items.length === 0) {
      setError("Agregá al menos un producto");
      return;
    }
    // Validate quantities
    for (const item of items) {
      const cant = parseFloat(item.cantidad);
      if (isNaN(cant) || cant <= 0) {
        setError(`Cantidad inválida para ${item.productName}`);
        return;
      }
    }

    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/stock-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorCod: selectedProv,
          proveedorName: selectedProvName,
          notas: notas.trim() || null,
          items: items.map((i) => ({
            sku: i.isNewProduct ? undefined : i.sku,
            productName: i.productName,
            cantidad: parseFloat(i.cantidad),
            isNewProduct: i.isNewProduct,
            barcode: i.barcode,
            newProductName: i.newProductName,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      router.push(`/admin/compras/${data.entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo Ingreso de Stock</h1>

      {/* Supplier selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Proveedor
        </label>
        <select
          value={selectedProv}
          onChange={(e) => {
            setSelectedProv(e.target.value);
            const prov = proveedores.find((p) => p.cod === e.target.value);
            setSelectedProvName(prov?.nombre || "");
          }}
          className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        >
          <option value="">Seleccionar proveedor...</option>
          {proveedores.map((p) => (
            <option key={p.cod} value={p.cod}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Product search */}
      <div className="mb-4" ref={searchRef}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Buscar producto
        </label>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder="Buscar por nombre, codigo o codigo de barras..."
              className="w-full pl-9 pr-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                Buscando...
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={startScanner}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors shrink-0"
            title="Escanear con camara"
          >
            <HiOutlineCamera className="w-4 h-4" />
            <span className="hidden sm:inline">Escanear</span>
          </button>
        </div>
        {scanError && (
          <p className="text-xs text-red-600 mt-1">{scanError}</p>
        )}

        {/* Camera scanner overlay */}
        {scanning && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
            <div className="relative w-full max-w-md mx-4">
              <div
                id="scanner-container"
                className="w-full rounded-lg overflow-hidden bg-black"
                style={{ minHeight: 300 }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-16 border-2 border-white/60 rounded-lg" />
              </div>
              <button
                onClick={stopScanner}
                className="absolute top-3 right-3 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors z-10"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
              <p className="text-white text-center text-sm mt-3">
                Apuntá la cámara al código de barras
              </p>
            </div>
          </div>
        )}

        {showResults && searchResults.length > 0 && (
          <div className="absolute z-30 bg-white border rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto w-full max-w-4xl">
            {searchResults.map((p) => (
              <button
                key={p.sku}
                onClick={() => addProduct(p)}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center justify-between"
              >
                <div>
                  <span className="text-gray-900">{p.name}</span>
                  <span className="text-gray-400 text-xs ml-2">({p.sku})</span>
                  {p.barcode && (
                    <span className="text-gray-400 text-xs ml-2">
                      CB: {p.barcode}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  Stock: {p.currentStock} {p.unit}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New product button */}
      <div className="mb-6">
        {showNewProduct ? (
          <div className="bg-gray-50 rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Producto nuevo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder="Código de barras (opcional)"
                className="px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del producto"
                className="px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addNewProduct}
                disabled={!newName.trim()}
                className="px-3 py-1.5 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
              >
                Agregar
              </button>
              <button
                onClick={() => setShowNewProduct(false)}
                className="px-3 py-1.5 text-sm text-gray-600 border border-brand-400 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewProduct(true)}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Producto nuevo
          </button>
        )}
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div className="bg-white rounded-lg border mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b">
                <th className="text-left px-4 py-2">Producto</th>
                <th className="text-left px-4 py-2 w-20">SKU</th>
                <th className="text-right px-4 py-2 w-28">Cantidad</th>
                <th className="text-center px-4 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2">
                    <span className="text-gray-900">{item.productName}</span>
                    {item.isNewProduct && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                        Nuevo
                      </span>
                    )}
                    {item.barcode && (
                      <span className="text-gray-400 text-xs ml-2">
                        CB: {item.barcode}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {item.isNewProduct ? "—" : item.sku}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.cantidad}
                      onChange={(e) => updateCantidad(idx, e.target.value)}
                      className="w-full text-right px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => removeItem(idx)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="Observaciones sobre el ingreso..."
          className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {saving ? "Guardando..." : "Confirmar ingreso"}
        </button>
        <button
          onClick={() => router.push("/admin/compras")}
          disabled={saving}
          className="px-4 py-2 text-sm text-gray-600 border border-brand-400 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
