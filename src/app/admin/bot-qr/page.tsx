"use client";

import { useEffect, useState } from "react";

export default function BotQRPage() {
  const [milyQr, setMilyQr] = useState<string | null>(null);
  const [milyStatus, setMilyStatus] = useState("cargando...");
  const [skynetQr, setSkynetQr] = useState<string | null>(null);
  const [skynetStatus, setSkynetStatus] = useState("cargando...");

  useEffect(() => {
    function poll() {
      fetch("/api/admin/bot-status?bot=mily")
        .then((r) => r.json())
        .then((d) => { setMilyStatus(d.status || "desconocido"); setMilyQr(d.qrUrl || null); })
        .catch(() => setMilyStatus("error"));
      fetch("/api/admin/bot-status?bot=skynet")
        .then((r) => r.json())
        .then((d) => { setSkynetStatus(d.status || "desconocido"); setSkynetQr(d.qrUrl || null); })
        .catch(() => setSkynetStatus("offline"));
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  function BotCard({ name, status, qrUrl }: { name: string; status: string; qrUrl: string | null }) {
    return (
      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{name}</h2>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            status === "conectado" ? "bg-green-100 text-green-700" :
            status === "esperando_qr" ? "bg-amber-100 text-amber-700" :
            status === "bot_offline" || status === "offline" ? "bg-red-100 text-red-700" :
            "bg-gray-100 text-gray-600"
          }`}>{status}</span>
        </div>
        {status === "conectado" ? (
          <p className="text-green-600 text-sm">Conectado y funcionando</p>
        ) : qrUrl ? (
          <div>
            <p className="text-sm text-gray-600 mb-2">Escanea este QR desde WhatsApp &gt; Dispositivos vinculados</p>
            <img src={qrUrl} alt="QR" className="mx-auto w-48 h-48" />
            <p className="text-xs text-gray-400 mt-1 text-center">Se actualiza automaticamente</p>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">{status === "bot_offline" || status === "offline" ? "Bot no iniciado" : "Esperando..."}</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Bots WhatsApp</h1>
      <BotCard name="Mily (Clientes)" status={milyStatus} qrUrl={milyQr} />
      <BotCard name="Skynet (Interno)" status={skynetStatus} qrUrl={skynetQr} />
    </div>
  );
}
