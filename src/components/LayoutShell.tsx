"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import WhatsAppButton from "./WhatsAppButton";

const KIOSK_ROUTES = ["/consulta-precios", "/pos"];
const HIDE_WA_ROUTES = ["/consulta-precios", "/pos", "/admin"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isKiosk = KIOSK_ROUTES.some((r) => pathname.startsWith(r));
  const hideWA = HIDE_WA_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <>
      {!isKiosk && <Navbar />}
      <main>{children}</main>
      {!hideWA && <WhatsAppButton />}
    </>
  );
}
