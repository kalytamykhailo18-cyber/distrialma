"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { HiOutlineRefresh } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";
import { useCart } from "@/components/CartProvider";

interface Cliente {
  cod: string;
  nombre: string;
  direccion: string;
  cuit: string;
  telefono: string;
  saldo: number;
}

interface Transaccion { boleta: string; fecha: string; tipo: string; total: number }
interface PedidoItem { sku: string; nombre: string; cantidad: number; precio: number; impo: number }
interface Pedido { boleta: string; fecha: string; total: number; notas: string; items: PedidoItem[] }

export default function MiCuentaPage() {
  const { status } = useSession();
  const router = useRouter();
  const { addItem } = useCart();
  const [tab, setTab] = useState<"cuenta" | "pedidos" | "datos">("cuenta");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPedido, setExpandedPedido] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") loadData();
  }, [status, tab]); // eslint-disable-line

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/client/mi-cuenta?tab=${tab}`);
      const d = await res.json();
      if (d.cliente) setCliente(d.cliente);
      if (d.transacciones) setTransacciones(d.transacciones);
      if (d.pedidos) setPedidos(d.pedidos);
    } catch {}
    setLoading(false);
  }

  async function reorder(pedido: Pedido) {
    setReordering(true);
    for (const item of pedido.items) {
      addItem({
        sku: item.sku,
        name: item.nombre,
        precioMayorista: item.precio,
        precioCajaCerrada: 0,
        unit: "UN",
        pesoMayorista: 0,
        cantidadPorCaja: 0,
      });
    }
    setReordering(false);
    router.push("/productos");
  }

  if (status === "loading" || loading) return <LoadingCenter text="Cargando..." />;
  if (!cliente) return <div className="p-8 text-center text-gray-400">No se pudo cargar tu cuenta</div>;

  return (
    <PageTransition className="max-w-3xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Mi Cuenta</h1>
        <p className="text-sm text-gray-500 mb-2">{cliente.nombre}</p>
        <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${cliente.saldo > 0 ? "bg-red-100 text-red-700" : cliente.saldo < 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
          Saldo: {formatPrice(cliente.saldo)}
        </div>
      </Stagger>

      {/* Tabs */}
      <Stagger delay={50}>
        <div className="flex gap-2 mb-6">
          {([["cuenta", "Cuenta Corriente"], ["pedidos", "Mis Pedidos"], ["datos", "Mis Datos"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${springBtn} ${tab === key ? "bg-brand-500 text-white" : "bg-white border text-gray-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </Stagger>

      {/* CUENTA CORRIENTE */}
      {tab === "cuenta" && (
        <Stagger delay={100}>
          {transacciones.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No hay movimientos</div>
          ) : (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500">
                Ultimos {transacciones.length} movimientos
              </div>
              <div className="divide-y">
                {transacciones.map((t, i) => (
                  <div key={t.boleta + i} className={`flex justify-between items-center px-4 py-3 ${hoverRow}`} style={staggerStyle(true, i, 0, 10)}>
                    <div>
                      <span className="text-sm text-gray-900">{t.tipo}</span>
                      <span className="text-xs text-gray-400 ml-2">#{t.boleta}</span>
                      <div className="text-xs text-gray-400">{t.fecha}</div>
                    </div>
                    <span className={`text-sm font-bold ${t.tipo === "Venta" ? "text-red-600" : "text-green-600"}`}>
                      {t.tipo === "Venta" ? "" : "+"}{formatPrice(t.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Stagger>
      )}

      {/* MIS PEDIDOS */}
      {tab === "pedidos" && (
        <Stagger delay={100}>
          {pedidos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No hay pedidos</div>
          ) : (
            <div className="space-y-3">
              {pedidos.map((p, i) => (
                <div key={p.boleta} className="bg-white border rounded-xl shadow-sm overflow-hidden" style={staggerStyle(true, i, 0, 10)}>
                  <button onClick={() => setExpandedPedido(expandedPedido === p.boleta ? null : p.boleta)}
                    className={`w-full flex justify-between items-center px-4 py-3 ${hoverRow}`}>
                    <div className="text-left">
                      <span className="text-sm font-medium text-gray-900">Pedido #{p.boleta}</span>
                      <div className="text-xs text-gray-400">{p.fecha} — {p.items?.length || 0} productos</div>
                    </div>
                    <span className="text-sm font-bold text-brand-600">{formatPrice(p.total)}</span>
                  </button>
                  {expandedPedido === p.boleta && (
                    <div className="border-t px-4 py-3 bg-gray-50">
                      <div className="space-y-1 mb-3">
                        {(p.items || []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-gray-700">{item.cantidad}x {item.nombre}</span>
                            <span className="text-gray-500">{formatPrice(item.impo || item.precio * item.cantidad)}</span>
                          </div>
                        ))}
                      </div>
                      {p.items?.length > 0 && (
                        <button onClick={() => reorder(p)} disabled={reordering}
                          className={`w-full py-2 bg-brand-400 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${springBtn}`}>
                          <HiOutlineRefresh className="w-4 h-4" />
                          Repetir pedido
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Stagger>
      )}

      {/* MIS DATOS */}
      {tab === "datos" && (
        <Stagger delay={100}>
          <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
            <div>
              <span className="text-xs text-gray-500">Nombre</span>
              <p className="text-sm font-medium text-gray-900">{cliente.nombre}</p>
            </div>
            {cliente.cuit && (
              <div>
                <span className="text-xs text-gray-500">CUIT</span>
                <p className="text-sm text-gray-900">{cliente.cuit}</p>
              </div>
            )}
            {cliente.direccion && (
              <div>
                <span className="text-xs text-gray-500">Direccion</span>
                <p className="text-sm text-gray-900">{cliente.direccion}</p>
              </div>
            )}
            {cliente.telefono && (
              <div>
                <span className="text-xs text-gray-500">Telefono</span>
                <p className="text-sm text-gray-900">{cliente.telefono}</p>
              </div>
            )}
            <div>
              <span className="text-xs text-gray-500">Codigo de cliente</span>
              <p className="text-sm text-gray-900">#{cliente.cod}</p>
            </div>
          </div>
        </Stagger>
      )}
    </PageTransition>
  );
}
