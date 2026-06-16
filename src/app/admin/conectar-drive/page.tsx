"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageTransition, Stagger, springBtn, LoadingCenter } from "@/components/AnimateIn";

interface Status {
  connected: boolean;
  email: string | null;
  configured: boolean;
}

export default function ConectarDrivePage() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const callbackStatus = sp?.get("status");
  const callbackEmail = sp?.get("email");
  const callbackMsg = sp?.get("msg");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/conectar-drive");
      const j = await r.json();
      setStatus(j);
    } catch {
      setError("Error al cargar el estado de Drive");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function connect() {
    setWorking(true);
    setError("");
    try {
      const r = await fetch("/api/admin/conectar-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const j = await r.json();
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      throw new Error(j.error || "Error iniciando conexion");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    if (!confirm("Desconectar Drive? Los recibos nuevos no se subiran al Drive hasta que conectes de nuevo.")) return;
    setWorking(true);
    setError("");
    try {
      await fetch("/api/admin/conectar-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setWorking(false);
    }
  }

  return (
    <PageTransition className="max-w-2xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Conectar Google Drive</h1>
        <p className="text-sm text-gray-500 mb-6">
          Vinculamos tu Google Drive para que los recibos de pago a proveedores se guarden automaticamente en la carpeta que elegiste, organizados por proveedor y mes.
        </p>
      </Stagger>

      {callbackStatus === "ok" && callbackEmail && (
        <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
          ✓ Drive conectado correctamente como <span className="font-medium">{callbackEmail}</span>.
        </div>
      )}
      {callbackStatus === "error" && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          ✗ La conexion fallo: {callbackMsg || "error desconocido"}
        </div>
      )}

      {loading ? (
        <LoadingCenter />
      ) : !status?.configured ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800 font-medium mb-1">Falta configuracion del lado del servidor.</p>
          <p className="text-xs text-amber-700">
            Las variables <code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>GOOGLE_OAUTH_CLIENT_SECRET</code> y <code>GOOGLE_OAUTH_REDIRECT_URI</code> no estan seteadas en el .env.
          </p>
        </div>
      ) : status.connected ? (
        <Stagger delay={50}>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Estado: <span className="text-green-700">Conectado</span></p>
                {status.email && <p className="text-xs text-gray-500 mt-1">Cuenta: {status.email}</p>}
              </div>
              <button
                onClick={disconnect}
                disabled={working}
                className={`px-4 py-2 text-sm text-red-700 border border-red-200 bg-red-50 rounded-xl hover:bg-red-100 disabled:opacity-50 ${springBtn}`}
              >
                {working ? "Desconectando..." : "Desconectar"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              A partir de ahora, cada recibo de pago que generes se sube a tu Drive en la subcarpeta {`{Proveedor}/{YYYY-MM}/`} sin que tengas que hacer nada.
            </p>
          </div>
        </Stagger>
      ) : (
        <Stagger delay={50}>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-700 mb-3">Estado: <span className="text-gray-500">No conectado</span></p>
            <button
              onClick={connect}
              disabled={working}
              className={`px-4 py-2 text-sm text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-50 ${springBtn}`}
            >
              {working ? "Abriendo..." : "Conectar mi Drive"}
            </button>
            <p className="text-xs text-gray-500 mt-3">
              Vas a ir a una pagina de Google donde aceptas que la app suba archivos a tu carpeta de Drive. Una sola vez, despues queda andando solo.
            </p>
          </div>
        </Stagger>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </PageTransition>
  );
}
