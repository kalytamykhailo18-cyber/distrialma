"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { formatPrice } from "@/lib/utils";

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
  const { items, totalPrice, clearCart } = useCart();
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [pendingAction, setPendingAction] = useState<"order" | "whatsapp" | null>(null);

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
        const unitPrice = isBox ? item.precioCajaCerrada : item.precioMayorista;
        const label = isBox
          ? `Caja x${item.cantidadPorCaja}`
          : item.unit === "KG" ? "KG" : "Un.";
        const lineTotal = isBox
          ? item.precioCajaCerrada * item.cantidadPorCaja * item.quantity
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
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (status === "unauthenticated" || items.length === 0) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link
        href="/carrito"
        className="text-sm text-brand-600 hover:underline mb-4 inline-block"
      >
        &larr; Volver al carrito
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finalizar pedido</h1>

      {/* Client info */}
      <div className="bg-white rounded-lg border p-4 mb-4">
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

      {/* Order summary */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Resumen del pedido ({items.length} producto{items.length !== 1 ? "s" : ""})
        </h2>
        <div className="space-y-2 text-sm">
          {items.map((item) => {
            const isBox = item.mode === "box" && item.precioCajaCerrada > 0;
            const lineTotal = isBox
              ? item.precioCajaCerrada * item.cantidadPorCaja * item.quantity
              : item.precioMayorista * item.quantity;
            return (
              <div key={item.sku} className="flex justify-between">
                <span className="text-gray-700">
                  {item.quantity}x {item.name}
                  {isBox ? ` (Caja x${item.cantidadPorCaja})` : ""}
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

      {/* Notes */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Notas (opcional)</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Indicaciones especiales, horario de entrega, etc."
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {clientInfo?.deliveryDay && (
          <button
            onClick={() => {
              setPendingAction("order");
              setShowDisclaimer(true);
            }}
            disabled={sending}
            className="w-full py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {sending ? "Enviando..." : `Enviar pedido (entrega: ${clientInfo.deliveryDay})`}
          </button>
        )}

        <button
          onClick={() => {
            setPendingAction("whatsapp");
            setShowDisclaimer(true);
          }}
          className="w-full py-3 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.386 0-4.592-.842-6.312-2.243l-.44-.36-3.2 1.072 1.072-3.2-.36-.44A9.958 9.958 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
          </svg>
          Enviar por WhatsApp
        </button>

        {!clientInfo?.deliveryDay && (
          <p className="text-xs text-gray-400 text-center">
            Tu cuenta no tiene día de entrega asignado. Podés enviar tu pedido por WhatsApp.
          </p>
        )}
      </div>

      {/* Disclaimer modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-center mb-4">
              <img src="/logo.png" alt="Alma" className="h-20 object-contain" />
            </div>

            <div className="flex items-center gap-2 mb-4 justify-center">
              <svg className="w-5 h-5 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900">Condiciones del pedido</h3>
            </div>

            <ol className="space-y-3 text-sm text-gray-700 mb-6">
              <li className="flex gap-2">
                <span className="font-semibold text-brand-600 shrink-0">1.</span>
                <span>Precios de productos pasibles sujeto a facturación final.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-brand-600 shrink-0">2.</span>
                <span>Precios en efectivo. Consulte costos por otros medios de pago.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-brand-600 shrink-0">3.</span>
                <span>Aplican condiciones de entrega y disponibilidad.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-brand-600 shrink-0">4.</span>
                <span>Sujeto a cierre de horario de pedidos.</span>
              </li>
            </ol>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDisclaimer(false);
                  setPendingAction(null);
                }}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setShowDisclaimer(false);
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
                disabled={sending}
                className="flex-1 py-2.5 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
              >
                Aceptar y enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
