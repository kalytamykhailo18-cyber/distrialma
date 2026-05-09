"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  HiOutlineSearch,
  HiOutlineCamera,
  HiOutlineShoppingCart,
  HiOutlineLocationMarker,
  HiOutlinePlus,
  HiOutlineMinus,
  HiOutlineTrash,
} from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface Product {
  sku: string;
  name: string;
  barcode: string;
  rubro: string;
  unidad: string;
  pesoMayorista: number;
  minimoCompra: number;
  minimoCompraText: string;
  cantPorCaja: number;
  mayorista: number;
  precioCajaCerrada: number;
  precioVenta: number;
  stock: number;
  promocional: boolean;
}

interface Cliente {
  cod: string;
  nombre: string;
  cuit: string;
  direccion: string;
  telefono: string;
  whatsapp?: string;
  registro?: {
    fotoLocal?: string;
    fotoCuit?: string;
    whatsapp?: string;
    lat?: number;
    lng?: number;
  } | null;
}

interface CartItem extends Product {
  cantidad: number;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

export default function VendedorPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [step, setStep] = useState<"products" | "cliente" | "checkout">("products");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteResults, setClienteResults] = useState<Cliente[]>([]);
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [clientHistory, setClientHistory] = useState<Array<{ sku: string; nombre: string; totalCant: number; veces: number; ultimaCompra: string }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // New client registration
  const [showNewClient, setShowNewClient] = useState(false);
  const [ncNombre, setNcNombre] = useState("");
  const [ncDireccion, setNcDireccion] = useState("");
  const [ncLocalidad, setNcLocalidad] = useState("");
  const [ncTelefono, setNcTelefono] = useState("");
  const [ncWhatsapp, setNcWhatsapp] = useState("");
  const [ncCuit, setNcCuit] = useState("");
  const [ncIva, setNcIva] = useState("CF");
  const [ncFotoLocal, setNcFotoLocal] = useState<string | null>(null);
  const [ncFotoCuit, setNcFotoCuit] = useState<string | null>(null);
  const [ncSaving, setNcSaving] = useState(false);
  const [ncGps, setNcGps] = useState<{ lat: number; lng: number } | null>(null);

  // Auth redirect
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?redirect=/vendedor");
    }
  }, [status, router]);

  // Restore cart
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("vendedor_cart");
      if (saved) setCart(JSON.parse(saved));
      const savedCliente = sessionStorage.getItem("vendedor_cliente");
      if (savedCliente) setCliente(JSON.parse(savedCliente));
    } catch { /* ignore */ }
  }, []);

  // Save cart
  useEffect(() => {
    sessionStorage.setItem("vendedor_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (cliente) sessionStorage.setItem("vendedor_cliente", JSON.stringify(cliente));
  }, [cliente]);

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/vendedor/products?q=${encodeURIComponent(q)}`);
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

  function getStep(p: Product): number {
    if (p.unidad?.toUpperCase() === "KG" && p.pesoMayorista > 0) return p.pesoMayorista;
    if (p.minimoCompra > 0) return p.minimoCompra;
    return 1;
  }

  function addToCart(p: Product, mode: "unit" | "caja" = "unit") {
    const qty = mode === "caja" && p.cantPorCaja > 0 ? p.cantPorCaja : getStep(p);
    const precio = mode === "caja" && p.precioCajaCerrada > 0 ? p.precioCajaCerrada : p.precioVenta;
    setCart((prev) => {
      const existing = prev.find((i) => i.sku === p.sku);
      if (existing) {
        return prev.map((i) => i.sku === p.sku ? { ...i, cantidad: Math.round((i.cantidad + qty) * 100) / 100, precioVenta: precio } : i);
      }
      return [...prev, { ...p, precioVenta: precio, cantidad: qty }];
    });
    setSearch("");
    setResults([]);
  }

  function updateQty(sku: string, delta: number) {
    setCart((prev) => prev.map((i) => {
      if (i.sku !== sku) return i;
      const step = getStep(i);
      const newQty = Math.round((i.cantidad + delta * step) * 100) / 100;
      return { ...i, cantidad: Math.max(0, newQty) };
    }).filter((i) => i.cantidad > 0));
  }

  function removeFromCart(sku: string) {
    setCart((prev) => prev.filter((i) => i.sku !== sku));
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.precioVenta * i.cantidad, 0);
  const cartCount = cart.length;

  function handlePhoto(file: File, setter: (v: string | null) => void) {
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  }

  function captureGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setNcGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 10000 }
    );
  }

  async function handleRegisterClient() {
    if (!ncNombre.trim() || !ncTelefono.trim()) return;
    setNcSaving(true);
    try {
      const res = await fetch("/api/vendedor/register-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: ncNombre, direccion: ncDireccion, localidad: ncLocalidad,
          telefono: ncTelefono, whatsapp: ncWhatsapp, cuit: ncCuit, iva: ncIva,
          fotoLocal: ncFotoLocal, fotoCuit: ncFotoCuit,
          lat: ncGps?.lat, lng: ncGps?.lng,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        selectCliente({ cod: data.cod, nombre: data.nombre, cuit: ncCuit, direccion: ncDireccion, telefono: ncTelefono });
        setShowNewClient(false);
        setNcNombre(""); setNcDireccion(""); setNcLocalidad(""); setNcTelefono("");
        setNcWhatsapp(""); setNcCuit(""); setNcIva("CF");
        setNcFotoLocal(null); setNcFotoCuit(null); setNcGps(null);
      } else {
        alert(data.error || "Error");
      }
    } catch { alert("Error de conexion"); }
    setNcSaving(false);
  }

  async function selectCliente(c: Cliente) {
    setCliente(c);
    setClientHistory([]);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/vendedor/client-history?cod=${c.cod}`);
      const data = await res.json();
      setClientHistory(data.products || []);
    } catch {}
    setLoadingHistory(false);
  }

  async function searchClientes(q: string) {
    setClienteSearch(q);
    if (q.length < 2) { setClienteResults([]); return; }
    const res = await fetch(`/api/vendedor/clientes?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setClienteResults(data.clientes || []);
  }

  async function getLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  }

  async function handleSubmit() {
    if (!cliente) { alert("Selecciona un cliente"); return; }
    if (cart.length === 0) { alert("Carrito vacio"); return; }

    setSubmitting(true);
    try {
      const location = await getLocation();
      const userName = (session?.user as { name?: string })?.name || "vendedor";
      const userId = (session?.user as { id?: string })?.id;

      const res = await fetch("/api/vendedor/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendedorCod: userId || "0",
          vendedorName: userName,
          clienteCod: cliente.cod,
          clienteName: cliente.nombre,
          items: cart.map((i) => ({
            sku: i.sku,
            productName: i.name,
            rubroCod: i.rubro,
            cantidad: i.cantidad,
            precioMayorista: i.mayorista,
            precioVenta: i.precioVenta,
          })),
          latitude: location?.lat,
          longitude: location?.lng,
          notas,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al enviar pedido");
        return;
      }

      const { order } = await res.json();

      // Send WhatsApp message
      const whatsapp = process.env.NEXT_PUBLIC_WA_MAYORISTA || "5491154137677"; // Distrialma Mayorista
      let msg = `*NUEVO PEDIDO PREVENTA*\n\n`;
      msg += `Vendedor: ${userName}\n`;
      msg += `Cliente: ${cliente.nombre}\n`;
      if (cliente.cuit) msg += `CUIT: ${cliente.cuit}\n`;
      if (location) msg += `Ubicacion: ${location.lat.toFixed(5)},${location.lng.toFixed(5)}\n`;
      msg += `\n*Productos:*\n`;
      cart.forEach((i, idx) => {
        msg += `${idx + 1}. ${i.name}\n   ${i.cantidad} x ${formatPrice(i.precioVenta)} = ${formatPrice(i.precioVenta * i.cantidad)}\n`;
      });
      msg += `\n*TOTAL: ${formatPrice(cartTotal)}*\n`;
      msg += `\nPedido #${order.id} - PREVENTA`;
      if (notas) msg += `\nNotas: ${notas}`;

      window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");

      // Clear cart
      setCart([]);
      setCliente(null);
      setNotas("");
      sessionStorage.removeItem("vendedor_cart");
      sessionStorage.removeItem("vendedor_cliente");
      setStep("products");
      alert(`Pedido #${order.id} enviado correctamente`);
    } catch {
      alert("Error de conexion");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <Stagger delay={0} y={-8}>
          <div className="bg-brand-400 text-white p-4 sticky top-0 z-30 shadow-md">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold">Vendedor</h1>
              <span className="text-xs">{(session?.user as { name?: string })?.name}</span>
            </div>
            {/* Step tabs */}
            <div className="flex gap-1 mt-3 bg-white/20 rounded-lg p-1">
              <button
                onClick={() => setStep("products")}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${springBtn} ${step === "products" ? "bg-white text-brand-600 font-medium" : "text-white"}`}
              >
                1. Productos
              </button>
              <button
                onClick={() => cart.length > 0 && setStep("cliente")}
                disabled={cart.length === 0}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${springBtn} ${step === "cliente" ? "bg-white text-brand-600 font-medium" : "text-white disabled:opacity-50"}`}
              >
                2. Cliente
              </button>
              <button
                onClick={() => cliente && cart.length > 0 && setStep("checkout")}
                disabled={!cliente || cart.length === 0}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${springBtn} ${step === "checkout" ? "bg-white text-brand-600 font-medium" : "text-white disabled:opacity-50"}`}
              >
                3. Confirmar
              </button>
            </div>
          </div>
        </Stagger>

        <div className="px-4 py-4">
          {/* PRODUCTS step */}
          {step === "products" && (
            <>
              <Stagger delay={50}>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Buscar producto..."
                      className="w-full pl-10 pr-4 py-2.5 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                  <button className={`px-3 py-2 border rounded-lg text-gray-600 ${springBtn}`}>
                    <HiOutlineCamera className="w-5 h-5" />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/price-list?markup=vendedor");
                        const data = await res.json();
                        if (!data.products?.length) { alert("No hay productos"); return; }
                        const { generatePriceListPdf } = await import("@/lib/price-list-pdf");
                        const doc = generatePriceListPdf("lista", data.products, false);
                        const blob = doc.output("blob");
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.target = "_blank"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      } catch { alert("Error al generar PDF"); }
                    }}
                    className={`px-3 py-2 border rounded-lg text-red-500 ${springBtn}`}
                    title="Lista de precios con +3%"
                  >
                    PDF +3%
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/price-list?markup=vendedor");
                        const data = await res.json();
                        if (!data.products?.length) { alert("No hay productos"); return; }
                        const prods = data.products.map((p: Record<string, unknown>) => ({ ...p, precioMayorista: 0, precioCajaCerrada: 0 }));
                        const { generatePriceListPdf } = await import("@/lib/price-list-pdf");
                        const doc = generatePriceListPdf("lista", prods, false);
                        const blob = doc.output("blob");
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.target = "_blank"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      } catch { alert("Error al generar PDF"); }
                    }}
                    className={`px-3 py-2 border rounded-lg text-gray-500 ${springBtn}`}
                    title="Catálogo sin precios"
                  >
                    Sin precio
                  </button>
                </div>
              </Stagger>

              {searching && <p className="text-xs text-gray-400 text-center">Buscando...</p>}

              <Stagger delay={100}>
                {results.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {results.map((p, i) => (
                      <div key={p.sku} style={staggerStyle(true, i)} className={`bg-white border rounded-lg p-3 shadow-sm ${hoverRow}`}>
                        <button onClick={() => addToCart(p)} className="w-full text-left">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${p.stock > 10 ? "bg-green-500" : p.stock > 0 ? "bg-yellow-400" : "bg-red-500"}`} />
                                <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                              </div>
                              <p className="text-xs text-gray-400 ml-3.5">
                                SKU: {p.sku}
                                {p.minimoCompraText && <span className="ml-1 text-amber-600">Min: {p.minimoCompraText}</span>}
                              </p>
                              {p.promocional && (
                                <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">Promocional</span>
                              )}
                            </div>
                            <div className="text-right ml-2">
                              <p className="text-sm font-bold text-brand-500">{formatPrice(p.precioVenta)}</p>
                              <p className="text-xs text-gray-400">May: {formatPrice(p.mayorista)}</p>
                            </div>
                          </div>
                        </button>
                        {p.cantPorCaja > 0 && p.precioCajaCerrada > 0 && (
                          <button
                            onClick={() => addToCart(p, "caja")}
                            className={`mt-2 w-full py-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg ${springBtn}`}
                          >
                            Caja x{p.cantPorCaja} — {formatPrice(p.precioCajaCerrada)}/u
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Stagger>

              {/* Cart preview */}
              {cart.length > 0 && (
                <Stagger delay={150}>
                  <div className="bg-white border rounded-lg p-3 mb-4 shadow-sm">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Carrito ({cartCount} items)
                    </h3>
                    <div className="space-y-2">
                      {cart.map((item, i) => (
                        <div key={item.sku} style={staggerStyle(true, i)} className={`flex items-center gap-2 text-sm ${hoverRow}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{item.name}</p>
                            <p className="text-xs text-gray-400">{formatPrice(item.precioVenta)}{item.unidad?.toUpperCase() === "KG" ? " /kg" : " c/u"}</p>
                          </div>
                          <button onClick={() => updateQty(item.sku, -1)} className={`w-7 h-7 border rounded flex items-center justify-center ${springBtn}`}>
                            <HiOutlineMinus className="w-3 h-3" />
                          </button>
                          <span className="w-12 text-center text-sm font-medium">{item.unidad?.toUpperCase() === "KG" ? `${item.cantidad}kg` : item.cantidad}</span>
                          <button onClick={() => updateQty(item.sku, 1)} className={`w-7 h-7 border rounded flex items-center justify-center ${springBtn}`}>
                            <HiOutlinePlus className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeFromCart(item.sku)} className={`text-red-400 p-1 ${springBtn}`}>
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="border-t mt-3 pt-2 flex justify-between font-bold">
                      <span>Total</span>
                      <span className="text-brand-500">{formatPrice(cartTotal)}</span>
                    </div>
                  </div>
                </Stagger>
              )}
            </>
          )}

          {/* CLIENTE step */}
          {step === "cliente" && (
            <>
              <Stagger delay={50}>
                <div className="relative mb-3">
                  <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={clienteSearch}
                    onChange={(e) => searchClientes(e.target.value)}
                    placeholder="Buscar cliente por nombre, CUIT o codigo..."
                    className="w-full pl-10 pr-4 py-2.5 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                </div>
              </Stagger>

              <Stagger delay={70}>
                <button
                  onClick={() => { setShowNewClient(!showNewClient); captureGps(); }}
                  className={`w-full mb-3 py-2.5 text-sm font-medium rounded-lg border-2 border-dashed ${springBtn} ${showNewClient ? "border-brand-400 bg-brand-50 text-brand-600" : "border-gray-300 text-gray-500 hover:border-brand-400"}`}
                >
                  {showNewClient ? "Cancelar alta" : "+ Nuevo cliente"}
                </button>
              </Stagger>

              {showNewClient && (
                <Stagger delay={80}>
                  <div className="bg-white border rounded-lg p-4 mb-3 shadow-sm space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700">Alta de cliente</h3>
                    <input type="text" value={ncNombre} onChange={(e) => setNcNombre(e.target.value)} placeholder="Nombre *" className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                    <input type="text" value={ncDireccion} onChange={(e) => setNcDireccion(e.target.value)} placeholder="Direccion" className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                    <input type="text" value={ncLocalidad} onChange={(e) => setNcLocalidad(e.target.value)} placeholder="Localidad" className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="tel" value={ncTelefono} onChange={(e) => setNcTelefono(e.target.value)} placeholder="Telefono *" className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                      <input type="tel" value={ncWhatsapp} onChange={(e) => setNcWhatsapp(e.target.value)} placeholder="WhatsApp" className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={ncCuit} onChange={(e) => setNcCuit(e.target.value)} placeholder="CUIT" className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                      <select value={ncIva} onChange={(e) => setNcIva(e.target.value)} className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500 bg-white">
                        <option value="CF">Consumidor Final</option>
                        <option value="MT">Monotributista</option>
                        <option value="RI">Resp. Inscripto</option>
                        <option value="EX">Exento</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Foto del local</label>
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0], setNcFotoLocal)} className="w-full text-xs" />
                        {ncFotoLocal && <img src={ncFotoLocal} alt="" className="mt-1 h-16 rounded border object-cover" />}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Foto CUIT/Constancia</label>
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0], setNcFotoCuit)} className="w-full text-xs" />
                        {ncFotoCuit && <img src={ncFotoCuit} alt="" className="mt-1 h-16 rounded border object-cover" />}
                      </div>
                    </div>
                    {ncGps && <p className="text-xs text-green-600">GPS: {ncGps.lat.toFixed(5)}, {ncGps.lng.toFixed(5)}</p>}
                    <button
                      onClick={handleRegisterClient}
                      disabled={ncSaving || !ncNombre.trim() || !ncTelefono.trim()}
                      className={`w-full py-2.5 bg-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${springBtn}`}
                    >
                      {ncSaving ? "Registrando..." : "Registrar cliente"}
                    </button>
                  </div>
                </Stagger>
              )}

              {cliente && (
                <Stagger delay={80}>
                  <div className="bg-brand-50 border-2 border-brand-400 rounded-lg p-3 mb-3 shadow-sm">
                    <p className="text-xs text-brand-600 font-medium">SELECCIONADO</p>
                    <p className="font-medium text-gray-800">{cliente.nombre}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-1">
                      {cliente.cuit && <span>CUIT: {cliente.cuit}</span>}
                      {cliente.direccion && <span>{cliente.direccion}</span>}
                      {cliente.telefono && <span>Tel: {cliente.telefono}</span>}
                      {(cliente.registro?.whatsapp || cliente.whatsapp) && <span>WA: {cliente.registro?.whatsapp || cliente.whatsapp}</span>}
                    </div>
                    {cliente.registro?.fotoLocal && (
                      <div className="mt-2">
                        <a href={cliente.registro.fotoLocal} target="_blank" rel="noopener noreferrer">
                          <img src={cliente.registro.fotoLocal} alt="Local" className="h-20 rounded-lg border object-cover hover:opacity-80" />
                        </a>
                      </div>
                    )}
                    {cliente.registro?.lat && (
                      <a href={`https://maps.google.com/?q=${cliente.registro.lat},${cliente.registro.lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                        Ver ubicacion
                      </a>
                    )}
                  </div>
                  {/* Purchase history */}
                  {loadingHistory && <p className="text-xs text-gray-400 mt-2">Cargando historial...</p>}
                  {clientHistory.length > 0 && (
                    <div className="mt-3 border-t pt-2">
                      <p className="text-xs font-semibold text-gray-500 mb-2">Compras habituales (90 dias)</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {clientHistory.map((h) => (
                          <div key={h.sku} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${hoverRow}`}>
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-800 truncate block">{h.nombre}</span>
                              <span className="text-gray-400">{h.veces}x — ult: {h.ultimaCompra}</span>
                            </div>
                            <span className="text-gray-600 shrink-0 ml-2">{h.totalCant} un</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Stagger>
              )}

              <Stagger delay={150}>
                <div className="space-y-2">
                  {clienteResults.map((c, i) => (
                    <button
                      key={c.cod}
                      onClick={() => selectCliente(c)}
                      style={staggerStyle(true, i)}
                      className={`w-full text-left bg-white border rounded-lg p-3 shadow-sm ${hoverRow} ${springBtn} ${
                        cliente?.cod === c.cod ? "border-brand-400 bg-brand-50" : ""
                      }`}
                    >
                      <div className="flex gap-3">
                        {c.registro?.fotoLocal && (
                          <img src={c.registro.fotoLocal} alt="" className="w-12 h-12 rounded-lg border object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                          <p className="text-xs text-gray-400">{c.cuit} {c.direccion && `— ${c.direccion}`}</p>
                          {c.telefono && <p className="text-xs text-gray-400">Tel: {c.telefono}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </Stagger>
            </>
          )}

          {/* CHECKOUT step */}
          {step === "checkout" && cliente && (
            <>
              <Stagger delay={50}>
                <div className="bg-white border rounded-lg p-3 mb-3 shadow-sm">
                  <h3 className="text-xs text-gray-500 mb-1">CLIENTE</h3>
                  <p className="font-medium">{cliente.nombre}</p>
                  <p className="text-xs text-gray-500">{cliente.cuit}</p>
                </div>
              </Stagger>

              <Stagger delay={100}>
                <div className="bg-white border rounded-lg p-3 mb-3 shadow-sm">
                  <h3 className="text-xs text-gray-500 mb-2">PRODUCTOS ({cartCount})</h3>
                  <div className="space-y-1">
                    {cart.map((i, idx) => (
                      <div key={i.sku} style={staggerStyle(true, idx)} className={`text-sm flex justify-between ${hoverRow}`}>
                        <span className="flex-1 truncate">{i.cantidad} x {i.name}</span>
                        <span className="font-medium">{formatPrice(i.precioVenta * i.cantidad)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t mt-2 pt-2 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-brand-500">{formatPrice(cartTotal)}</span>
                  </div>
                </div>
              </Stagger>

              <Stagger delay={150}>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas (opcional)"
                  rows={2}
                  className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm mb-3 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                />

                <p className="text-xs text-gray-400 text-center mb-3">
                  <HiOutlineLocationMarker className="inline w-4 h-4" /> Se va a tomar tu ubicacion al enviar
                </p>

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={`w-full py-3 text-sm font-bold text-white bg-green-600 rounded-xl disabled:opacity-50 ${springBtn}`}
                >
                  {submitting ? "Enviando..." : "Enviar pedido (PunTouch + WhatsApp)"}
                </button>
              </Stagger>
            </>
          )}
        </div>

        {/* Floating cart button */}
        {step !== "products" && cart.length > 0 && (
          <button
            onClick={() => setStep("products")}
            className={`fixed bottom-4 right-4 bg-brand-400 text-white px-4 py-3 rounded-full shadow-lg flex items-center gap-2 z-40 ${springBtn}`}
          >
            <HiOutlineShoppingCart className="w-5 h-5" />
            {cartCount}
          </button>
        )}
      </div>
    </PageTransition>
  );
}
