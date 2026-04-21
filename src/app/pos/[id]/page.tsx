"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import {
  HiOutlineSearch, HiOutlineTrash, HiOutlinePlus, HiOutlineMinus,
  HiOutlineUser, HiOutlineUserGroup, HiOutlineDesktopComputer,
  HiOutlineShoppingCart, HiOutlineCash, HiOutlineCreditCard,
  HiOutlineQrcode, HiOutlineLibrary, HiOutlineClipboardList, HiOutlineBookOpen,
} from "react-icons/hi";

interface Terminal {
  id: number; nombre: string; sucursal: string; sucursalNombre: string;
  listas: string; cuit: string; flujo: string; requiereCliente: boolean; esCajero: boolean;
}
interface Pendiente {
  boleta: string; nroped: string; total: number; cant: number; fecha: string; hora: string;
  clienteCod: string; clienteNombre: string; empleadoNombre: string; origen: string; notas: string;
  items: Array<{ sku: string; nombre: string; cantidad: number; precio: number; impo: number; lista: number }>;
}
interface Empleado { cod: string; nombre: string; }
interface Cliente { cod: string; nombre: string; cuit: string; zona: string; listaPrecios: string; }
interface PosPromo { desde: number; precio: number; tipo: "por-unidad" | "precio-fijo"; label: string; }
interface PosProduct {
  sku: string; nombre: string; unidad: string; precios: Record<number, number>;
  stock: number; codBarra: string; cantPorCaja: number; images: string[]; promos: PosPromo[];
}
interface CartItem { sku: string; nombre: string; unidad: string; cantidad: number; precio: number; lista: number; images: string[]; }

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
  const [selectedProduct, setSelectedProduct] = useState<PosProduct | null>(null);
  const [detailLista, setDetailLista] = useState<number>(0);
  const [detailQty, setDetailQty] = useState<string>("1");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout>();
  const resultsRef = useRef<HTMLDivElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cartLoaded = useRef(false);

  // Cajero: pending orders
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [loadingPendientes, setLoadingPendientes] = useState(false);
  const [selectedPendiente, setSelectedPendiente] = useState<Pendiente | null>(null);

  // Payment
  const [showPayment, setShowPayment] = useState(false);
  const [payMethod, setPayMethod] = useState<string>("");
  const [payAmount, setPayAmount] = useState("");
  const [payLines, setPayLines] = useState<Array<{ method: string; amount: number }>>([]);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState("");
  const [payConfirm, setPayConfirm] = useState(false);

  const getActiveLista = useCallback((): number => {
    if (!terminal) return 2;
    const listas = terminal.listas.split(",").map(Number);
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
        const savedSeller = localStorage.getItem(`pos_seller_${terminalId}`);
        if (savedSeller) {
          const emp = (d.empleados || []).find((e: Empleado) => e.cod === savedSeller);
          if (emp) setSelectedEmpleado(emp);
        }
      })
      .catch(() => setError("Error al cargar terminal"))
      .finally(() => setLoading(false));
  }, [terminalId]);

  // Load/save cart
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY + terminalId);
    if (saved) { try { setCart(JSON.parse(saved).map((i: CartItem) => ({ ...i, images: i.images || [] }))); } catch {} }
    cartLoaded.current = true;
  }, [terminalId]);

  useEffect(() => {
    if (cartLoaded.current) localStorage.setItem(STORAGE_KEY + terminalId, JSON.stringify(cart));
  }, [cart, terminalId]);

  useEffect(() => {
    if (selectedEmpleado) localStorage.setItem(`pos_seller_${terminalId}`, selectedEmpleado.cod);
  }, [selectedEmpleado, terminalId]);

  // Product search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!search.trim() || search.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    setHighlightIdx(-1);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/products?q=${encodeURIComponent(search.trim())}`);
        if (res.ok) { const d = await res.json(); setSearchResults(d.products || []); }
      } catch {}
      setSearching(false);
    }, 250);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  // Client search
  useEffect(() => {
    if (!clientSearch.trim() || clientSearch.trim().length < 2) { setClientResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/config?terminalId=${terminalId}&searchClient=${encodeURIComponent(clientSearch.trim())}`);
        const d = await res.json();
        setClientResults(d.clientes || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timeout);
  }, [clientSearch, terminalId]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
      // Scroll highlighted item into view
      setTimeout(() => {
        const el = resultsRef.current?.querySelector(`[data-idx="${Math.min(highlightIdx + 1, searchResults.length - 1)}"]`);
        el?.scrollIntoView({ block: "nearest" });
      }, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
      setTimeout(() => {
        const el = resultsRef.current?.querySelector(`[data-idx="${Math.max(highlightIdx - 1, 0)}"]`);
        el?.scrollIntoView({ block: "nearest" });
      }, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < searchResults.length) {
        selectProduct(searchResults[highlightIdx]);
      } else if (search.trim()) {
        const val = search.trim();
        if (/^\d{4,}$/.test(val)) {
          fetch(`/api/pos/products?barcode=${encodeURIComponent(val)}`)
            .then((r) => r.json())
            .then((d) => { if (d.products?.length > 0) { selectProduct(d.products[0]); setSearch(""); setSearchResults([]); setHighlightIdx(-1); } })
            .catch(() => {});
        } else if (searchResults.length === 1) {
          selectProduct(searchResults[0]);
        }
      }
    } else if (e.key === "Escape") {
      setSearch("");
      setSearchResults([]);
      setHighlightIdx(-1);
    }
  }

  function selectProduct(product: PosProduct) {
    setSelectedProduct(product);
    const lista = getActiveLista();
    // Pick the best available list
    const availListas = Object.entries(product.precios).filter(([, p]) => p > 0).map(([l]) => Number(l));
    setDetailLista(availListas.includes(lista) ? lista : availListas[0] || lista);
    setDetailQty("1");
  }

  function getEffectivePrice(product: PosProduct, lista: number, qty: number): { unitPrice: number; lineTotal: number; isPromo: boolean; promoLabel?: string } {
    const basePrice = product.precios[lista] || 0;
    if (!product.promos?.length || qty <= 0) return { unitPrice: basePrice, lineTotal: qty * basePrice, isPromo: false };
    // Find the best promo that applies (highest desde that qty meets)
    const applicable = product.promos.filter((p) => qty >= p.desde).sort((a, b) => b.desde - a.desde);
    if (applicable.length === 0) return { unitPrice: basePrice, lineTotal: qty * basePrice, isPromo: false };
    const promo = applicable[0];
    if (promo.tipo === "precio-fijo") {
      // Fixed total price for that qty tier
      return { unitPrice: promo.precio / promo.desde, lineTotal: promo.precio, isPromo: true, promoLabel: promo.label };
    }
    // Per-unit promo price
    return { unitPrice: promo.precio, lineTotal: qty * promo.precio, isPromo: true, promoLabel: promo.label };
  }

  function addFromDetail() {
    if (!selectedProduct) return;
    const qty = parseFloat(detailQty) || 1;
    const eff = getEffectivePrice(selectedProduct, detailLista, qty);
    if (qty <= 0 || eff.unitPrice <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.sku === selectedProduct.sku && i.lista === detailLista);
      if (existing) return prev.map((i) => i.sku === selectedProduct.sku && i.lista === detailLista ? { ...i, cantidad: i.cantidad + qty, precio: eff.unitPrice } : i);
      return [...prev, { sku: selectedProduct.sku, nombre: selectedProduct.nombre, unidad: selectedProduct.unidad, cantidad: qty, precio: eff.unitPrice, lista: detailLista, images: selectedProduct.images || [] }];
    });
    setSearch("");
    setSearchResults([]);
    setHighlightIdx(-1);
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
    if (selectedProduct?.sku === sku) setSelectedProduct(null);
  }

  async function loadPendientes() {
    if (!terminal) return;
    setLoadingPendientes(true);
    try {
      const res = await fetch(`/api/pos/pendientes?sucursal=${terminal.sucursal}`);
      if (res.ok) { const d = await res.json(); setPendientes(d.pendientes || []); }
    } catch {}
    setLoadingPendientes(false);
  }

  function loadPendienteToCart(p: Pendiente) {
    setSelectedPendiente(p);
    setCart(p.items.map((i) => ({
      sku: i.sku, nombre: i.nombre, unidad: "", cantidad: i.cantidad,
      precio: i.precio, lista: i.lista, images: [],
    })));
  }

  // Load pendientes for cajero terminals
  useEffect(() => {
    if (terminal?.esCajero) {
      loadPendientes();
      const interval = setInterval(loadPendientes, 30000); // refresh every 30s
      return () => clearInterval(interval);
    }
  }, [terminal]);

  function openPayment() {
    if (cart.length === 0 || !selectedEmpleado) return;
    if (terminal?.flujo === "pendiente") {
      savePending();
      return;
    }
    setShowPayment(true);
    setPayMethod("");
    setPayAmount("");
    setPayLines([]);
    setPayError("");
    setPaySuccess("");
    setPayConfirm(false);
  }

  async function savePending() {
    if (!terminal || !selectedEmpleado || cart.length === 0) return;
    setPaying(true);
    setPayError("");
    try {
      const res = await fetch("/api/pos/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal: terminal.sucursal,
          empleadoCod: selectedEmpleado.cod,
          clienteCod: selectedCliente?.cod,
          items: cart.map((i) => ({ sku: i.sku, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, lista: i.lista })),
          notes: "",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al crear pendiente");
      setPaySuccess(`Pedido pendiente #${d.nroped || d.boleta} creado`);
      setCart([]);
      setSelectedProduct(null);
      setTimeout(() => { setPaySuccess(""); searchRef.current?.focus(); }, 2000);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Error");
    }
    setPaying(false);
  }

  async function confirmPayment() {
    if (!terminal || !selectedEmpleado || cart.length === 0) return;
    const totalAmount = cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const paidSoFar = payLines.reduce((s, l) => s + l.amount, 0);
    const remaining = totalAmount - paidSoFar;

    // Validate
    if (remaining > 0.01) { setPayError(`Falta: ${formatPrice(remaining)}`); return; }
    if (payLines.some((l) => l.method === "cuenta") && !selectedCliente) { setPayError("Se requiere un cliente para cuenta corriente"); return; }

    // Calculate vuelto from cash overpay
    const cashLines = payLines.filter((l) => l.method === "efectivo");
    const cashTotal = cashLines.reduce((s, l) => s + l.amount, 0);
    const nonCashTotal = payLines.filter((l) => l.method !== "efectivo").reduce((s, l) => s + l.amount, 0);
    const vuelto = Math.max(0, cashTotal - (totalAmount - nonCashTotal));

    setPaying(true);
    setPayError("");
    try {
      const res = await fetch("/api/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal: terminal.sucursal,
          empleadoCod: selectedEmpleado.cod,
          clienteCod: selectedCliente?.cod,
          items: cart.map((i) => ({ sku: i.sku, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, lista: i.lista })),
          payments: payLines,
          vuelto,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al registrar");

      setPaySuccess(`Venta registrada — Boleta #${d.boleta}${vuelto > 0 ? ` — Vuelto: ${formatPrice(vuelto)}` : ""}`);
      setCart([]);
      setSelectedProduct(null);
      // If this was a pendiente, delete it from PunTouch
      if (selectedPendiente) {
        try {
          await fetch("/api/pos/pendientes", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ boleta: selectedPendiente.boleta }),
          });
        } catch {}
        setSelectedPendiente(null);
        loadPendientes();
      }
      setTimeout(() => {
        setShowPayment(false);
        setPaySuccess("");
        searchRef.current?.focus();
      }, 2000);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Error al registrar la venta");
    }
    setPaying(false);
  }

  const qtyRef = useRef<HTMLInputElement>(null);
  const selectedProductRef = useRef(selectedProduct);
  const addFromDetailRef = useRef(addFromDetail);
  const openPaymentRef = useRef(openPayment);
  const terminalRef = useRef(terminal);
  selectedProductRef.current = selectedProduct;
  addFromDetailRef.current = addFromDetail;
  openPaymentRef.current = openPayment;
  terminalRef.current = terminal;

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const fMatch = e.key.match(/^F(\d+)$/);

      // F1-F5: switch price list
      if (fMatch) {
        const fNum = parseInt(fMatch[1]);
        if (fNum >= 1 && fNum <= 5) {
          e.preventDefault();
          if (selectedProductRef.current) {
            const precio = selectedProductRef.current.precios[fNum];
            if (precio && precio > 0) setDetailLista(fNum);
          }
          return;
        }
        // F8: add to cart
        if (fNum === 8) {
          e.preventDefault();
          addFromDetailRef.current();
          return;
        }
        // F12: cobrar/pendiente
        if (fNum === 12) {
          e.preventDefault();
          openPaymentRef.current();
          return;
        }
        // Block all other F-keys from browser default
        e.preventDefault();
        return;
      }

      // Escape: back to search
      if (e.key === "Escape") {
        e.preventDefault();
        setSearch("");
        setSearchResults([]);
        setHighlightIdx(-1);
        setSelectedProduct(null);
        searchRef.current?.focus();
        return;
      }

      // Tab: jump between search and qty input
      if (e.key === "Tab" && selectedProductRef.current) {
        e.preventDefault();
        if (document.activeElement === searchRef.current) {
          qtyRef.current?.focus();
          qtyRef.current?.select();
        } else {
          searchRef.current?.focus();
        }
        return;
      }

      // Any letter/number when not in an input: focus search
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (!isInput && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        searchRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const total = cart.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.cantidad, 0);
  const activeLista = getActiveLista();

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-gray-100"><div className="text-gray-400 animate-pulse text-lg">Cargando terminal...</div></div>;
  }

  if (error || !terminal) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <HiOutlineDesktopComputer className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-red-500 font-medium text-lg">{error || "Terminal no encontrada"}</p>
          <p className="text-sm text-gray-400 mt-2">Verifica que la URL sea correcta (/pos/ID)</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:h-screen flex flex-col bg-gray-100 md:overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b px-3 md:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 md:gap-4">
          <span className="font-bold text-gray-900 text-sm md:text-lg">{terminal.nombre}</span>
          <span className="text-xs text-gray-400 hidden sm:inline">{terminal.sucursalNombre}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">
            {LISTA_LABELS[activeLista] || `Lista ${activeLista}`}
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1 md:gap-2">
            <HiOutlineUser className="w-4 h-4 text-gray-400 hidden md:block" />
            <select value={selectedEmpleado?.cod || ""}
              onChange={(e) => { const emp = empleados.find((x) => x.cod === e.target.value); setSelectedEmpleado(emp || null); }}
              className="text-xs md:text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-500 max-w-[140px] md:max-w-none">
              <option value="">Vendedor...</option>
              {empleados.map((e) => <option key={e.cod} value={e.cod}>{e.nombre}</option>)}
            </select>
          </div>
          {terminal.requiereCliente && (
            <div className="relative">
              <div className="flex items-center gap-2">
                <HiOutlineUserGroup className="w-4 h-4 text-gray-400" />
                {selectedCliente ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">{selectedCliente.nombre}</span>
                    <button onClick={() => { setSelectedCliente(null); setShowClientSearch(true); }} className="text-xs text-red-500 hover:text-red-700">x</button>
                  </div>
                ) : (
                  <input type="text" placeholder="Buscar cliente..." value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setShowClientSearch(true); }}
                    onFocus={() => setShowClientSearch(true)}
                    className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 w-48 focus:outline-none focus:border-brand-500" />
                )}
              </div>
              {showClientSearch && clientResults.length > 0 && !selectedCliente && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 w-72 max-h-60 overflow-y-auto">
                  {clientResults.map((c) => (
                    <button key={c.cod} onClick={() => { setSelectedCliente(c); setClientSearch(""); setClientResults([]); setShowClientSearch(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0">
                      <div className="text-sm font-medium text-gray-800">{c.nombre}</div>
                      <div className="text-xs text-gray-400">{c.cuit && `CUIT: ${c.cuit}`} {c.zona && `· ${c.zona}`}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content: 2 columns on desktop, stacked on mobile */}
      <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
        {/* LEFT: search (top) + cart (bottom) OR pending list for cajero */}
        <div className="md:w-1/2 flex flex-col md:border-r">
          {terminal.esCajero && !selectedPendiente ? (
            /* Cajero: pending orders list */
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-900">Pendientes ({pendientes.length})</h2>
                <button onClick={loadPendientes} disabled={loadingPendientes}
                  className={`text-sm text-brand-600 hover:text-brand-700 ${loadingPendientes ? "animate-pulse" : ""}`}>
                  {loadingPendientes ? "Cargando..." : "Actualizar"}
                </button>
              </div>
              {pendientes.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <HiOutlineShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No hay pedidos pendientes</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendientes.map((p, i) => (
                    <button key={p.boleta} onClick={() => loadPendienteToCart(p)}
                      className="w-full text-left bg-white border rounded-xl p-3 hover:shadow-md transition-all duration-200"
                      style={{ opacity: 0, animation: `cardIn 300ms ease ${i * 40}ms forwards` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 font-mono">#{p.nroped || p.boleta}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.origen === "POS" ? "bg-cyan-100 text-cyan-700" : p.origen === "Web" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {p.origen}
                        </span>
                      </div>
                      <div className="font-medium text-gray-900 text-sm">{p.clienteNombre || "Sin cliente"}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">{p.empleadoNombre} · {p.fecha} {p.hora}</span>
                        <span className="font-bold text-brand-600">{formatPrice(p.total)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{p.items.length} items · {p.cant} unidades</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <>
          {/* Search area */}
          <div className="p-2 md:p-3 border-b bg-white">
            <div className="relative">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar producto o escanear codigo..."
                className="w-full pl-10 pr-4 py-2 md:py-3 text-base md:text-lg border-2 border-brand-400 rounded-xl focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
                autoFocus />
              {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">Buscando...</div>}
            </div>
          </div>

          {/* Search results */}
          <div className="md:flex-1 md:overflow-y-auto bg-gray-50 p-2" ref={resultsRef}>
            {searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map((p, idx) => {
                  const precio = p.precios[activeLista] || p.precios[2] || p.precios[1] || 0;
                  const inCart = cart.find((i) => i.sku === p.sku);
                  const isSelected = selectedProduct?.sku === p.sku;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <button key={p.sku} data-idx={idx}
                      onClick={() => { selectProduct(p); setHighlightIdx(idx); }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-all duration-150 ${
                        isHighlighted ? "bg-blue-50 border border-blue-300" :
                        isSelected ? "bg-blue-50 border border-blue-200" :
                        inCart ? "bg-brand-50/50 border border-brand-200" : "bg-white border border-gray-200 hover:bg-blue-50"
                      }`}>
                      {p.images?.length > 0 ? (
                        <img src={p.images[0]} alt="" className="w-10 h-10 rounded object-contain bg-gray-100 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-xs">IMG</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{p.nombre}</div>
                        <div className="text-xs text-gray-400">
                          {p.sku} · {p.unidad === "KG" ? "/kg" : "/un"}
                          {p.promos?.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">{p.promos[0].label}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-brand-600">{formatPrice(precio)}</div>
                        {inCart && <div className="text-xs text-brand-500">{inCart.cantidad} en carrito</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : search.length >= 2 && !searching ? (
              <div className="text-center text-gray-400 mt-8">No se encontraron productos</div>
            ) : null}
          </div>

          {/* Cart */}
          <div className="border-t bg-white flex flex-col md:max-h-[45%]">
            <div className="px-3 py-2 border-b flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <HiOutlineShoppingCart className="w-4 h-4 text-gray-500" />
                <span className="font-bold text-gray-800 text-sm">Carrito</span>
                {itemCount > 0 && <span className="text-xs text-gray-400">({itemCount})</span>}
              </div>
              {cart.length > 0 && (
                <>
                {selectedPendiente && (
                  <button onClick={() => { setCart([]); setSelectedPendiente(null); setSelectedProduct(null); }} className="text-xs text-blue-500 hover:text-blue-700 mr-2">&larr; Pendientes</button>
                )}
                <button onClick={() => { setCart([]); setSelectedProduct(null); setSelectedPendiente(null); }} className="text-xs text-red-500 hover:text-red-700">Vaciar</button>
                </>
              )}
            </div>
            <div className="md:flex-1 md:overflow-y-auto px-2 py-1 space-y-1">
              {cart.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">Carrito vacio</div>
              ) : cart.map((item) => (
                <div key={item.sku}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-150 ${
                    selectedProduct?.sku === item.sku ? "bg-brand-50 border border-brand-200" : "bg-gray-50 hover:bg-gray-100"
                  }`}
                  onClick={() => {
                    const prod = searchResults.find((p) => p.sku === item.sku);
                    if (prod) selectProduct(prod);
                    else selectProduct({ sku: item.sku, nombre: item.nombre, unidad: item.unidad, precios: { [item.lista]: item.precio }, stock: 0, codBarra: "", cantPorCaja: 0, images: item.images || [], promos: [] });
                  }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 truncate">{item.nombre}</div>
                    <div className="text-xs text-gray-400">{formatPrice(item.precio)}/{item.unidad === "KG" ? "kg" : "un"}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); updateQty(item.sku, -1); }}
                      className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700">
                      <HiOutlineMinus className="w-3 h-3" />
                    </button>
                    <input type="number" value={item.cantidad}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setQty(item.sku, parseFloat(e.target.value) || 1)}
                      className="w-12 text-center text-xs font-medium border rounded py-0.5 focus:outline-none focus:border-brand-500"
                      min="0.01" step={item.unidad === "KG" ? "0.01" : "1"} />
                    <button onClick={(e) => { e.stopPropagation(); updateQty(item.sku, 1); }}
                      className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700">
                      <HiOutlinePlus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="font-bold text-sm text-gray-900 w-20 text-right shrink-0">{formatPrice(item.precio * item.cantidad)}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.sku); }}
                    className="text-gray-300 hover:text-red-500 shrink-0">
                    <HiOutlineTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* Total + action */}
            <div className="border-t px-3 py-2 flex items-center justify-between bg-white gap-2">
              <div className="min-w-0">
                <span className="text-xs md:text-sm text-gray-500">Total</span>
                <span className="text-lg md:text-xl font-bold text-brand-600 ml-2 md:ml-3">{formatPrice(total)}</span>
              </div>
              <button onClick={openPayment} disabled={cart.length === 0 || !selectedEmpleado}
                className="px-4 md:px-6 py-2 bg-green-600 text-white rounded-xl text-sm md:text-base font-bold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                {!selectedEmpleado ? "Vendedor" : terminal.flujo === "pendiente" ? "Pendiente" : "Cobrar"} <span className="hidden md:inline text-green-200 text-xs ml-1">F12</span>
              </button>
            </div>
          </div>
          </>
          )}
        </div>{/* end left panel */}

        {/* RIGHT: product detail / promotions — hidden on mobile, overlay on tap */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 bg-black/30 md:hidden" onClick={() => setSelectedProduct(null)} />
        )}
        <div className={`
          ${selectedProduct ? "fixed inset-x-0 bottom-0 z-50 max-h-[80vh] rounded-t-2xl shadow-2xl" : "hidden"}
          md:static md:block md:w-1/2 md:max-h-none md:rounded-none md:shadow-none
          flex flex-col bg-white overflow-y-auto
        `}>
          {selectedProduct ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8"
              style={{ animation: "fadeIn 300ms ease" }}>
              {/* Close on mobile */}
              <button onClick={() => setSelectedProduct(null)} className="md:hidden self-end text-gray-400 hover:text-gray-600 mb-2 text-xl">x</button>
              {/* Product image */}
              <div className="w-full max-w-xs md:max-w-md aspect-square bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden mb-4 md:mb-6 shadow-inner">
                {selectedProduct.images?.length > 0 ? (
                  <img src={selectedProduct.images[0]} alt={selectedProduct.nombre}
                    className="max-w-full max-h-full object-contain p-4" />
                ) : (
                  <div className="text-gray-300 text-center">
                    <HiOutlineShoppingCart className="w-16 h-16 mx-auto mb-2" />
                    <p className="text-sm">Sin imagen</p>
                  </div>
                )}
              </div>
              {/* Product info */}
              <h2 className="text-lg md:text-xl font-bold text-gray-900 text-center mb-2">{selectedProduct.nombre}</h2>
              <p className="text-xs md:text-sm text-gray-400 mb-3 md:mb-4">SKU: {selectedProduct.sku} · {selectedProduct.unidad === "KG" ? "Por kilo" : "Por unidad"}</p>
              {/* Selectable price lists */}
              <div className="flex flex-wrap gap-2 md:gap-3 mb-4 md:mb-5 justify-center">
                {Object.entries(selectedProduct.precios).map(([lista, precio]) => {
                  if (!precio || precio <= 0) return null;
                  const isSelected = Number(lista) === detailLista;
                  return (
                    <button key={lista} onClick={() => setDetailLista(Number(lista))}
                      className={`px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-center transition-all duration-200 cursor-pointer ${isSelected ? "bg-brand-500 text-white shadow-md scale-105" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      <div className="text-xs">{LISTA_LABELS[Number(lista)] || `Lista ${lista}`}</div>
                      <div className="font-bold text-base md:text-lg">{formatPrice(precio)}</div>
                    </button>
                  );
                })}
              </div>
              {/* Stock */}
              <div className={`text-sm font-medium ${selectedProduct.stock > 0 ? "text-green-600" : "text-red-500"}`}>
                {selectedProduct.stock > 0 ? "En stock" : "Sin stock"}
              </div>
              {/* Promos */}
              {selectedProduct.promos?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 mb-4 justify-center">
                  {selectedProduct.promos.map((promo, i) => {
                    const qty = parseFloat(detailQty) || 0;
                    const isActive = qty >= promo.desde;
                    return (
                      <div key={i} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive ? "bg-orange-500 text-white shadow-md" : "bg-orange-100 text-orange-700"
                      }`}>
                        {promo.label}
                        {isActive && " ✓"}
                      </div>
                    );
                  })}
                </div>
              )}
              {!selectedProduct.promos?.length && <div className="mb-4" />}
              {/* Quantity input */}
              <div className="flex flex-col items-center gap-2 mb-4">
                <label className="text-sm text-gray-500">{selectedProduct.unidad === "KG" ? "Peso (kg)" : "Cantidad"}</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setDetailQty(String(Math.max(0.01, (parseFloat(detailQty) || 1) - (selectedProduct.unidad === "KG" ? 0.25 : 1))))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700">
                    <HiOutlineMinus className="w-5 h-5" />
                  </button>
                  <input ref={qtyRef} type="text" inputMode="decimal" value={detailQty}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9.,]/g, ""); setDetailQty(v); }}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      const step = selectedProduct.unidad === "KG" ? 0.25 : 1;
                      const current = parseFloat(detailQty) || 0;
                      if (e.key === "ArrowUp") { e.preventDefault(); setDetailQty(String(Math.round((current + step) * 100) / 100)); }
                      else if (e.key === "ArrowDown") { e.preventDefault(); setDetailQty(String(Math.max(step, Math.round((current - step) * 100) / 100))); }
                      else if (e.key === "Enter") { e.preventDefault(); addFromDetail(); }
                    }}
                    className="w-24 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl py-2 focus:outline-none focus:border-brand-500" />
                  <button onClick={() => setDetailQty(String((parseFloat(detailQty) || 0) + (selectedProduct.unidad === "KG" ? 0.25 : 1)))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand-500 hover:bg-brand-600 text-white">
                    <HiOutlinePlus className="w-5 h-5" />
                  </button>
                </div>
                {selectedProduct.unidad === "KG" && (
                  <div className="flex gap-2 mt-1">
                    {[0.1, 0.25, 0.5, 1, 2, 5].map((q) => (
                      <button key={q} onClick={() => setDetailQty(String(q))}
                        className="px-2 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">
                        {q} kg
                      </button>
                    ))}
                  </div>
                )}
                {selectedProduct.cantPorCaja > 0 && (
                  <button onClick={() => { setDetailQty(String(selectedProduct.cantPorCaja)); }}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium mt-1">
                    Caja x{selectedProduct.cantPorCaja}
                  </button>
                )}
              </div>
              {/* Line total preview */}
              <div className="text-sm text-gray-500 mb-3">
                {(() => {
                  const qty = parseFloat(detailQty) || 0;
                  const basePrice = selectedProduct.precios[detailLista] || 0;
                  const eff = getEffectivePrice(selectedProduct, detailLista, qty);
                  if (qty <= 0 || basePrice <= 0) return null;
                  return eff.isPromo ? (
                    <span>
                      {eff.promoLabel && <span className="text-orange-600 text-xs block mb-1">{eff.promoLabel}</span>}
                      {detailQty} × <span className="line-through text-gray-400">{formatPrice(basePrice)}</span>{" "}
                      = <span className="font-bold text-orange-600">{formatPrice(eff.lineTotal)}</span>
                    </span>
                  ) : (
                    <span>{detailQty} × {formatPrice(basePrice)} = <span className="font-bold text-gray-900">{formatPrice(eff.lineTotal)}</span></span>
                  );
                })()}
              </div>
              {/* Add button */}
              <button onClick={addFromDetail}
                disabled={!parseFloat(detailQty) || parseFloat(detailQty) <= 0 || !selectedProduct.precios[detailLista]}
                className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed">
                Agregar al carrito <span className="text-green-200 text-sm ml-2">F8</span>
              </button>
              {/* Already in cart indicator */}
              {(() => {
                const inCart = cart.filter((i) => i.sku === selectedProduct.sku);
                return inCart.length > 0 ? (
                  <div className="mt-3 text-xs text-gray-400">
                    Ya en carrito: {inCart.map((i) => `${i.cantidad} × ${LISTA_LABELS[i.lista] || `L${i.lista}`}`).join(", ")}
                  </div>
                ) : null;
              })()}
              {/* Keyboard shortcuts */}
              <div className="hidden md:flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-gray-400 justify-center">
                <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">F1-F5</kbd> Lista</span>
                <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">Tab</kbd> Cantidad</span>
                <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">Enter</kbd> Agregar</span>
                <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">Esc</kbd> Volver</span>
                <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">F12</kbd> Cobrar</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center"
              style={{ animation: "fadeIn 500ms ease" }}>
              <img src="/logo.png" alt="Distrialma" className="w-48 opacity-20 mb-8" />
              <h2 className="text-2xl font-bold text-gray-300 mb-2">Distrialma POS</h2>
              <p className="text-gray-400">Busca un producto o escanea un codigo de barras para comenzar</p>
            </div>
          )}
        </div>
      </div>

      {/* Pending/payment toast (outside modal) */}
      {paySuccess && !showPayment && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg text-lg font-bold"
          style={{ animation: "fadeIn 300ms ease" }}>
          {paySuccess}
        </div>
      )}
      {payError && !showPayment && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium"
          style={{ animation: "fadeIn 300ms ease" }}>
          {payError}
        </div>
      )}

      {/* Payment modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !paying) setShowPayment(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            style={{ animation: "fadeIn 200ms ease" }}>
            {paySuccess ? (
              <div className="p-8 text-center" style={{ animation: "fadeIn 300ms ease" }}>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Venta registrada</h2>
                <p className="text-gray-600">{paySuccess}</p>
              </div>
            ) : (
              <>
                <div className="p-5 border-b flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Cobrar</h2>
                  <button onClick={() => setShowPayment(false)} disabled={paying}
                    className="text-gray-400 hover:text-gray-600 text-xl">x</button>
                </div>

                <div className="p-5">
                  {/* Total + Remaining */}
                  {(() => {
                    const paid = payLines.reduce((s, l) => s + l.amount, 0);
                    const rem = total - paid;
                    return (
                      <div className="text-center mb-4">
                        <div className="text-sm text-gray-500">Total a cobrar</div>
                        <div className="text-3xl font-bold text-gray-900">{formatPrice(total)}</div>
                        {paid > 0 && (
                          <div className={`text-lg font-bold mt-1 ${rem <= 0.01 ? "text-green-600" : "text-red-500"}`}>
                            {rem <= 0.01 ? "Completo" : `Restante: ${formatPrice(rem)}`}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Payment lines added */}
                  {payLines.length > 0 && (
                    <div className="mb-4 space-y-1">
                      {payLines.map((line, i) => {
                        const METHOD_LABELS: Record<string, string> = { efectivo: "Efectivo", debito: "Debito", credito: "Credito", cuotas: "Cuotas", qr: "QR", transferencia: "Transfer.", cuenta: "Cta. Cte." };
                        return (
                          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <span className="text-sm font-medium text-gray-700">{METHOD_LABELS[line.method] || line.method}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{formatPrice(line.amount)}</span>
                              <button onClick={() => { setPayLines((prev) => prev.filter((_, j) => j !== i)); setPayConfirm(false); }}
                                className="text-red-400 hover:text-red-600 text-xs">✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Payment methods */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                    {[
                      { key: "efectivo", label: "Efectivo", Icon: HiOutlineCash, color: "bg-green-100 text-green-700", active: "bg-green-600" },
                      { key: "debito", label: "Debito", Icon: HiOutlineCreditCard, color: "bg-blue-100 text-blue-700", active: "bg-blue-600" },
                      { key: "credito", label: "Credito", Icon: HiOutlineCreditCard, color: "bg-purple-100 text-purple-700", active: "bg-purple-600" },
                      { key: "cuotas", label: "Cuotas", Icon: HiOutlineClipboardList, color: "bg-indigo-100 text-indigo-700", active: "bg-indigo-600" },
                      { key: "qr", label: "QR", Icon: HiOutlineQrcode, color: "bg-cyan-100 text-cyan-700", active: "bg-cyan-600" },
                      { key: "transferencia", label: "Transfer.", Icon: HiOutlineLibrary, color: "bg-amber-100 text-amber-700", active: "bg-amber-600" },
                      { key: "cuenta", label: "Cta. Cte.", Icon: HiOutlineBookOpen, color: "bg-red-100 text-red-700", active: "bg-red-600" },
                    ].map((m) => (
                      <button key={m.key} onClick={() => { setPayMethod(m.key); setPayAmount(""); setPayError(""); setPayConfirm(false); }}
                        className={`p-2 rounded-xl text-center transition-all duration-200 ${
                          payMethod === m.key ? `${m.active} text-white shadow-md scale-105` : `${m.color} hover:opacity-80`
                        }`}>
                        <m.Icon className="w-5 h-5 mx-auto mb-0.5" />
                        <div className="text-xs font-medium">{m.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* Amount input + Add button */}
                  {payMethod && (
                    <div className="mb-4" style={{ animation: "fadeIn 200ms ease" }}>
                      {payMethod === "cuenta" && !selectedCliente ? (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">Se requiere seleccionar un cliente</div>
                      ) : (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input type="text" inputMode="decimal" value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const amt = parseFloat(payAmount) || (total - payLines.reduce((s, l) => s + l.amount, 0));
                                  if (amt > 0) { setPayLines((prev) => [...prev, { method: payMethod, amount: amt }]); setPayMethod(""); setPayAmount(""); setPayConfirm(false); }
                                }
                              }}
                              placeholder={formatPrice(Math.max(0, total - payLines.reduce((s, l) => s + l.amount, 0)))}
                              className="w-full text-xl font-bold text-center border-2 border-gray-300 rounded-xl py-2 focus:outline-none focus:border-brand-500"
                              autoFocus />
                          </div>
                          <button onClick={() => {
                            const amt = parseFloat(payAmount) || (total - payLines.reduce((s, l) => s + l.amount, 0));
                            if (amt > 0) { setPayLines((prev) => [...prev, { method: payMethod, amount: amt }]); setPayMethod(""); setPayAmount(""); setPayConfirm(false); }
                          }} className="px-4 py-2 bg-brand-500 text-white rounded-xl font-bold hover:bg-brand-600 shrink-0">
                            Agregar
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Vuelto preview */}
                  {(() => {
                    const paid = payLines.reduce((s, l) => s + l.amount, 0);
                    const cashPaid = payLines.filter((l) => l.method === "efectivo").reduce((s, l) => s + l.amount, 0);
                    const nonCash = paid - cashPaid;
                    const vuelto = Math.max(0, cashPaid - (total - nonCash));
                    return vuelto > 0.01 ? (
                      <div className="mb-4 text-center text-green-600 font-bold text-lg">Vuelto: {formatPrice(vuelto)}</div>
                    ) : null;
                  })()}

                  {/* Error */}
                  {payError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                      {payError}
                    </div>
                  )}
                </div>

                {/* Confirm button */}
                <div className="p-5 border-t bg-gray-50">
                  <button onClick={() => { if (payConfirm) { confirmPayment(); } else { setPayConfirm(true); } }}
                    disabled={paying || payLines.length === 0 || (total - payLines.reduce((s, l) => s + l.amount, 0)) > 0.01}
                    className={`w-full py-3 text-white rounded-xl text-lg font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      payConfirm ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"
                    }`}>
                    {paying ? "Procesando..." : payConfirm ? "CONFIRMAR — Registrar venta" : `Confirmar pago (${payLines.length} medio${payLines.length !== 1 ? "s" : ""})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
