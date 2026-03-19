"use client";

import { SessionProvider } from "next-auth/react";
import CategoriesProvider from "./CategoriesProvider";
import { CartProvider } from "./CartProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CategoriesProvider>
        <CartProvider>{children}</CartProvider>
      </CategoriesProvider>
    </SessionProvider>
  );
}
