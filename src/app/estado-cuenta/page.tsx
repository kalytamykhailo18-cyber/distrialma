"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface Transaction {
  type: string;
  date: string;
  time: string;
  boleta: string;
  total: number;
  amount: number;
  deuda: number;
  efectivo: number;
  tarjeta: number;
  isPago: boolean;
  isDeuda: boolean;
}

interface BalanceData {
  nombre: string;
  saldo: number;
  monthlyTotal: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  transactions: Transaction[];
}

export default function EstadoCuentaPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/estado-cuenta");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/client/balance")
        .then((r) => r.json())
        .then((d) => setData(d.error ? null : d))
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    }
  }, [status]);

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">No se pudo cargar el estado de cuenta.</p>
        <Link href="/productos" className="text-brand-600 hover:underline">
          Volver a productos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Estado de Cuenta</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`rounded-xl p-4 ${data.saldo > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
          <p className="text-xs text-gray-500 mb-1">Saldo actual</p>
          <p className={`text-2xl font-bold ${data.saldo > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatPrice(data.saldo)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {data.saldo > 0 ? "Deuda pendiente" : data.saldo === 0 ? "Sin deuda" : "A favor"}
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border">
          <p className="text-xs text-gray-500 mb-1">Compras del mes</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatPrice(data.monthlyTotal)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border">
          <p className="text-xs text-gray-500 mb-1">Último pago</p>
          {data.lastPaymentDate ? (
            <>
              <p className="text-2xl font-bold text-green-600">
                {formatPrice(data.lastPaymentAmount)}
              </p>
              <p className="text-xs text-gray-400 mt-1">{data.lastPaymentDate}</p>
            </>
          ) : (
            <p className="text-lg text-gray-400">Sin pagos</p>
          )}
        </div>
      </div>

      {/* Transactions */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Movimientos recientes</h2>

      {data.transactions.length === 0 ? (
        <p className="text-gray-400 text-sm">No hay movimientos registrados.</p>
      ) : (
        <div className="space-y-2">
          {data.transactions.map((t, i) => (
            <div
              key={i}
              className={`bg-white rounded-lg border p-3 flex items-center justify-between ${
                t.isPago ? "border-l-4 border-l-green-500" : t.isDeuda ? "border-l-4 border-l-red-400" : ""
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    t.isPago
                      ? "bg-green-100 text-green-700"
                      : t.isDeuda
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {t.type}
                  </span>
                  {t.boleta && (
                    <span className="text-xs text-gray-400">#{t.boleta}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {t.date} {t.time}
                  {t.efectivo > 0 && !t.isPago && <span className="ml-2">Efectivo: {formatPrice(t.efectivo)}</span>}
                  {t.tarjeta > 0 && <span className="ml-2">Tarjeta: {formatPrice(t.tarjeta)}</span>}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-bold text-lg ${
                  t.isPago ? "text-green-600" : t.isDeuda ? "text-red-600" : "text-gray-900"
                }`}>
                  {t.isPago ? "+ " : t.isDeuda ? "- " : ""}{formatPrice(t.amount)}
                </p>
                {t.isDeuda && (
                  <p className="text-xs text-red-400">Debe</p>
                )}
                {t.isPago && (
                  <p className="text-xs text-green-400">Pagado</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
