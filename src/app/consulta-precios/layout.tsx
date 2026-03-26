import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consulta de Precios — Distrialma",
  description: "Consulte el precio de cualquier producto",
  manifest: "/manifest-consulta.json",
};

export default function ConsultaPreciosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 overflow-auto">
      {children}
    </div>
  );
}
