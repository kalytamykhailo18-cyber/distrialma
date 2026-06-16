"use client";

import { useEffect, useState } from "react";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

const PRICE_LISTS = [
  { lista: 1, label: "Minorista" },
  { lista: 2, label: "Mayorista" },
  { lista: 3, label: "Especial" },
  { lista: 4, label: "Caja Cerrada" },
  { lista: 5, label: "Lista 5" },
];

export default function AdminConfigPage() {
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [stockThreshold, setStockThreshold] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Margins
  const [margins, setMargins] = useState<Record<number, string>>({});
  const [savingMargins, setSavingMargins] = useState(false);
  const [marginSaved, setMarginSaved] = useState(false);

  // Reparto settings
  const [repartoMin, setRepartoMin] = useState("60000");
  const [shippingThreshold, setShippingThreshold] = useState("200000");
  const [shippingSku, setShippingSku] = useState("");
  const [shippingPrice, setShippingPrice] = useState("0");
  const [savingReparto, setSavingReparto] = useState(false);
  const [repartoSaved, setRepartoSaved] = useState(false);

  // Costeo group notification
  const [groupOptions, setGroupOptions] = useState<{ id: string; name: string }[]>([]);
  const [costeoGroupId, setCosteoGroupId] = useState("");
  const [costeoGroupId2, setCosteoGroupId2] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupSaved, setGroupSaved] = useState(false);
  const [groupsError, setGroupsError] = useState("");

  // Recibos semanal email recipients
  const [recibosSemanalEmails, setRecibosSemanalEmails] = useState("");
  const [savingRecibosEmails, setSavingRecibosEmails] = useState(false);
  const [recibosEmailsSaved, setRecibosEmailsSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/price-margins").then((r) => r.json()),
    ])
      .then(([settings, marginData]) => {
        setHideOutOfStock(settings.hide_out_of_stock === "true");
        setStockThreshold(settings.stock_threshold || "0");
        setRepartoMin(settings.promo_min_subtotal || "60000");
        setShippingThreshold(settings.shipping_threshold || "200000");
        setShippingSku(settings.shipping_sku || "");
        setShippingPrice(settings.shipping_price || "0");
        setCosteoGroupId(settings.costeo_group_id || "");
        setCosteoGroupId2(settings.costeo_group_id_2 || "");
        setRecibosSemanalEmails(settings.recibos_semanal_emails || "");
        const m: Record<number, string> = {};
        for (const mg of marginData.margins || []) {
          m[mg.lista] = String(mg.margen);
        }
        setMargins(m);
      })
      .finally(() => setLoading(false));

    fetch("/api/admin/bot-groups")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setGroupsError(d.error);
        setGroupOptions(d.groups || []);
      })
      .catch((e) => setGroupsError(e instanceof Error ? e.message : "Error"));
  }, []);

  async function toggleStock() {
    setSaving(true);
    const newValue = !hideOutOfStock;
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "hide_out_of_stock",
        value: String(newValue),
      }),
    });
    setHideOutOfStock(newValue);
    setSaving(false);
  }

  async function saveThreshold() {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "stock_threshold",
        value: stockThreshold,
      }),
    });
    setSaving(false);
  }

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Configuración</h1>
      </Stagger>

      {loading ? (
        <LoadingCenter />
      ) : (
        <div className="space-y-4">
          <Stagger delay={50}>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    Ocultar productos con poco stock
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Si está activado, oculta productos con stock igual o menor al mínimo configurado.
                  </p>
                </div>
                <button
                  onClick={toggleStock}
                  disabled={saving}
                  className={`${springBtn} px-4 py-2 rounded-xl text-sm font-medium ${
                    hideOutOfStock
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  } disabled:opacity-50`}
                >
                  {saving
                    ? "..."
                    : hideOutOfStock
                    ? "Activado"
                    : "Desactivado"}
                </button>
              </div>
            </div>
          </Stagger>

          {hideOutOfStock && (
            <Stagger delay={100}>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-900 mb-2">
                  Stock mínimo para mostrar
                </h2>
                <p className="text-sm text-gray-500 mb-3">
                  Productos con stock igual o menor a este valor se ocultan de la tienda.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={stockThreshold}
                    onChange={(e) => setStockThreshold(e.target.value)}
                    min="0"
                    className="w-24 px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <span className="text-sm text-gray-500">unidades</span>
                  <button
                    onClick={saveThreshold}
                    disabled={saving}
                    className={`${springBtn} px-4 py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50`}
                  >
                    {saving ? "..." : "Guardar"}
                  </button>
                </div>
              </div>
            </Stagger>
          )}

          {/* Reparto settings */}
          <Stagger delay={125}>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-1">
                Reparto directo
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Configuración de pedido mínimo y envío para pedidos web directos (no vendedores).
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pedido mínimo</label>
                  <p className="text-xs text-gray-400 mb-2">Monto mínimo para aceptar un pedido web. Los artículos promocionales no cuentan.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">$</span>
                    <input type="number" step="1000" value={repartoMin}
                      onChange={(e) => setRepartoMin(e.target.value)}
                      className="w-40 px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
                    <span className="text-xs text-gray-400">(0 = sin mínimo)</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Umbral envío gratis</label>
                  <p className="text-xs text-gray-400 mb-2">Por encima de este monto el envío es gratis. Por debajo se cobra automáticamente.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">$</span>
                    <input type="number" step="1000" value={shippingThreshold}
                      onChange={(e) => setShippingThreshold(e.target.value)}
                      className="w-40 px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
                  </div>
                </div>
                <div className="flex gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU envío</label>
                    <input type="text" value={shippingSku}
                      onChange={(e) => setShippingSku(e.target.value)}
                      placeholder="Ej: 1"
                      className="w-28 px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio envío</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">$</span>
                      <input type="number" step="100" value={shippingPrice}
                        onChange={(e) => setShippingPrice(e.target.value)}
                        className="w-32 px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={async () => {
                  setSavingReparto(true);
                  setRepartoSaved(false);
                  const saves = [
                    { key: "promo_min_subtotal", value: repartoMin },
                    { key: "shipping_threshold", value: shippingThreshold },
                    { key: "shipping_sku", value: shippingSku },
                    { key: "shipping_price", value: shippingPrice },
                  ];
                  for (const s of saves) {
                    await fetch("/api/admin/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(s),
                    });
                  }
                  setSavingReparto(false);
                  setRepartoSaved(true);
                  setTimeout(() => setRepartoSaved(false), 2000);
                }}
                disabled={savingReparto}
                className={`${springBtn} mt-4 px-4 py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50`}
              >
                {savingReparto ? "..." : repartoSaved ? "Guardado!" : "Guardar reparto"}
              </button>
            </div>
          </Stagger>

          {/* Price margins */}
          <Stagger delay={150}>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-1">
                Márgenes de ganancia por lista
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Al costear un ingreso, los precios se calculan automáticamente: Costo × (1 + Margen%). Se redondea sin decimales.
              </p>
              <div className="space-y-2">
                {PRICE_LISTS.map((pl, i) => (
                  <div key={pl.lista} className={`flex items-center gap-3 rounded-lg px-2 py-1 ${hoverRow}`} style={staggerStyle(true, i)}>
                    <span className="text-sm text-gray-700 w-28">{pl.label}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={margins[pl.lista] || ""}
                      onChange={(e) => setMargins((prev) => ({ ...prev, [pl.lista]: e.target.value }))}
                      placeholder="0"
                      className="w-24 px-3 py-2 border border-brand-400 rounded-xl text-sm text-right focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                ))}
              </div>
              <button
                onClick={async () => {
                  setSavingMargins(true);
                  setMarginSaved(false);
                  await fetch("/api/admin/price-margins", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      margins: PRICE_LISTS.map((pl) => ({
                        lista: pl.lista,
                        margen: parseFloat(margins[pl.lista] || "0") || 0,
                      })),
                    }),
                  });
                  setSavingMargins(false);
                  setMarginSaved(true);
                  setTimeout(() => setMarginSaved(false), 2000);
                }}
                disabled={savingMargins}
                className={`${springBtn} mt-4 px-4 py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50`}
              >
                {savingMargins ? "..." : marginSaved ? "Guardado!" : "Guardar márgenes"}
              </button>
            </div>
          </Stagger>

          {/* Costeo group notification */}
          <Stagger delay={175}>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-1">
                Avisos de costeo al grupo
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Cuando se termina de costear una compra, Mily manda un mensaje al grupo elegido con los productos costeados.
              </p>
              {groupsError && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded px-3 py-2 mb-3">
                  No se pudo cargar la lista de grupos del bot ({groupsError}). Asegurate de que Mily este conectado.
                </p>
              )}
              <div className="space-y-2">
                <select
                  value={costeoGroupId}
                  onChange={(e) => setCosteoGroupId(e.target.value)}
                  className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 bg-white"
                >
                  <option value="">— Grupo 1: Desactivado —</option>
                  {groupOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || g.id}
                    </option>
                  ))}
                </select>
                <select
                  value={costeoGroupId2}
                  onChange={(e) => setCosteoGroupId2(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 bg-white"
                >
                  <option value="">— Grupo 2: Desactivado (opcional) —</option>
                  {groupOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || g.id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    setSavingGroup(true);
                    setGroupSaved(false);
                    await Promise.all([
                      fetch("/api/admin/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: "costeo_group_id", value: costeoGroupId }),
                      }),
                      fetch("/api/admin/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: "costeo_group_id_2", value: costeoGroupId2 }),
                      }),
                    ]);
                    setSavingGroup(false);
                    setGroupSaved(true);
                    setTimeout(() => setGroupSaved(false), 2000);
                  }}
                  disabled={savingGroup}
                  className={`${springBtn} w-full px-4 py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50`}
                >
                  {savingGroup ? "..." : groupSaved ? "Guardado!" : "Guardar"}
                </button>
              </div>
            </div>
          </Stagger>

          {/* Recibos semanal — email recipients */}
          <Stagger delay={325}>
            <div className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
              <h2 className="text-lg font-bold mb-4 text-gray-800">Informe semanal de recibos a proveedores</h2>
              <p className="text-sm text-gray-500 mb-4">
                Cada viernes a las 19:30 se envia por mail un resumen de los recibos de la semana (total, detalle por proveedor, cheques propios emitidos).
                Separa varios mails con coma o punto y coma.
              </p>
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mails que reciben el informe</label>
                  <input
                    type="text"
                    value={recibosSemanalEmails}
                    onChange={(e) => { setRecibosSemanalEmails(e.target.value); setRecibosEmailsSaved(false); }}
                    placeholder="alma@distrialma.com.ar, contadora@distrialma.com.ar"
                    className="w-full px-3 py-2 border border-brand-300 rounded-xl text-sm"
                  />
                </div>
                <button
                  onClick={async () => {
                    setSavingRecibosEmails(true);
                    setRecibosEmailsSaved(false);
                    await fetch("/api/admin/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ key: "recibos_semanal_emails", value: recibosSemanalEmails }),
                    });
                    setSavingRecibosEmails(false);
                    setRecibosEmailsSaved(true);
                    setTimeout(() => setRecibosEmailsSaved(false), 2500);
                  }}
                  disabled={savingRecibosEmails}
                  className="px-4 py-2 text-sm text-white bg-brand-400 rounded-xl hover:bg-brand-500 disabled:opacity-50"
                >
                  {savingRecibosEmails ? "..." : recibosEmailsSaved ? "Guardado!" : "Guardar"}
                </button>
              </div>
            </div>
          </Stagger>
        </div>
      )}
    </PageTransition>
  );
}
