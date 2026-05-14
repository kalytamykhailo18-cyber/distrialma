import Link from "next/link";

export const metadata = { title: "Términos y Condiciones — Distrialma" };

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Términos y Condiciones</h1>
      <div className="prose prose-sm text-gray-700 space-y-4">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <h2 className="text-lg font-semibold text-gray-800">1. Generalidades</h2>
        <p>El uso del sitio web distrialma.com.ar y sus servicios implica la aceptación de estos términos y condiciones.</p>

        <h2 className="text-lg font-semibold text-gray-800">2. Registro y cuenta</h2>
        <p>Para realizar pedidos es necesario registrarse con datos verídicos. El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.</p>

        <h2 className="text-lg font-semibold text-gray-800">3. Productos y precios</h2>
        <p>Los precios publicados incluyen IVA y están sujetos a cambio sin previo aviso. Las imágenes son ilustrativas. El stock está sujeto a disponibilidad.</p>

        <h2 className="text-lg font-semibold text-gray-800">4. Pedidos y entregas</h2>
        <p>Los pedidos realizados a través de la web o WhatsApp quedan sujetos a confirmación. Los plazos de entrega son estimativos y pueden variar según la zona.</p>

        <h2 className="text-lg font-semibold text-gray-800">5. Cuenta corriente</h2>
        <p>Los clientes con cuenta corriente habilitada se comprometen a respetar los plazos de pago acordados. Distrialma se reserva el derecho de suspender la cuenta corriente ante incumplimientos.</p>

        <h2 className="text-lg font-semibold text-gray-800">6. Devoluciones</h2>
        <p>Las devoluciones se aceptan dentro de las 24 horas posteriores a la entrega para productos en mal estado o que no correspondan al pedido.</p>

        <h2 className="text-lg font-semibold text-gray-800">7. Propiedad intelectual</h2>
        <p>Todo el contenido del sitio (imágenes, textos, diseño) es propiedad de Distrialma y no puede ser reproducido sin autorización.</p>

        <h2 className="text-lg font-semibold text-gray-800">8. Jurisdicción</h2>
        <p>Para cualquier controversia que se suscite, las partes se someten a los Tribunales Ordinarios de Morón, Provincia de Buenos Aires.</p>

        <h2 className="text-lg font-semibold text-gray-800">9. Contacto</h2>
        <p>Distrialma<br />Merlo, Buenos Aires</p>
      </div>
      <div className="mt-8">
        <Link href="/" className="text-brand-500 hover:underline text-sm">← Volver al inicio</Link>
      </div>
    </div>
  );
}
