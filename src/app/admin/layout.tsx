"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (
      !session?.user ||
      (session.user as { role?: string }).role !== "admin"
    ) {
      router.push("/login");
    }
  }, [session, status, router]);

  if (
    status === "loading" ||
    !session?.user ||
    (session.user as { role?: string }).role !== "admin"
  ) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">
        Cargando...
      </div>
    );
  }

  return <>{children}</>;
}
