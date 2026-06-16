"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import WhatsAppButton from "./WhatsAppButton";

const KIOSK_ROUTES = ["/consulta-precios", "/pos"];
const HIDE_WA_ROUTES = ["/consulta-precios", "/pos", "/admin"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isKioskParam, setIsKioskParam] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsKioskParam(params.get("kiosk") === "1");
    }
  }, [pathname]);

  const isKioskRoute = KIOSK_ROUTES.some((r) => pathname.startsWith(r));
  const isKiosk = isKioskRoute || isKioskParam;
  const hideWA = HIDE_WA_ROUTES.some((r) => pathname.startsWith(r)) || isKiosk;

  return (
    <>
      {!isKiosk && <Navbar />}
      <main>{children}</main>
      {!hideWA && <WhatsAppButton />}
    </>
  );
}
