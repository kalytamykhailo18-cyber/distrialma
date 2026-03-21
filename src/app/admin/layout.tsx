"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin";
  const isEtiquetas = role === "etiquetas";
  const onEtiquetasPage = pathname === "/admin/etiquetas";

  const allowed = isAdmin || (isEtiquetas && onEtiquetasPage);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || !allowed) {
      if (isEtiquetas && !onEtiquetasPage) {
        router.push("/admin/etiquetas");
      } else {
        router.push("/login");
      }
    }
  }, [session, status, router, allowed, isEtiquetas, onEtiquetasPage]);

  if (status === "loading" || !session?.user || !allowed) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">
        Cargando...
      </div>
    );
  }

  return <>{children}</>;
}
