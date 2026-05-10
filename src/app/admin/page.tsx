"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { HiOutlineShoppingCart, HiOutlineCash, HiOutlineExclamation, HiOutlineChat, HiOutlineTruck, HiOutlineStatusOnline, HiOutlineCube, HiOutlineTag, HiOutlineDocumentDownload, HiOutlineCreditCard, HiOutlineChartBar, HiOutlineUserGroup, HiOutlinePrinter, HiOutlineSpeakerphone } from "react-icons/hi";
import { PageTransition, Stagger, springBtn, LoadingCenter } from "@/components/AnimateIn";

interface Resumen {
  ventas: { tickets: number; total: number; efectivo: number; tarjeta: number };
  pedidosWeb: number;
  stockCritico: number;
  whatsappSinLeer: number;
  reparto: { entregados: number; pendientes: number };
  botConectado: boolean;
  fecha: string;
  hora: string;
}

export default function AdminLandingPage() {
  const [data, setData] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/resumen-diario")
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCenter text="Cargando..." />;
  if (!data) return <div className="p-8 text-center text-gray-400">Error al cargar resumen</div>;

  const cards = [
    {
      label: "Ventas hoy",
      value: formatPrice(data.ventas.total),
      sub: `${data.ventas.tickets} tickets`,
      icon: HiOutlineCash,
      color: "bg-green-50 border-green-200 text-green-700",
      iconColor: "text-green-500",
      href: "/admin/dashboard",
    },
    {
      label: "Pedidos web",
      value: String(data.pedidosWeb),
      sub: "pendientes",
      icon: HiOutlineShoppingCart,
      color: data.pedidosWeb > 0 ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-gray-50 border-gray-200 text-gray-700",
      iconColor: "text-brand-500",
      href: "/admin/pedidos",
    },
    {
      label: "Stock critico",
      value: String(data.stockCritico),
      sub: "productos < 3 dias",
      icon: HiOutlineExclamation,
      color: data.stockCritico > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-700",
      iconColor: data.stockCritico > 0 ? "text-red-500" : "text-gray-400",
      href: "/admin/alertas-stock",
    },
    {
      label: "WhatsApp",
      value: String(data.whatsappSinLeer),
      sub: "sin leer",
      icon: HiOutlineChat,
      color: data.whatsappSinLeer > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-700",
      iconColor: data.whatsappSinLeer > 0 ? "text-blue-500" : "text-gray-400",
      href: "/admin/inbox",
    },
    {
      label: "Reparto",
      value: String(data.reparto.entregados),
      sub: `entregados${data.reparto.pendientes > 0 ? ` / ${data.reparto.pendientes} pendientes` : ""}`,
      icon: HiOutlineTruck,
      color: "bg-purple-50 border-purple-200 text-purple-700",
      iconColor: "text-purple-500",
      href: "/admin/reparto",
    },
    {
      label: "Bot Mily",
      value: data.botConectado ? "Online" : "Offline",
      sub: data.botConectado ? "funcionando" : "desconectado",
      icon: HiOutlineStatusOnline,
      color: data.botConectado ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700",
      iconColor: data.botConectado ? "text-green-500" : "text-red-500",
      href: "/admin/bot-qr",
    },
  ];

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Panel de Control</h1>
        <p className="text-sm text-gray-400 mb-6">{data.fecha} — {data.hora}</p>
      </Stagger>

      <Stagger delay={50}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.label} href={card.href}
                className={`border rounded-xl p-4 ${card.color} ${springBtn} hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium opacity-70">{card.label}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                    <p className="text-xs opacity-60 mt-0.5">{card.sub}</p>
                  </div>
                  <Icon className={`w-6 h-6 ${card.iconColor} opacity-50`} />
                </div>
              </Link>
            );
          })}
        </div>
      </Stagger>

      {/* Quick links */}
      <Stagger delay={100}>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Acceso rapido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { href: "/admin/productos", label: "Productos", icon: HiOutlineCube, color: "text-blue-500" },
            { href: "/admin/precios", label: "Precios", icon: HiOutlineTag, color: "text-green-500" },
            { href: "/admin/compras", label: "Ingresos", icon: HiOutlineDocumentDownload, color: "text-purple-500" },
            { href: "/admin/cierre-caja", label: "Cierre de Caja", icon: HiOutlineCreditCard, color: "text-orange-500" },
            { href: "/admin/resumen-productos", label: "Resumen Ventas", icon: HiOutlineChartBar, color: "text-blue-600" },
            { href: "/admin/clientes", label: "Clientes", icon: HiOutlineUserGroup, color: "text-teal-500" },
            { href: "/admin/etiquetas", label: "Etiquetas", icon: HiOutlinePrinter, color: "text-gray-500" },
            { href: "/admin/difusion", label: "Difusion", icon: HiOutlineSpeakerphone, color: "text-red-500" },
          ].map((link) => {
            const Icon = link.icon;
            return (
            <Link key={link.href} href={link.href}
              className={`px-3 py-3 bg-white border rounded-xl text-sm text-center text-gray-700 font-medium hover:bg-gray-50 hover:shadow-sm transition-all flex flex-col items-center gap-1.5 ${springBtn}`}>
              <Icon className={`w-5 h-5 ${link.color}`} />
              {link.label}
            </Link>
            );
          })}
        </div>
      </Stagger>
    </PageTransition>
  );
}
