import Link from "next/link";

export default function PedidoEnviadoPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pedido enviado</h1>
      <p className="text-gray-500 mb-6">
        Tu pedido fue recibido correctamente. Te contactaremos para confirmar la entrega.
      </p>
      <Link
        href="/productos"
        className="inline-block bg-brand-400 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-500"
      >
        Seguir comprando
      </Link>
    </div>
  );
}
