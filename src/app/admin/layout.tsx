"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { PAGE_PERMISSION_MAP, hasPermission, isStaffUser } from "@/lib/permissions";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const role = user?.role;
  const permissions = user?.permissions;
  const isStaff = isStaffUser(role);

  // Find the required permission for this page (longer paths match first)
  const requiredPerm = PAGE_PERMISSION_MAP[pathname] ||
    Object.entries(PAGE_PERMISSION_MAP)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname.startsWith(path + "/"))?.[1];

  const allowed = isStaff && (!requiredPerm || hasPermission(role, permissions, requiredPerm));

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || !isStaff) {
      router.push("/login");
      return;
    }
    if (!allowed) {
      // Redirect to first page they have access to
      const firstPerm = permissions?.[0];
      if (firstPerm) {
        const entry = Object.entries(PAGE_PERMISSION_MAP).find(([, p]) => p === firstPerm);
        if (entry) {
          router.push(entry[0]);
          return;
        }
      }
      router.push("/");
    }
  }, [session, status, router, allowed, isStaff, permissions]);

  if (status === "loading" || !session?.user || !allowed) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">
        Cargando...
      </div>
    );
  }

  return <>{children}</>;
}
