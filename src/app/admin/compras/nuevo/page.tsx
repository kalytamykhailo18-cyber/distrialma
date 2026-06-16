"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { HiOutlineTrash, HiOutlinePlus, HiOutlineSearch, HiOutlineCamera, HiOutlineX, HiChevronUp, HiChevronDown } from "react-icons/hi";
import { PageTransition, Stagger, springBtn, hoverRow } from "@/components/AnimateIn";

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
  unit: string;
  isNewProduct: boolean;
  barcode?: string;
  newProductName?: string;
  costo?: string;
}

export default function NuevoIngresoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as { role?: string; permissions?: string[]; defaultDeposito?: string } | undefined;
  const hasCosteo = user?.role === "admin" || (user?.permissions?.includes("costeo") ?? false);

  const [deposito, setDeposito] = useState<string>("0");
  // Once the session loads, default the deposito to the user's preference (only if it wasn't set already)
  useEffect(() => {
    if (user?.defaultDeposito && deposito === "0") setDeposito(user.defaultDeposito);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.defaultDeposito]);

  // Check if this is a devolucion
  const isDevolucion = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tipo") === "devolucion";

  const STORAGE_KEY = isDevolucion ? "compras_devolucion_draft" : "compras_ingreso_draft";

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [selectedProv, setSelectedProv] = useState(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.selectedProv || ""; } catch { return ""; }
    }
    return "";
  });
  const [selectedProvName, setSelectedProvName] = useState(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.selectedProvName || ""; } catch { return ""; }
    }
    return "";
  });
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.items || []; } catch { return []; }
    }
    return [];
  });
  const [notas, setNotas] = useState(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.notas || ""; } catch { return ""; }
    }
    return "";
  });
  const [nroFactura, setNroFactura] = useState(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.nroFactura || ""; } catch { return ""; }
    }
    return "";
  });
  const [neto, setNeto] = useState(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.neto || ""; } catch { return ""; }
    }
    return "";
  });
  const [iva, setIva] = useState(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.iva || ""; } catch { return ""; }
    }
    return "";
  });
  const [percepciones, setPercepciones] = useState(() => {
    if (typeof window !== "undefined") {
      try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); return d.percepciones || ""; } catch { return ""; }
    }
    return "";
  });
  const [totalManual, setTotalManual] = useState(false);
  const [totalAmt, setTotalAmt] = useState("");
  const [facturaFiles, setFacturaFiles] = useState<File[]>([]);
  const [facturaPreviews, setFacturaPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Persist form state to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedProv, selectedProvName, items, notas, nroFactura, neto, iva, percepciones,
      }));
    }
  }, [selectedProv, selectedProvName, items, notas, nroFactura, neto, iva, percepciones, STORAGE_KEY]);

  // Parse "1.234,56" (AR) or "1234.56" decimal strings
  function parseAmt(s: string): number {
    if (!s) return 0;
    let v = s.trim();
    if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // Auto-recompute total from neto + iva + percepciones unless user edited it manually
  useEffect(() => {
    if (totalManual) return;
    const sum = parseAmt(neto) + parseAmt(iva) + parseAmt(percepciones);
    setTotalAmt(sum > 0 ? sum.toFixed(2) : "");
  }, [neto, iva, percepciones, totalManual]);

  // Warn before leaving with unsaved data
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (items.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [items]);


  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Proveedor combobox state
  const [provSearch, setProvSearch] = useState("");
  const [showProvDropdown, setShowProvDropdown] = useState(false);
  const provBoxRef = useRef<HTMLDivElement>(null);
  // Sync visible text with stored selection name when it loads / changes externally
  useEffect(() => { setProvSearch(selectedProvName); }, [selectedProvName]);

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
      if (provBoxRef.current && !provBoxRef.current.contains(e.target as Node)) {
        setShowProvDropdown(false);
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

      // Require same code detected 3 times to avoid false positives
      let lastCode = "";
      let codeCount = 0;

      Quagga.onDetected((result) => {
        const code = result?.codeResult?.code;
        if (!code || !scanningRef.current) return;

        // Validate: must be only digits, 8 or 13 chars (EAN format)
        if (!/^\d{8}$|^\d{13}$/.test(code)) return;

        if (code === lastCode) {
          codeCount++;
        } else {
          lastCode = code;
          codeCount = 1;
        }

        // Only accept after 3 consecutive same reads
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
    }, 500);
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
        unit: product.unit || "UN",
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
        unit: "UN",
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

  function moveItem(index: number, direction: -1 | 1) {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    setItems((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
      return arr;
    });
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
          tipo: isDevolucion ? "devolucion" : "ingreso",
          proveedorCod: selectedProv,
          proveedorName: selectedProvName,
          notas: notas.trim() || null,
          nroFactura: nroFactura.trim() || null,
          deposito,
          subtotal: parseAmt(neto),
          iva: parseAmt(iva),
          percepciones: parseAmt(percepciones),
          total: parseAmt(totalAmt),
          items: items.map((i) => ({
            sku: i.isNewProduct ? undefined : i.sku,
            productName: i.productName,
            cantidad: parseFloat(i.cantidad),
            isNewProduct: i.isNewProduct,
            barcode: i.barcode,
            newProductName: i.newProductName,
            costo: i.costo ? parseFloat(i.costo) : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");

      // Upload factura photos if selected
      for (const file of facturaFiles) {
        if (data.entry?.id) {
          const formData = new FormData();
          formData.append("image", file);
          formData.append("entryId", String(data.entry.id));
          await fetch("/api/admin/stock-entries/upload-factura", { method: "POST", body: formData }).catch(() => {});
        }
      }

      // Clear saved draft on success
      sessionStorage.removeItem(STORAGE_KEY);

      if (hasCosteo) {
        router.push(`/admin/compras/${data.entry.id}`);
      } else {
        setSuccessMsg(isDevolucion ? "Devolución cargada correctamente" : "Ingreso aceptado correctamente");
        setItems([]);
        setNotas("");
        setNroFactura("");
        setNeto(""); setIva(""); setPercepciones(""); setTotalAmt(""); setTotalManual(false);
        setFacturaFiles([]);
        setFacturaPreviews([]);
        setSelectedProv("");
        setSelectedProvName("");
        setTimeout(() => setSuccessMsg(""), 5000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            if (items.length > 0 && !confirm("Tenés productos cargados. ¿Salir? Los datos quedan guardados.")) return;
            router.push("/admin/compras");
          }}
          className={`text-gray-400 hover:text-gray-600 ${springBtn}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{isDevolucion ? "Pre-nota de Crédito" : "Nuevo Ingreso de Stock"}</h1>
      </div>
      </Stagger>

      {/* Supplier selector */}
      <Stagger delay={50} zIndex={showProvDropdown ? 50 : undefined}>
      <div className="mb-4" ref={provBoxRef}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Proveedor
        </label>
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          <input
            type="text"
            value={provSearch}
            onChange={(e) => {
              setProvSearch(e.target.value);
              setShowProvDropdown(true);
              // Clear stored selection while user is typing — must re-pick from list
              if (selectedProv) { setSelectedProv(""); setSelectedProvName(""); }
            }}
            onFocus={() => setShowProvDropdown(true)}
            placeholder="Buscar proveedor por nombre o codigo..."
            className="w-full pl-9 pr-9 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          {provSearch && (
            <button
              type="button"
              onClick={() => { setProvSearch(""); setSelectedProv(""); setSelectedProvName(""); setShowProvDropdown(true); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Limpiar"
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          )}
          {showProvDropdown && (() => {
            const q = provSearch.trim().toLowerCase();
            const filtered = q
              ? proveedores.filter((p) => p.nombre.toLowerCase().includes(q) || p.cod.includes(q))
              : proveedores;
            const shown = filtered.slice(0, 50);
            return (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                {shown.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">Sin resultados</div>
                ) : shown.map((p) => (
                  <button
                    key={p.cod}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSelectedProv(p.cod);
                      setSelectedProvName(p.nombre);
                      setProvSearch(p.nombre);
                      setShowProvDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-50 flex items-center justify-between ${selectedProv === p.cod ? "bg-brand-50 font-medium" : ""}`}
                  >
                    <span>{p.nombre}</span>
                    <span className="text-xs text-gray-400 font-mono ml-2">#{p.cod}</span>
                  </button>
                ))}
                {filtered.length > shown.length && (
                  <div className="px-4 py-2 text-xs text-gray-400 border-t">
                    Mostrando {shown.length} de {filtered.length} — segui escribiendo para filtrar
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      </Stagger>

      {/* Product search */}
      <div className="mb-4 relative" ref={searchRef} style={{ zIndex: showResults ? 60 : "auto" }}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Buscar producto
        </label>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { handleSearch(e.target.value); setSelectedIdx(-1); }}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onKeyDown={(e) => {
                if (!showResults || searchResults.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedIdx((prev) => Math.max(prev - 1, -1));
                } else if (e.key === "Enter" && selectedIdx >= 0) {
                  e.preventDefault();
                  addProduct(searchResults[selectedIdx]);
                  setSelectedIdx(-1);
                }
              }}
              placeholder="Buscar por nombre, codigo o codigo de barras..."
              className="w-full pl-9 pr-4 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
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
            className={`flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-brand-400 rounded-xl hover:bg-brand-500 disabled:opacity-50 transition-colors shrink-0 ${springBtn}`}
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
          <div className="absolute left-0 right-0 z-50 bg-white border rounded-xl shadow-lg mt-1 max-h-60 overflow-y-auto">
            {searchResults.map((p, idx) => (
              <button
                key={p.sku}
                ref={(el) => { if (idx === selectedIdx && el) el.scrollIntoView({ block: "nearest" }); }}
                onClick={() => { addProduct(p); setSelectedIdx(-1); }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${hoverRow} ${
                  idx === selectedIdx ? "bg-brand-50 text-brand-700" : ""
                }`}
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
      <Stagger delay={150}>
      <div className="mb-6">
        {showNewProduct ? (
          <div className="bg-gray-50 rounded-xl border shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Producto nuevo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder="Código de barras (opcional)"
                className="px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del producto"
                className="px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addNewProduct}
                disabled={!newName.trim()}
                className={`px-3 py-1.5 text-sm text-white bg-brand-400 rounded-xl hover:bg-brand-500 disabled:opacity-50 transition-colors ${springBtn}`}
              >
                Agregar
              </button>
              <button
                onClick={() => setShowNewProduct(false)}
                className={`px-3 py-1.5 text-sm text-gray-600 border border-brand-400 rounded-xl hover:bg-gray-50 transition-colors ${springBtn}`}
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
      </Stagger>

      {/* Items table */}
      <Stagger delay={200}>
      {items.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b">
                <th className="text-center px-1 py-2 w-10"></th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-right px-3 py-2 w-24">Cantidad</th>
                {hasCosteo && <th className="text-right px-3 py-2 w-24">Costo</th>}
                <th className="text-center px-1 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, idx) => (
                <tr key={idx} className={hoverRow}>
                  <td className="px-1 py-2 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors"
                      >
                        <HiChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === items.length - 1}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors"
                      >
                        <HiChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-gray-900 text-sm">{item.productName}</span>
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
                    <div className="text-gray-400 text-xs">{item.isNewProduct ? "Producto nuevo" : `SKU ${item.sku}`}</div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={item.unit === "KG" || /\bKG\b/i.test(item.productName) ? "0.001" : "1"}
                      step={item.unit === "KG" || /\bKG\b/i.test(item.productName) ? "0.001" : "1"}
                      value={item.cantidad}
                      onChange={(e) => {
                        const isPesable = item.unit === "KG" || /\bKG\b/i.test(item.productName);
                        const val = isPesable ? e.target.value : String(Math.round(parseFloat(e.target.value) || 0));
                        updateCantidad(idx, val);
                      }}
                      className="w-full text-right px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                  </td>
                  {hasCosteo && (
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.costo || ""}
                        onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, costo: e.target.value } : it))}
                        placeholder="$"
                        className="w-full text-right px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      />
                    </td>
                  )}
                  <td className="px-1 py-2 text-center">
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
      </Stagger>

      {/* Photo + Notes + Invoice number */}
      <Stagger delay={250}>
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Factura photos (multiple) */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isDevolucion ? "Fotos de mercadería a devolución" : "Fotos de factura (opcional)"}
          </label>
          {facturaPreviews.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-2">
              {facturaPreviews.map((preview, i) => (
                <div key={i} className="relative">
                  <img src={preview} alt={`Factura ${i + 1}`} className="h-16 rounded border" />
                  <button
                    onClick={() => {
                      setFacturaFiles((prev) => prev.filter((_, j) => j !== i));
                      setFacturaPreviews((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >x</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className={`cursor-pointer px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100 transition-colors ${springBtn}`}>
              {facturaPreviews.length > 0 ? "Agregar otra foto" : "Sacar foto / Elegir archivo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setFacturaFiles((prev) => [...prev, file]);
                    setFacturaPreviews((prev) => [...prev, URL.createObjectURL(file)]);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>
      </Stagger>
      <Stagger delay={300}>
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notas (opcional)
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Observaciones sobre el ingreso..."
            className="w-full px-4 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nro. Factura (opcional)
          </label>
          <input
            type="text"
            value={nroFactura}
            onChange={(e) => setNroFactura(e.target.value)}
            maxLength={30}
            placeholder="Ej: 0001-00012345"
            className="w-full px-4 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Depósito de ingreso
          </label>
          <select
            value={deposito}
            onChange={(e) => setDeposito(e.target.value)}
            className="w-full px-4 py-2 border border-brand-400 rounded-xl text-sm bg-white focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          >
            <option value="0">[0] Distribuidora / Mayorista</option>
            <option value="1">[1] Pontevedra</option>
            <option value="2">[2] Minorista</option>
            <option value="3">[3] Cervantes</option>
          </select>
        </div>
      </div>
      </Stagger>

      {/* Importes — Neto + IVA + Percepciones + Total */}
      <Stagger delay={325}>
      <div className="mb-6 bg-white border border-brand-200 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">Importes de la factura</h3>
          <span className="text-xs text-gray-400">Total = Neto + IVA + Percepciones (editable)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Neto</label>
            <input
              type="text"
              inputMode="decimal"
              value={neto}
              onChange={(e) => setNeto(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="0,00"
              className="w-full px-3 py-2 border border-brand-300 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">IVA</label>
            <input
              type="text"
              inputMode="decimal"
              value={iva}
              onChange={(e) => setIva(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="0,00"
              className="w-full px-3 py-2 border border-brand-300 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Percepciones</label>
            <input
              type="text"
              inputMode="decimal"
              value={percepciones}
              onChange={(e) => setPercepciones(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="0,00"
              className="w-full px-3 py-2 border border-brand-300 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Total {totalManual ? "(manual)" : "(auto)"}</label>
            <div className="flex gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={totalAmt}
                onChange={(e) => { setTotalAmt(e.target.value.replace(/[^0-9.,]/g, "")); setTotalManual(true); }}
                placeholder="0,00"
                className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 ${totalManual ? "border-amber-400 bg-amber-50 font-semibold" : "border-brand-300"}`}
              />
              {totalManual && (
                <button
                  type="button"
                  onClick={() => setTotalManual(false)}
                  className="px-2 text-xs text-amber-700 hover:underline"
                  title="Volver a calcular automaticamente"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </Stagger>

      {/* Error */}
      {successMsg && (
        <div className="mb-4 p-4 bg-green-50 border-2 border-green-300 rounded-xl text-center">
          <p className="text-lg font-bold text-green-700">{successMsg}</p>
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {/* Submit */}
      <Stagger delay={350}>
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className={`px-6 py-2 text-sm text-white bg-brand-400 rounded-xl hover:bg-brand-500 disabled:opacity-50 transition-colors ${springBtn}`}
        >
          {saving ? "Guardando..." : isDevolucion ? "Confirmar devolución" : "Confirmar ingreso"}
        </button>
        <button
          onClick={() => router.push("/admin/compras")}
          disabled={saving}
          className={`px-4 py-2 text-sm text-gray-600 border border-brand-400 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors ${springBtn}`}
        >
          Cancelar
        </button>
      </div>
      </Stagger>
    </PageTransition>
  );
}
