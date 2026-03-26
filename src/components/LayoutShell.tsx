"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import WhatsAppButton from "./WhatsAppButton";

const KIOSK_ROUTES = ["/consulta-precios"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isKiosk = KIOSK_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <>
      {!isKiosk && <Navbar />}
      <main>{children}</main>
      {!isKiosk && <WhatsAppButton />}
    </>
  );
}
