"use client";

import Link from "next/link";
import { HiCheck } from "react-icons/hi";
import { PageTransition, Stagger, springBtn } from "@/components/AnimateIn";

export default function PedidoEnviadoPage() {
  return (
    <PageTransition className="max-w-md mx-auto px-4 py-16 text-center">
      <Stagger delay={0} y={-8}>
        <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
          <HiCheck className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pedido enviado</h1>
      </Stagger>
      <Stagger delay={100}>
        <p className="text-gray-500 mb-6">
          Tu pedido fue recibido correctamente. Te contactaremos para confirmar la entrega.
        </p>
      </Stagger>
      <Stagger delay={200}>
        <Link
          href="/productos"
          className={`inline-block bg-brand-400 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-500 ${springBtn}`}
        >
          Seguir comprando
        </Link>
      </Stagger>
    </PageTransition>
  );
}
