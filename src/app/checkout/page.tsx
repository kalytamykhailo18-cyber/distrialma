"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { formatPrice } from "@/lib/utils";
import { HiExclamation } from "react-icons/hi";
import { FaWhatsapp } from "react-icons/fa";
import { PageTransition, Stagger, LoadingCenter, springBtn } from "@/components/AnimateIn";

interface ClientInfo {
  name: string;
  role: string;
  address?: string;
  phone?: string;
  deliveryDay: string | null;
}

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { items, totalPrice, clearCart, nonPromoTotal, cartConfig, meetsMinimum, freeShipping } = useCart();
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [pendingAction, setPendingAction] = useState<"order" | "whatsapp" | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/checkout");
    }
  }, [status, router]);

  // Redirect to cart if empty
  useEffect(() => {
    if (items.length === 0 && status === "authenticated") {
      router.push("/carrito");
    }
  }, [items.length, status, router]);

  // Fetch client info when authenticated
  useEffect(() => {
    if (status === "authenticated") {
      setLoadingClient(true);
      fetch("/api/client/me")
        .then((r) => r.json())
        .then((data) => setClientInfo(data))
        .catch(() => setClientInfo(null))
        .finally(() => setLoadingClient(false));
    }
  }, [status]);

  function buildWhatsAppMessage(): string {
    let msg = `*Pedido de ${clientInfo?.name || session?.user?.name}*\n`;
    if (clientInfo?.deliveryDay) {
      msg += `Día de entrega: ${clientInfo.deliveryDay}\n`;
    }
    msg += `\n`;

    for (const item of items) {
      if (item.isCombo && item.comboItems) {
        msg += `- COMBO: ${item.name} x${item.quantity}\n`;
        for (const ci of item.comboItems) {
          msg += `    ${ci.quantity}x ${ci.name}\n`;
        }
        msg += `  ${formatPrice(item.precioMayorista * item.quantity)}\n`;
      } else {
        const isBox = item.mode === "box" && item.precioCajaCerrada > 0;
        const hasBoxInCart = items.some((other) => other.sku === item.sku && other.mode === "box" && other.precioCajaCerrada > 0);
        const unitAutoBox = item.mode === "unit" && item.precioCajaCerrada > 0 && (hasBoxInCart || (item.cantidadPorCaja > 0 && item.quantity >= item.cantidadPorCaja));
        const unitPrice = isBox ? item.precioCajaCerrada : unitAutoBox ? item.precioCajaCerrada : item.precioMayorista;
        const label = isBox
          ? `Caja x${item.cantidadPorCaja}`
          : item.unit === "KG" ? "KG" : "Un.";
        const lineTotal = isBox
          ? item.precioCajaCerrada * item.cantidadPorCaja * item.quantity
          : unitAutoBox
          ? item.precioCajaCerrada * item.quantity
          : item.precioMayorista * item.quantity;
        msg += `- ${item.name} (${item.sku})\n`;
        msg += `  ${item.quantity} x ${formatPrice(unitPrice)}/${label} = ${formatPrice(lineTotal)}\n`;
      }
    }

    msg += `\n*Total: ${formatPrice(totalPrice)}*\n`;
    if (notes.trim()) {
      msg += `\nNotas: ${notes.trim()}\n`;
    }
    return msg;
  }

  function handleWhatsApp() {
    const msg = buildWhatsAppMessage();
    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/5491154137677?text=${encoded}`, "_blank");
  }

  if (status === "loading" || loadingClient) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <LoadingCenter />
      </div>
    );
  }

  if (status === "unauthenticated" || items.length === 0) {
    return null;
  }

  return (
    <PageTransition className="max-w-2xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Finalizar pedido</h1>
      </Stagger>

      {/* Client info */}
      <Stagger delay={80}>
      <div className="bg-white rounded-lg border shadow-sm p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Datos del cliente</h2>
        <div className="text-sm space-y-1">
          <p><span className="text-gray-500">Nombre:</span> {clientInfo?.name || session?.user?.name}</p>
          {clientInfo?.address && (
            <p><span className="text-gray-500">Dirección:</span> {clientInfo.address}</p>
          )}
          {clientInfo?.phone && (
            <p><span className="text-gray-500">Teléfono:</span> {clientInfo.phone}</p>
          )}
          {clientInfo?.deliveryDay && (
            <p>
              <span className="text-gray-500">Día de entrega:</span>{" "}
              <span className="font-medium text-brand-600">{clientInfo.deliveryDay}</span>
            </p>
          )}
        </div>
      </div>
      </Stagger>

      {/* Order summary */}
      <Stagger delay={160}>
      <div className="bg-white rounded-lg border shadow-sm p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Resumen del pedido ({items.length} producto{items.length !== 1 ? "s" : ""})
        </h2>
        <div className="space-y-2 text-sm">
          {items.map((item) => {
            const isBox = item.mode === "box" && item.precioCajaCerrada > 0;
            const lineTotal = isBox
              ? item.precioCajaCerrada * item.cantidadPorCaja * item.quantity
              : item.precioMayorista * item.quantity;
            const isPromo = cartConfig.promoSkus.includes(item.sku);
            return (
              <div key={item.sku} className={`flex justify-between ${isPromo ? "border border-orange-400 rounded-lg px-2 py-1 bg-orange-50" : ""}`}>
                <span className="text-gray-700">
                  {item.quantity}x {item.name}
                  {isBox ? ` (Caja x${item.cantidadPorCaja})` : ""}
                  {isPromo && <span className="text-xs text-orange-600 ml-1">Promo</span>}
                </span>
                <span className="font-medium text-gray-900 shrink-0 ml-2">
                  {formatPrice(lineTotal)}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between pt-2 border-t font-semibold">
            <span>Total</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
        </div>
      </div>
      </Stagger>

      {/* Notes */}
      <Stagger delay={240}>
      <div className="bg-white rounded-lg border shadow-sm p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Notas (opcional)</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Indicaciones especiales, horario de entrega, etc."
          className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        />
      </div>
      </Stagger>

      {/* Actions */}
      <Stagger delay={320}>
      <div className="space-y-3">
        {!meetsMinimum && items.length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            El subtotal de productos no promocionales debe ser al menos {formatPrice(cartConfig.minSubtotal)} para confirmar el pedido.
            Te faltan {formatPrice(cartConfig.minSubtotal - nonPromoTotal)}.
          </div>
        )}
        {meetsMinimum && !freeShipping && items.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg text-sm">
            Se agrega envio al pedido. Para envio gratis, el subtotal en productos no promocionales debe superar {formatPrice(cartConfig.shippingThreshold)}.
          </div>
        )}
        {clientInfo?.deliveryDay && (
          <button
            onClick={() => {
              setPendingAction("order");
              setShowDisclaimer(true);
            }}
            disabled={sending || !meetsMinimum}
            className={`w-full py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 ${springBtn}`}
          >
            {sending ? "Enviando..." : `Enviar pedido (entrega: ${clientInfo.deliveryDay})`}
          </button>
        )}

        <button
          onClick={() => {
            setPendingAction("whatsapp");
            setShowDisclaimer(true);
          }}
          className={`w-full py-3 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-2 ${springBtn}`}
        >
          <FaWhatsapp className="w-5 h-5" />
          Enviar por WhatsApp
        </button>

        {!clientInfo?.deliveryDay && (
          <p className="text-xs text-gray-400 text-center">
            Tu cuenta no tiene día de entrega asignado. Podés enviar tu pedido por WhatsApp.
          </p>
        )}
      </div>
      </Stagger>

      {/* Disclaimer modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-center mb-4">
              <img src="/logo.png" alt="Alma" className="h-20 object-contain" />
            </div>

            <div className="flex items-center gap-2 mb-4 justify-center">
              <HiExclamation className="w-5 h-5 text-amber-500 shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900">Condiciones del pedido</h3>
            </div>

            <div className="text-xs text-gray-600 space-y-2 mb-4 max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3">
              <p>Los precios son orientativos y podrán variar a criterio del Vendedor.</p>
              <p>En caso de existir alguna actualización y/o variación en los precios entre la fecha en que fue realizado el pedido por parte del Comprador y la fecha de entrega, se tomará como precio válido aquel correspondiente a la fecha de emisión de la factura.</p>
              <p>Los productos vendidos por peso se facturarán según su peso real y al precio por unidad de medida vigente al momento de la facturación.</p>
              <p>En el sitio web, los precios pueden visualizarse —a elección del Comprador— con o sin Impuesto al Valor Agregado (IVA), únicamente a modo orientativo.</p>
              <p>El importe puede cambiar sujeto a la variación del precio del producto y/o stock disponible.</p>
              <p>Los precios no contemplan percepciones a cuenta de impuestos nacionales ni provinciales.</p>
            </div>

            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
              <span className="text-sm text-gray-700">Acepto las condiciones del pedido</span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDisclaimer(false);
                  setAcceptedTerms(false);
                  setPendingAction(null);
                }}
                className={`flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 ${springBtn}`}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setShowDisclaimer(false);
                  setAcceptedTerms(false);
                  if (pendingAction === "whatsapp") {
                    handleWhatsApp();
                  } else if (pendingAction === "order") {
                    setSending(true);
                    try {
                      const res = await fetch("/api/orders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ items, notes: notes.trim() }),
                      });
                      if (res.ok) {
                        clearCart();
                        router.push("/pedido-enviado");
                      } else {
                        const data = await res.json();
                        alert(data.error || "Error al enviar el pedido");
                      }
                    } catch {
                      alert("Error al enviar el pedido");
                    } finally {
                      setSending(false);
                    }
                  }
                  setPendingAction(null);
                }}
                disabled={sending || !acceptedTerms}
                className={`flex-1 py-2.5 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 ${springBtn}`}
              >
                Aceptar y enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
