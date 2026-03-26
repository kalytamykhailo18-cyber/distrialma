"use client";

import { useState, useEffect } from "react";

interface Brand {
  id: string;
  name: string;
}

export default function MarcasPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [featured, setFeatured] = useState<Set<string>>(new Set());
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [deletingLogo, setDeletingLogo] = useState<string | null>(null);
  const [togglingBrand, setTogglingBrand] = useState<string | null>(null);

  function loadData() {
    Promise.all([
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/admin/featured-brands").then((r) => r.json()),
      fetch("/api/admin/featured-brands?logos=1").then((r) => r.json().catch(() => ({ logos: {} }))),
    ])
      .then(([brandsData, featuredData, logosData]) => {
        setBrands(brandsData || []);
        setFeatured(new Set(featuredData.brandIds || []));
        setLogos(logosData.logos || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  async function toggleBrand(brandId: string) {
    setTogglingBrand(brandId);
    try {
      const isFeatured = featured.has(brandId);
      const res = await fetch("/api/admin/featured-brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, featured: !isFeatured }),
      });
      const data = await res.json();
      setFeatured(new Set(data.brandIds || []));
    } finally {
      setTogglingBrand(null);
    }
  }

  async function uploadLogo(brandId: string, file: File) {
    setUploading(brandId);
    const formData = new FormData();
    formData.append("image", file);
    formData.append("sku", `brand-${brandId}`);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      if (res.ok) {
        loadData();
      }
    } catch { /* */ }
    finally {
      setUploading(null);
    }
  }

  async function deleteLogo(brandId: string) {
    const logoUrl = logos[brandId];
    if (!logoUrl) return;
    setDeletingLogo(brandId);
    try {
      const res = await fetch("/api/admin/featured-brands", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (res.ok) {
        loadData();
      }
    } catch { /* */ }
    finally {
      setDeletingLogo(null);
    }
  }

  const filtered = filter.trim()
    ? brands.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    : brands;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Marcas en Landing</h1>

      <p className="text-sm text-gray-500 mb-4">
        Seleccioná las marcas que aparecen en la página principal. Marcadas: {featured.size} de {brands.length}
      </p>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar marcas..."
        className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-4"
      />

      {loading ? (
        <p className="text-gray-400">Cargando marcas...</p>
      ) : (
        <div className="bg-white rounded-lg border divide-y max-h-[60vh] overflow-y-auto">
          {filtered.map((brand) => (
            <div
              key={brand.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={featured.has(brand.id)}
                onChange={() => toggleBrand(brand.id)}
                disabled={togglingBrand === brand.id}
                className="w-4 h-4 rounded border-gray-300 text-brand-400 focus:ring-brand-400 shrink-0 disabled:opacity-50"
              />

              {/* Logo thumbnail */}
              {logos[brand.id] ? (
                <div className="relative w-10 h-10 shrink-0 group">
                  <img
                    src={logos[brand.id]}
                    alt={brand.name}
                    className="w-10 h-10 object-contain rounded border"
                  />
                  <button
                    onClick={() => deleteLogo(brand.id)}
                    disabled={deletingLogo === brand.id}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-xs rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="w-10 h-10 shrink-0 bg-gray-100 rounded border flex items-center justify-center">
                  <span className="text-gray-300 text-xs">—</span>
                </div>
              )}

              <span className="text-sm text-gray-800 flex-1">{brand.name}</span>

              {/* Upload button */}
              <label
                className={`text-xs px-2 py-1 rounded border cursor-pointer shrink-0 ${
                  uploading === brand.id
                    ? "bg-gray-100 text-gray-400"
                    : "bg-white text-brand-600 border-brand-400 hover:bg-brand-50"
                }`}
              >
                {uploading === brand.id ? "..." : logos[brand.id] ? "Cambiar" : "Subir logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading === brand.id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(brand.id, file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  );
}
