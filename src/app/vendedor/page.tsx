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

interface Product {
  sku: string;
  name: string;
  barcode: string;
  rubro: string;
  mayorista: number;
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

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.sku === p.sku);
      if (existing) {
        return prev.map((i) => i.sku === p.sku ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, { ...p, cantidad: 1 }];
    });
    setSearch("");
    setResults([]);
  }

  function updateQty(sku: string, delta: number) {
    setCart((prev) => prev.map((i) => i.sku === sku ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i).filter((i) => i.cantidad > 0));
  }

  function removeFromCart(sku: string) {
    setCart((prev) => prev.filter((i) => i.sku !== sku));
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.precioVenta * i.cantidad, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.cantidad, 0);

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
    if (!cliente) { alert("Seleccioná un cliente"); return; }
    if (cart.length === 0) { alert("Carrito vacío"); return; }

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
      const whatsapp = "5491154137677"; // Distrialma Mayorista
      let msg = `*NUEVO PEDIDO PREVENTA*\n\n`;
      msg += `Vendedor: ${userName}\n`;
      msg += `Cliente: ${cliente.nombre}\n`;
      if (cliente.cuit) msg += `CUIT: ${cliente.cuit}\n`;
      if (location) msg += `Ubicación: ${location.lat.toFixed(5)},${location.lng.toFixed(5)}\n`;
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
      alert("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <div className="p-8 text-center text-gray-400">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-brand-400 text-white p-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Vendedor</h1>
          <span className="text-xs">{(session?.user as { name?: string })?.name}</span>
        </div>
        {/* Step tabs */}
        <div className="flex gap-1 mt-3 bg-white/20 rounded-lg p-1">
          <button
            onClick={() => setStep("products")}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${step === "products" ? "bg-white text-brand-600 font-medium" : "text-white"}`}
          >
            1. Productos
          </button>
          <button
            onClick={() => cart.length > 0 && setStep("cliente")}
            disabled={cart.length === 0}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${step === "cliente" ? "bg-white text-brand-600 font-medium" : "text-white disabled:opacity-50"}`}
          >
            2. Cliente
          </button>
          <button
            onClick={() => cliente && cart.length > 0 && setStep("checkout")}
            disabled={!cliente || cart.length === 0}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${step === "checkout" ? "bg-white text-brand-600 font-medium" : "text-white disabled:opacity-50"}`}
          >
            3. Confirmar
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* PRODUCTS step */}
        {step === "products" && (
          <>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <button className="px-3 py-2 border rounded-lg text-gray-600">
                <HiOutlineCamera className="w-5 h-5" />
              </button>
            </div>

            {searching && <p className="text-xs text-gray-400 text-center">Buscando...</p>}

            {results.length > 0 && (
              <div className="space-y-2 mb-4">
                {results.map((p) => (
                  <button
                    key={p.sku}
                    onClick={() => addToCart(p)}
                    className="w-full text-left bg-white border rounded-lg p-3 hover:border-brand-400 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">SKU: {p.sku} — Stock: {p.stock}</p>
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
                ))}
              </div>
            )}

            {/* Cart preview */}
            {cart.length > 0 && (
              <div className="bg-white border rounded-lg p-3 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Carrito ({cartCount} items)
                </h3>
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.sku} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">{formatPrice(item.precioVenta)} c/u</p>
                      </div>
                      <button onClick={() => updateQty(item.sku, -1)} className="w-7 h-7 border rounded flex items-center justify-center">
                        <HiOutlineMinus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.cantidad}</span>
                      <button onClick={() => updateQty(item.sku, 1)} className="w-7 h-7 border rounded flex items-center justify-center">
                        <HiOutlinePlus className="w-3 h-3" />
                      </button>
                      <button onClick={() => removeFromCart(item.sku)} className="text-red-400 p-1">
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
            )}
          </>
        )}

        {/* CLIENTE step */}
        {step === "cliente" && (
          <>
            <div className="relative mb-3">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={clienteSearch}
                onChange={(e) => searchClientes(e.target.value)}
                placeholder="Buscar cliente por nombre, CUIT o código..."
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
              />
            </div>

            {cliente && (
              <div className="bg-brand-50 border-2 border-brand-400 rounded-lg p-3 mb-3">
                <p className="text-xs text-brand-600 font-medium">SELECCIONADO</p>
                <p className="font-medium text-gray-800">{cliente.nombre}</p>
                <p className="text-xs text-gray-500">{cliente.cuit}</p>
                {cliente.direccion && <p className="text-xs text-gray-500">{cliente.direccion}</p>}
              </div>
            )}

            <div className="space-y-2">
              {clienteResults.map((c) => (
                <button
                  key={c.cod}
                  onClick={() => setCliente(c)}
                  className={`w-full text-left bg-white border rounded-lg p-3 hover:border-brand-400 ${
                    cliente?.cod === c.cod ? "border-brand-400 bg-brand-50" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                  <p className="text-xs text-gray-400">{c.cuit} {c.direccion && `— ${c.direccion}`}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* CHECKOUT step */}
        {step === "checkout" && cliente && (
          <>
            <div className="bg-white border rounded-lg p-3 mb-3">
              <h3 className="text-xs text-gray-500 mb-1">CLIENTE</h3>
              <p className="font-medium">{cliente.nombre}</p>
              <p className="text-xs text-gray-500">{cliente.cuit}</p>
            </div>

            <div className="bg-white border rounded-lg p-3 mb-3">
              <h3 className="text-xs text-gray-500 mb-2">PRODUCTOS ({cartCount})</h3>
              <div className="space-y-1">
                {cart.map((i) => (
                  <div key={i.sku} className="text-sm flex justify-between">
                    <span className="flex-1 truncate">{i.cantidad} × {i.name}</span>
                    <span className="font-medium">{formatPrice(i.precioVenta * i.cantidad)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t mt-2 pt-2 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-brand-500">{formatPrice(cartTotal)}</span>
              </div>
            </div>

            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas (opcional)"
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm mb-3"
            />

            <p className="text-xs text-gray-400 text-center mb-3">
              <HiOutlineLocationMarker className="inline w-4 h-4" /> Se va a tomar tu ubicación al enviar
            </p>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 text-sm font-bold text-white bg-green-600 rounded-xl disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Enviar pedido (PunTouch + WhatsApp)"}
            </button>
          </>
        )}
      </div>

      {/* Floating cart button */}
      {step !== "products" && cart.length > 0 && (
        <button
          onClick={() => setStep("products")}
          className="fixed bottom-4 right-4 bg-brand-400 text-white px-4 py-3 rounded-full shadow-lg flex items-center gap-2 z-40"
        >
          <HiOutlineShoppingCart className="w-5 h-5" />
          {cartCount}
        </button>
      )}
    </div>
  );
}
