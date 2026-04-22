"use client";

import { formatPrice } from "@/lib/utils";
import {
  HiOutlineCash, HiOutlineCreditCard, HiOutlineQrcode,
  HiOutlineLibrary, HiOutlineClipboardList, HiOutlineBookOpen,
} from "react-icons/hi";
import { Cliente } from "../types";

interface PayLine { method: string; amount: number; }

interface Props {
  total: number;
  payMethod: string;
  setPayMethod: (m: string) => void;
  payAmount: string;
  setPayAmount: (a: string) => void;
  payLines: PayLine[];
  setPayLines: (fn: (prev: PayLine[]) => PayLine[]) => void;
  payError: string;
  setPayError: (e: string) => void;
  payConfirm: boolean;
  setPayConfirm: (b: boolean) => void;
  paying: boolean;
  paySuccess: string;
  selectedCliente: Cliente | null;
  onConfirm: () => void;
  onClose: () => void;
}

const METHODS = [
  { key: "efectivo", label: "Efectivo", Icon: HiOutlineCash, color: "bg-green-100 text-green-700", active: "bg-green-600" },
  { key: "debito", label: "Debito", Icon: HiOutlineCreditCard, color: "bg-blue-100 text-blue-700", active: "bg-blue-600" },
  { key: "credito", label: "Credito", Icon: HiOutlineCreditCard, color: "bg-purple-100 text-purple-700", active: "bg-purple-600" },
  { key: "cuotas", label: "Cuotas", Icon: HiOutlineClipboardList, color: "bg-indigo-100 text-indigo-700", active: "bg-indigo-600" },
  { key: "qr", label: "QR", Icon: HiOutlineQrcode, color: "bg-cyan-100 text-cyan-700", active: "bg-cyan-600" },
  { key: "transferencia", label: "Transfer.", Icon: HiOutlineLibrary, color: "bg-amber-100 text-amber-700", active: "bg-amber-600" },
  { key: "cuenta", label: "Cta. Cte.", Icon: HiOutlineBookOpen, color: "bg-red-100 text-red-700", active: "bg-red-600" },
];

const METHOD_LABELS: Record<string, string> = { efectivo: "Efectivo", debito: "Debito", credito: "Credito", cuotas: "Cuotas", qr: "QR", transferencia: "Transfer.", cuenta: "Cta. Cte." };

export default function PosPayment({
  total, payMethod, setPayMethod, payAmount, setPayAmount, payLines, setPayLines,
  payError, setPayError, payConfirm, setPayConfirm, paying, paySuccess,
  selectedCliente, onConfirm, onClose,
}: Props) {
  const paid = payLines.reduce((s, l) => s + l.amount, 0);
  const rem = total - paid;

  function addLine() {
    const amt = parseFloat(payAmount) || rem;
    if (amt > 0 && payMethod) {
      setPayLines((prev) => [...prev, { method: payMethod, amount: amt }]);
      setPayMethod("");
      setPayAmount("");
      setPayConfirm(false);
    }
  }

  // Vuelto
  const cashPaid = payLines.filter((l) => l.method === "efectivo").reduce((s, l) => s + l.amount, 0);
  const nonCash = paid - cashPaid;
  const vuelto = Math.max(0, cashPaid - (total - nonCash));

  if (paySuccess) {
    return (
      <div className="p-8 text-center" style={{ animation: "fadeIn 300ms ease" }}>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Venta registrada</h2>
        <p className="text-gray-600">{paySuccess}</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-5 border-b flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Cobrar</h2>
        <button onClick={onClose} disabled={paying} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
      </div>

      <div className="p-5">
        {/* Total + Remaining */}
        <div className="text-center mb-4">
          <div className="text-sm text-gray-500">Total a cobrar</div>
          <div className="text-3xl font-bold text-gray-900">{formatPrice(total)}</div>
          {paid > 0 && (
            <div className={`text-lg font-bold mt-1 ${rem <= 0.01 ? "text-green-600" : "text-red-500"}`}>
              {rem <= 0.01 ? "Completo" : `Restante: ${formatPrice(rem)}`}
            </div>
          )}
        </div>

        {/* Payment lines */}
        {payLines.length > 0 && (
          <div className="mb-4 space-y-1">
            {payLines.map((line, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-gray-700">{METHOD_LABELS[line.method] || line.method}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">{formatPrice(line.amount)}</span>
                  <button onClick={() => { setPayLines((prev) => prev.filter((_, j) => j !== i)); setPayConfirm(false); }}
                    className="text-red-400 hover:text-red-600 text-xs">x</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Methods */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
          {METHODS.map((m) => (
            <button key={m.key} onClick={() => { setPayMethod(m.key); setPayAmount(""); setPayError(""); setPayConfirm(false); }}
              className={`p-2 rounded-xl text-center transition-all duration-200 ${
                payMethod === m.key ? `${m.active} text-white shadow-md scale-105` : `${m.color} hover:opacity-80`
              }`}>
              <m.Icon className="w-5 h-5 mx-auto mb-0.5" />
              <div className="text-xs font-medium">{m.label}</div>
            </button>
          ))}
        </div>

        {/* Amount input */}
        {payMethod && (
          <div className="mb-4" style={{ animation: "fadeIn 200ms ease" }}>
            {payMethod === "cuenta" && !selectedCliente ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">Se requiere seleccionar un cliente</div>
            ) : (
              <div className="flex gap-2">
                <input type="text" inputMode="decimal" value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }}
                  placeholder={formatPrice(Math.max(0, rem))}
                  className="flex-1 text-xl font-bold text-center border-2 border-gray-300 rounded-xl py-2 focus:outline-none focus:border-brand-500"
                  autoFocus />
                <button onClick={addLine} className="px-4 py-2 bg-brand-500 text-white rounded-xl font-bold hover:bg-brand-600 shrink-0">
                  Agregar
                </button>
              </div>
            )}
          </div>
        )}

        {/* Vuelto */}
        {vuelto > 0.01 && <div className="mb-4 text-center text-green-600 font-bold text-lg">Vuelto: {formatPrice(vuelto)}</div>}

        {/* Error */}
        {payError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">{payError}</div>}
      </div>

      {/* Confirm */}
      <div className="p-5 border-t bg-gray-50">
        <button onClick={() => { if (payConfirm) { onConfirm(); } else { setPayConfirm(true); } }}
          disabled={paying || payLines.length === 0 || rem > 0.01}
          className={`w-full py-3 text-white rounded-xl text-lg font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            payConfirm ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"
          }`}>
          {paying ? "Procesando..." : payConfirm ? "CONFIRMAR — Registrar venta" : `Confirmar pago (${payLines.length} medio${payLines.length !== 1 ? "s" : ""})`}
        </button>
      </div>
    </>
  );
}
