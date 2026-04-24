"use client";

import { useEffect, useState } from "react";

export default function BotQRPage() {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("cargando...");

  useEffect(() => {
    function poll() {
      fetch("/api/admin/bot-status")
        .then((r) => r.json())
        .then((d) => {
          setStatus(d.status || "desconocido");
          setQrUrl(d.qrUrl || null);
        })
        .catch(() => setStatus("error"));
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-10 text-center">
      <h1 className="text-xl font-bold mb-4">Bot WhatsApp</h1>
      <p className="text-sm text-gray-500 mb-6">Estado: {status}</p>
      {status === "conectado" ? (
        <div className="bg-green-50 border border-green-300 rounded-xl p-6">
          <p className="text-green-700 font-bold text-lg">Bot conectado</p>
        </div>
      ) : qrUrl ? (
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-600 mb-3">Escanea este QR desde WhatsApp &gt; Dispositivos vinculados</p>
          <img src={qrUrl} alt="QR" className="mx-auto w-64 h-64" />
          <p className="text-xs text-gray-400 mt-2">Se actualiza automaticamente</p>
        </div>
      ) : (
        <p className="text-gray-400">Esperando QR...</p>
      )}
    </div>
  );
}
