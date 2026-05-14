import Link from "next/link";

export const metadata = { title: "Política de Privacidad — Distrialma" };

export default function PrivacidadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Política de Privacidad</h1>
      <div className="prose prose-sm text-gray-700 space-y-4">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <h2 className="text-lg font-semibold text-gray-800">1. Información que recopilamos</h2>
        <p>Recopilamos información personal que usted nos proporciona al registrarse, realizar pedidos o contactarnos: nombre, dirección, teléfono, CUIT/CUIL, correo electrónico.</p>

        <h2 className="text-lg font-semibold text-gray-800">2. Uso de la información</h2>
        <p>Utilizamos su información para:</p>
        <ul className="list-disc pl-6">
          <li>Procesar y entregar sus pedidos</li>
          <li>Gestionar su cuenta y saldo</li>
          <li>Enviar notificaciones sobre pedidos y entregas</li>
          <li>Mejorar nuestros servicios y atención al cliente</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-800">3. Protección de datos</h2>
        <p>Implementamos medidas de seguridad para proteger su información personal. No vendemos ni compartimos sus datos con terceros salvo cuando sea necesario para la prestación del servicio (ej: servicio de entrega).</p>

        <h2 className="text-lg font-semibold text-gray-800">4. WhatsApp y comunicaciones</h2>
        <p>Al comunicarse con nosotros por WhatsApp, sus mensajes pueden ser procesados por nuestro asistente virtual para brindarle una mejor atención. La información compartida se utiliza exclusivamente para gestionar su consulta.</p>

        <h2 className="text-lg font-semibold text-gray-800">5. Cookies</h2>
        <p>Utilizamos cookies para mantener su sesión activa y mejorar la experiencia de navegación.</p>

        <h2 className="text-lg font-semibold text-gray-800">6. Derechos del usuario</h2>
        <p>Usted puede solicitar la modificación o eliminación de sus datos personales contactándonos por WhatsApp o correo electrónico.</p>

        <h2 className="text-lg font-semibold text-gray-800">7. Contacto</h2>
        <p>Distrialma<br />Merlo, Buenos Aires</p>
      </div>
      <div className="mt-8">
        <Link href="/" className="text-brand-500 hover:underline text-sm">← Volver al inicio</Link>
      </div>
    </div>
  );
}
