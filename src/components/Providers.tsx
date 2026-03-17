"use client";

import { SessionProvider } from "next-auth/react";
import CategoriesProvider from "./CategoriesProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CategoriesProvider>{children}</CategoriesProvider>
    </SessionProvider>
  );
}
