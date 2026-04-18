"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineSearch, HiOutlineDocumentDownload, HiOutlinePhone, HiOutlineLocationMarker, HiChevronDown, HiOutlineArrowLeft } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, CollapsiblePanel } from "@/components/AnimateIn";

interface ClienteListItem {
  cod: string;
  nombre: string;
  direccion: string;
  telefono: string;
  saldo: number;
  totalVeces: number;
}

interface ClienteDetalle {
  cod: string;
  nombre: string;
  saldo: number;
  totalCompras: number;
  totalVeces: number;
  cuit: string;
  email: string;
  telefono: string;
  direccion: string;
  localidad: string;
  zona: string;
  fechaAlta: string;
  observaciones: string;
}

interface Factura {
  boleta: string;
  sucursal: string;
  total: number;
  efectivo: number;
  tarjeta: number;
  deuda: number;
  fecha: string;
  hora: string;
}

interface FacturaItem {
  sku: string;
  nombre: string;
  cantidad: number;
  precio: number;
  impo: number;
  unidad: string;
  unidadesAprox: number | null;
  listaPrecio: number;
  listaLabel: string;
}

const SUC_NAMES: Record<string, string> = { "1": "Minorista", "2": "Mayorista", "6": "Pontevedra", "7": "Distribuidora", "10": "Reventas" };

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [clientes, setClientes] = useState<ClienteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Detail view
  const [selectedCod, setSelectedCod] = useState<string | null>(null);
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Factura items
  const [expandedBoleta, setExpandedBoleta] = useState<string | null>(null);
  const [facturaItems, setFacturaItems] = useState<FacturaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [pedidosWeb, setPedidosWeb] = useState<Array<{ boleta: string; nroped: string; total: number; fecha: string; hora: string; notas: string }>>([]);
  const [clientTab, setClientTab] = useState<"facturas" | "pedidos">("facturas");

  async function loadClientes(p = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "50" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/clientes?${params}`);
      const d = await res.json();
      setClientes(d.clientes || []);
      setTotal(d.total || 0);
      setPage(d.page || 1);
      setTotalPages(d.totalPages || 1);
    } catch {}
    setLoading(false);
  }

  async function loadDetail(cod: string) {
    setSelectedCod(cod);
    setLoadingDetail(true);
    setExpandedBoleta(null);
    setClientTab("facturas");
    try {
      const res = await fetch(`/api/admin/clientes?cod=${cod}`);
      const d = await res.json();
      setCliente(d.cliente || null);
      setFacturas(d.facturas || []);
      setPedidosWeb(d.pedidosWeb || []);
    } catch {}
    setLoadingDetail(false);
  }

  async function loadFacturaItems(boleta: string) {
    if (expandedBoleta === boleta) { setExpandedBoleta(null); return; }
    setExpandedBoleta(boleta);
    setLoadingItems(true);
    try {
      const res = await fetch(`/api/admin/clientes/factura?boleta=${boleta}`);
      const d = await res.json();
      setFacturaItems(d.items || []);
    } catch {}
    setLoadingItems(false);
  }

  async function downloadFacturaPDF(boleta: string, fecha: string) {
    const items = expandedBoleta === boleta ? facturaItems : [];
    if (items.length === 0) {
      const res = await fetch(`/api/admin/clientes/factura?boleta=${boleta}`);
      const d = await res.json();
      if (!d.items?.length) return;
      generatePDF(boleta, fecha, d.items);
    } else {
      generatePDF(boleta, fecha, items);
    }
  }

  async function generatePDF(boleta: string, fecha: string, items: FacturaItem[]) {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    let y = 15;

    // Load logo
    let logoImg: string | null = null;
    try {
      const resp = await fetch("/logo.png");
      const blob = await resp.blob();
      logoImg = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {}

    // Header
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 22, "F");
    if (logoImg) {
      try { doc.addImage(logoImg, "PNG", 10, 3, 16, 16); } catch {}
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma", logoImg ? 30 : 14, 13);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Boleta #${boleta} — ${fecha}`, w - 14, 13, { align: "right" });

    if (cliente) {
      doc.text(`Cliente: ${cliente.nombre} — CUIT: ${cliente.cuit || "—"}`, w - 14, 19, { align: "right" });
    }
    y = 28;

    // Table header
    doc.setFillColor(55, 65, 81);
    doc.rect(10, y, w - 20, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("SKU", 14, y + 5);
    doc.text("Producto", 30, y + 5);
    doc.text("Cant.", 120, y + 5, { align: "right" });
    doc.text("Precio", 145, y + 5, { align: "right" });
    doc.text("Importe", w - 14, y + 5, { align: "right" });
    y += 12;

    doc.setTextColor(50, 50, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    let totalImpo = 0;
    for (const item of items) {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.text(item.sku, 14, y);
      doc.text(item.nombre.substring(0, 45), 30, y);
      doc.text(item.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 }) + (item.unidad === "KG" ? " kg" : ""), 120, y, { align: "right" });
      doc.text(formatPrice(item.precio), 145, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(formatPrice(item.impo), w - 14, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setDrawColor(235, 235, 235);
      doc.line(10, y + 1.5, w - 10, y + 1.5);
      y += 5;
      totalImpo += item.impo;
    }

    // Total
    y += 3;
    doc.setFillColor(251, 154, 71);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL (${items.length} productos)`, 14, y + 7);
    doc.text(formatPrice(totalImpo), w - 14, y + 7, { align: "right" });

    doc.save(`Factura-${boleta}-${fecha.replace(/\//g, "-")}.pdf`);
  }

  useEffect(() => { loadClientes(1); }, []); // eslint-disable-line
  useEffect(() => { setPage(1); }, [search]);

  // Detail view
  if (selectedCod) {
    return (
      <PageTransition className="max-w-4xl mx-auto px-4 py-6">
        <Stagger delay={0} y={-8}>
          <button onClick={() => { setSelectedCod(null); setCliente(null); }} className={`flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 mb-4 ${springBtn}`}>
            <HiOutlineArrowLeft className="w-4 h-4" />
            Volver a clientes
          </button>
        </Stagger>

        {loadingDetail ? <LoadingCenter /> : !cliente ? <p className="text-gray-400">Cliente no encontrado</p> : (
          <>
            {/* Client header */}
            <Stagger delay={50}>
              <div className="bg-white border rounded-xl shadow-sm p-5 mb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{cliente.nombre}</h1>
                    <p className="text-sm text-gray-400">#{cliente.cod} {cliente.observaciones && `— ${cliente.observaciones}`}</p>
                  </div>
                  <div className={`text-right px-4 py-2 rounded-xl ${cliente.saldo > 0 ? "bg-red-50 border-2 border-red-300" : cliente.saldo < 0 ? "bg-green-50 border-2 border-green-300" : "bg-gray-50 border"}`}>
                    <div className="text-xs text-gray-500">Saldo</div>
                    <div className={`text-lg font-bold ${cliente.saldo > 0 ? "text-red-600" : cliente.saldo < 0 ? "text-green-600" : "text-gray-600"}`}>
                      {formatPrice(cliente.saldo)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  {cliente.direccion && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <HiOutlineLocationMarker className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                      <span>{cliente.direccion}{cliente.localidad ? `, ${cliente.localidad}` : ""}</span>
                    </div>
                  )}
                  {cliente.telefono && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <HiOutlinePhone className="w-4 h-4 shrink-0 text-gray-400" />
                      <span>{cliente.telefono}</span>
                    </div>
                  )}
                  {cliente.cuit && (
                    <div className="text-gray-600"><span className="text-gray-400">CUIT:</span> {cliente.cuit}</div>
                  )}
                  {cliente.zona && (
                    <div className="text-gray-600"><span className="text-gray-400">Zona:</span> {cliente.zona}</div>
                  )}
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-400">
                  <span>{cliente.totalVeces} compras</span>
                  {cliente.fechaAlta && <span>Alta: {cliente.fechaAlta.slice(6, 8)}/{cliente.fechaAlta.slice(4, 6)}/{cliente.fechaAlta.slice(0, 4)}</span>}
                </div>
              </div>
            </Stagger>

            {/* Tabs */}
            <Stagger delay={100}>
              <div className="flex border-b mb-4">
                <button onClick={() => setClientTab("facturas")}
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${clientTab === "facturas" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  Facturas ({facturas.length})
                </button>
                <button onClick={() => setClientTab("pedidos")}
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${clientTab === "pedidos" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  Pedidos Web ({pedidosWeb.length})
                </button>
              </div>
            </Stagger>

            {/* Web orders tab */}
            {clientTab === "pedidos" && (
              <Stagger delay={120}>
                <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                  <div className="divide-y">
                    {pedidosWeb.length === 0 ? (
                      <p className="px-4 py-6 text-gray-400 text-center text-sm">No hay pedidos web de este cliente.</p>
                    ) : pedidosWeb.map((p, i) => (
                      <div key={p.boleta} style={staggerStyle(true, i, 100, 20)}
                        className={`px-4 py-3 ${hoverRow}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 font-mono">#{p.nroped || p.boleta}</span>
                              <span className="text-sm font-medium text-gray-900">{p.fecha} {p.hora}</span>
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Web</span>
                            </div>
                            {p.notas && <div className="text-xs text-amber-600 mt-0.5">Nota: {p.notas}</div>}
                          </div>
                          <div className="text-sm font-bold text-gray-900">{formatPrice(p.total)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Stagger>
            )}

            {/* Invoices */}
            {clientTab === "facturas" && (
            <Stagger delay={120}>
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="divide-y">
                  {facturas.map((f, i) => {
                    const isOpen = expandedBoleta === f.boleta;
                    return (
                    <div key={f.boleta} className={isOpen ? "bg-brand-50 border-l-4 border-l-brand-500 rounded-xl shadow-md my-1" : ""} style={staggerStyle(true, i, 100, 20)}>
                      <button onClick={() => loadFacturaItems(f.boleta)}
                        className={`w-full px-4 py-2.5 flex items-center justify-between text-left ${hoverRow} ${isOpen ? "bg-brand-50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-mono">#{f.boleta}</span>
                            <span className={`text-sm font-medium truncate ${isOpen ? "text-brand-700" : "text-gray-900"}`}>{f.fecha} {f.hora}</span>
                            <span className="text-xs text-gray-400">{SUC_NAMES[f.sucursal] || `Suc ${f.sucursal}`}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {f.deuda > 0 && <span className="text-red-500">Cta.Cte. {formatPrice(f.deuda)}</span>}
                            {f.efectivo > 0 && <span className="text-green-600 ml-2">Ef. {formatPrice(f.efectivo)}</span>}
                            {f.tarjeta > 0 && <span className="text-blue-600 ml-2">Tarj. {formatPrice(f.tarjeta)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-bold text-gray-900">{formatPrice(f.total)}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); downloadFacturaPDF(f.boleta, f.fecha); }}
                            className={`p-1.5 text-red-500 hover:bg-red-50 rounded-lg ${springBtn}`} title="Descargar PDF">
                            <HiOutlineDocumentDownload className="w-4 h-4" />
                          </button>
                          <HiChevronDown className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                        </div>
                      </button>
                      <CollapsiblePanel open={isOpen}>
                        <div className="px-4 py-2 bg-brand-50/50 border-t border-brand-200">
                          {loadingItems ? <p className="text-xs text-gray-400 py-2">Cargando...</p> : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left py-1">Producto</th>
                                  <th className="text-right py-1">Cant.</th>
                                  <th className="text-right py-1">~Unid.</th>
                                  <th className="text-right py-1">Precio</th>
                                  <th className="text-right py-1">Importe</th>
                                  <th className="text-right py-1">Lista</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-brand-100">
                                {facturaItems.map((item, j) => (
                                  <tr key={j} className={hoverRow}>
                                    <td className="py-1.5">
                                      <span className="text-gray-400 font-mono mr-1">{item.sku}</span>
                                      {item.nombre}
                                    </td>
                                    <td className="text-right py-1.5">{item.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })} {item.unidad === "KG" ? "kg" : ""}</td>
                                    <td className="text-right py-1.5 text-blue-600">{item.unidadesAprox != null ? `~${item.unidadesAprox}` : item.unidad === "KG" ? "—" : ""}</td>
                                    <td className="text-right py-1.5">{formatPrice(item.precio)}</td>
                                    <td className="text-right py-1.5 font-medium">{formatPrice(item.impo)}</td>
                                    <td className="text-right py-1.5 text-gray-400">{item.listaLabel}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </CollapsiblePanel>
                    </div>
                    );
                  })}
                </div>
              </div>
            </Stagger>
            )}
          </>
        )}
      </PageTransition>
    );
  }

  // List view
  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clientes</h1>
        <p className="text-sm text-gray-500 mb-4">Busca clientes, consulta saldo y descarga facturas.</p>
      </Stagger>

      <Stagger delay={50}>
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") loadClientes(1); }}
              placeholder="Buscar por nombre, codigo, telefono o CUIT..."
              className="w-full pl-9 pr-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
          </div>
          <button onClick={() => loadClientes(1)} className={`px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-semibold ${springBtn}`}>
            Buscar
          </button>
        </div>
      </Stagger>

      {loading ? <LoadingCenter /> : (
        <Stagger delay={100}>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500 flex justify-between">
              <span>{total.toLocaleString("es-AR")} clientes</span>
              <span>Pagina {page} / {totalPages}</span>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-center gap-1">
                <button onClick={() => loadClientes(1)} disabled={page === 1} className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>«</button>
                <button onClick={() => loadClientes(page - 1)} disabled={page === 1} className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Anterior</button>
                <span className="text-xs text-gray-500 mx-2">{page} / {totalPages}</span>
                <button onClick={() => loadClientes(page + 1)} disabled={page >= totalPages} className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Siguiente</button>
                <button onClick={() => loadClientes(totalPages)} disabled={page >= totalPages} className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>»</button>
              </div>
            )}
            <div className="divide-y">
              {clientes.map((c, i) => (
                <button key={c.cod} onClick={() => loadDetail(c.cod)}
                  style={staggerStyle(true, i, 100, 20)}
                  className={`w-full px-4 py-3 flex items-center justify-between text-left ${hoverRow}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{c.nombre}</span>
                      <span className="text-xs text-gray-400">#{c.cod}</span>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                      {c.direccion && <span>{c.direccion}</span>}
                      {c.telefono && <span>{c.telefono}</span>}
                      <span>{c.totalVeces} compras</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${c.saldo > 0 ? "text-red-600" : c.saldo < 0 ? "text-green-600" : "text-gray-400"}`}>
                      {c.saldo !== 0 ? formatPrice(c.saldo) : "—"}
                    </div>
                    {c.saldo > 0 && <div className="text-xs text-red-500">Debe</div>}
                    {c.saldo < 0 && <div className="text-xs text-green-500">A favor</div>}
                  </div>
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-2 bg-gray-50 border-t flex items-center justify-center gap-1">
                <button onClick={() => loadClientes(page - 1)} disabled={page === 1} className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Anterior</button>
                <span className="text-xs text-gray-500 mx-2">{page} / {totalPages}</span>
                <button onClick={() => loadClientes(page + 1)} disabled={page >= totalPages} className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Siguiente</button>
              </div>
            )}
          </div>
        </Stagger>
      )}
    </PageTransition>
  );
}
