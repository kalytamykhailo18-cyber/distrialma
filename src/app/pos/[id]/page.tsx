"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import {
  HiOutlineSearch, HiOutlineTrash, HiOutlinePlus, HiOutlineMinus,
  HiOutlineUser, HiOutlineUserGroup, HiOutlineDesktopComputer,
} from "react-icons/hi";

interface Terminal {
  id: number;
  nombre: string;
  sucursal: string;
  sucursalNombre: string;
  listas: string;
  cuit: string;
  flujo: string;
  requiereCliente: boolean;
}

interface Empleado {
  cod: string;
  nombre: string;
}

interface Cliente {
  cod: string;
  nombre: string;
  cuit: string;
  zona: string;
  listaPrecios: string;
}

interface PosProduct {
  sku: string;
  nombre: string;
  unidad: string;
  precios: Record<number, number>;
  stock: number;
  codBarra: string;
  cantPorCaja: number;
}

interface CartItem {
  sku: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  precio: number;
  lista: number;
}

const LISTA_LABELS: Record<number, string> = { 1: "Minorista", 2: "Mayorista", 3: "Especial", 4: "Caja Cerrada", 5: "PedidosYa" };
const STORAGE_KEY = "pos_cart_";

export default function PosPage() {
  const params = useParams();
  const terminalId = params.id as string;

  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<Cliente[]>([]);
  const [showClientSearch, setShowClientSearch] = useState(false);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PosProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout>();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Determine active price list
  const getActiveLista = useCallback((): number => {
    if (!terminal) return 2;
    const listas = terminal.listas.split(",").map(Number);
    // If client has specific list, use it
    if (selectedCliente?.listaPrecios) {
      const clientLista = Number(selectedCliente.listaPrecios);
      if (listas.includes(clientLista)) return clientLista;
    }
    return listas[0] || 2;
  }, [terminal, selectedCliente]);

  // Load terminal config
  useEffect(() => {
    setLoading(true);
    fetch(`/api/pos/config?terminalId=${terminalId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.terminal) setTerminal(d.terminal);
        else setError("Terminal no encontrada");
        setEmpleados(d.empleados || []);

        // Restore seller from localStorage
        const savedSeller = localStorage.getItem(`pos_seller_${terminalId}`);
        if (savedSeller) {
          const emp = (d.empleados || []).find((e: Empleado) => e.cod === savedSeller);
          if (emp) setSelectedEmpleado(emp);
        }
      })
      .catch(() => setError("Error al cargar terminal"))
      .finally(() => setLoading(false));
  }, [terminalId]);

  // Load cart from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY + terminalId);
    if (saved) {
      try { setCart(JSON.parse(saved)); } catch {}
    }
  }, [terminalId]);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + terminalId, JSON.stringify(cart));
  }, [cart, terminalId]);

  // Save seller to localStorage
  useEffect(() => {
    if (selectedEmpleado) {
      localStorage.setItem(`pos_seller_${terminalId}`, selectedEmpleado.cod);
    }
  }, [selectedEmpleado, terminalId]);

  // Product search with debounce
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!search.trim() || search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/pos/products?q=${encodeURIComponent(search.trim())}`);
        const d = await res.json();
        setSearchResults(d.products || []);
      } catch {}
      setSearching(false);
    }, 200);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  // Client search with debounce
  useEffect(() => {
    if (!clientSearch.trim() || clientSearch.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/config?terminalId=${terminalId}&searchClient=${encodeURIComponent(clientSearch.trim())}`);
        const d = await res.json();
        setClientResults(d.clientes || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timeout);
  }, [clientSearch, terminalId]);

  // Barcode scan handler
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && search.trim()) {
      e.preventDefault();
      // Try barcode scan first
      const val = search.trim();
      if (/^\d{4,}$/.test(val)) {
        fetch(`/api/pos/products?barcode=${encodeURIComponent(val)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.products?.length > 0) {
              addToCart(d.products[0]);
              setSearch("");
              setSearchResults([]);
            }
          })
          .catch(() => {});
      } else if (searchResults.length === 1) {
        addToCart(searchResults[0]);
        setSearch("");
        setSearchResults([]);
      }
    }
  }

  function addToCart(product: PosProduct) {
    const lista = getActiveLista();
    const precio = product.precios[lista] || product.precios[2] || 0;

    setCart((prev) => {
      const existing = prev.find((i) => i.sku === product.sku);
      if (existing) {
        return prev.map((i) => i.sku === product.sku
          ? { ...i, cantidad: i.cantidad + 1 }
          : i
        );
      }
      return [...prev, {
        sku: product.sku,
        nombre: product.nombre,
        unidad: product.unidad,
        cantidad: 1,
        precio,
        lista,
      }];
    });

    // Re-focus search
    searchRef.current?.focus();
  }

  function updateQty(sku: string, delta: number) {
    setCart((prev) => prev.map((i) => {
      if (i.sku !== sku) return i;
      const newQty = i.cantidad + delta;
      return newQty > 0 ? { ...i, cantidad: newQty } : i;
    }));
  }

  function setQty(sku: string, qty: number) {
    if (qty <= 0) return;
    setCart((prev) => prev.map((i) => i.sku === sku ? { ...i, cantidad: qty } : i));
  }

  function removeFromCart(sku: string) {
    setCart((prev) => prev.filter((i) => i.sku !== sku));
  }

  function clearCart() {
    setCart([]);
  }

  const total = cart.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.cantidad, 0);
  const activeLista = getActiveLista();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-400 animate-pulse">Cargando terminal...</div>
      </div>
    );
  }

  if (error || !terminal) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <HiOutlineDesktopComputer className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-red-500 font-medium">{error || "Terminal no encontrada"}</p>
          <p className="text-sm text-gray-400 mt-2">Verifica que la URL sea correcta (/pos/ID)</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <span className="font-bold text-gray-900">{terminal.nombre}</span>
            <span className="text-xs text-gray-400 ml-2">{terminal.sucursalNombre}</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">
            {LISTA_LABELS[activeLista] || `Lista ${activeLista}`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Seller select */}
          <div className="flex items-center gap-2">
            <HiOutlineUser className="w-4 h-4 text-gray-400" />
            <select
              value={selectedEmpleado?.cod || ""}
              onChange={(e) => {
                const emp = empleados.find((x) => x.cod === e.target.value);
                setSelectedEmpleado(emp || null);
              }}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-500"
            >
              <option value="">Vendedor...</option>
              {empleados.map((e) => (
                <option key={e.cod} value={e.cod}>{e.nombre}</option>
              ))}
            </select>
          </div>

          {/* Client select */}
          {terminal.requiereCliente && (
            <div className="relative">
              <div className="flex items-center gap-2">
                <HiOutlineUserGroup className="w-4 h-4 text-gray-400" />
                {selectedCliente ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">{selectedCliente.nombre}</span>
                    <button onClick={() => { setSelectedCliente(null); setShowClientSearch(true); }}
                      className="text-xs text-red-500 hover:text-red-700">✕</button>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setShowClientSearch(true); }}
                    onFocus={() => setShowClientSearch(true)}
                    className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 w-48 focus:outline-none focus:border-brand-500"
                  />
                )}
              </div>
              {showClientSearch && clientResults.length > 0 && !selectedCliente && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 w-72 max-h-60 overflow-y-auto">
                  {clientResults.map((c) => (
                    <button key={c.cod} onClick={() => {
                      setSelectedCliente(c);
                      setClientSearch("");
                      setClientResults([]);
                      setShowClientSearch(false);
                    }} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0">
                      <div className="text-sm font-medium text-gray-800">{c.nombre}</div>
                      <div className="text-xs text-gray-400">
                        {c.cuit && `CUIT: ${c.cuit}`} {c.zona && `· ${c.zona}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Search + results */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          {/* Search bar */}
          <div className="relative mb-3">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar producto o escanear codigo de barras..."
              className="w-full pl-10 pr-4 py-3 text-lg border-2 border-brand-400 rounded-xl focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
              autoFocus
            />
            {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Buscando...</div>}
          </div>

          {/* Search results */}
          <div className="flex-1 overflow-y-auto">
            {searchResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {searchResults.map((p) => {
                  const precio = p.precios[activeLista] || p.precios[2] || 0;
                  const inCart = cart.find((i) => i.sku === p.sku);
                  return (
                    <button
                      key={p.sku}
                      onClick={() => addToCart(p)}
                      className={`text-left p-3 rounded-xl border-2 transition-all duration-150 ${
                        inCart ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white hover:border-brand-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900 line-clamp-2">{p.nombre}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400 font-mono">{p.sku}</span>
                        <span className="font-bold text-brand-600">{formatPrice(precio)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {p.unidad === "KG" ? "/kg" : "/un"}
                          {p.stock > 0 && <span className="text-green-500 ml-2">En stock</span>}
                          {p.stock <= 0 && <span className="text-red-400 ml-2">Sin stock</span>}
                        </span>
                        {inCart && (
                          <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full">
                            {inCart.cantidad} en carrito
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {search.length >= 2 && searchResults.length === 0 && !searching && (
              <div className="text-center text-gray-400 mt-8">No se encontraron productos</div>
            )}
            {!search && cart.length === 0 && (
              <div className="text-center text-gray-400 mt-16">
                <HiOutlineSearch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Busca un producto o escanea un codigo de barras</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart */}
        <div className="w-96 bg-white border-l flex flex-col shrink-0">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900">
              Carrito
              {itemCount > 0 && <span className="text-sm font-normal text-gray-400 ml-2">({itemCount} items)</span>}
            </h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700">
                Vaciar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 mt-8 text-sm">Carrito vacio</div>
            ) : (
              cart.map((item) => (
                <div key={item.sku} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{item.nombre}</div>
                      <div className="text-xs text-gray-400">{item.sku} · {formatPrice(item.precio)}/{item.unidad === "KG" ? "kg" : "un"}</div>
                    </div>
                    <button onClick={() => removeFromCart(item.sku)} className="text-gray-400 hover:text-red-500 p-1">
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item.sku, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700">
                        <HiOutlineMinus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => setQty(item.sku, parseFloat(e.target.value) || 1)}
                        className="w-16 text-center text-sm font-medium border rounded-lg py-1 focus:outline-none focus:border-brand-500"
                        min="0.01"
                        step={item.unidad === "KG" ? "0.01" : "1"}
                      />
                      <button onClick={() => updateQty(item.sku, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700">
                        <HiOutlinePlus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="font-bold text-gray-900">{formatPrice(item.precio * item.cantidad)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total + Cobrar */}
          <div className="border-t p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-2xl font-bold text-brand-600">{formatPrice(total)}</span>
            </div>
            <button
              disabled={cart.length === 0 || !selectedEmpleado}
              className="w-full py-3 bg-green-600 text-white rounded-xl text-lg font-bold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!selectedEmpleado ? "Selecciona vendedor" : terminal.flujo === "pendiente" ? "Dejar pendiente" : "Cobrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
