"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HiEye, HiEyeOff } from "react-icons/hi";
import { PageTransition, Stagger, springBtn } from "@/components/AnimateIn";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Usuario o contraseña incorrectos");
    } else {
      // Redirect based on role/permissions
      try {
        const sess = await fetch("/api/auth/session").then((r) => r.json());
        const perms: string[] = sess?.user?.permissions || [];
        const role = sess?.user?.role;
        if (role === "staff" || role === "admin") {
          if (perms.length === 1 && perms[0] === "vendedor") {
            router.push("/admin/vendedor");
          } else {
            router.push("/admin");
          }
          router.refresh();
          return;
        }
      } catch {}
      router.push("/productos");
      router.refresh();
    }
  }

  return (
    <PageTransition className="max-w-md mx-auto px-4 py-16">
      <Stagger delay={0} y={-8}>
        <div className="bg-white rounded-xl border shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Iniciar Sesión
          </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-brand-400 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 pr-10 border border-brand-400 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <Stagger delay={100}>
            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-brand-400 text-white py-2 rounded-xl font-medium hover:bg-brand-500 shadow-sm disabled:opacity-50 ${springBtn}`}
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </Stagger>
        </form>
        </div>
      </Stagger>
    </PageTransition>
  );
}
