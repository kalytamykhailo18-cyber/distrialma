"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Product } from "@/types";

export default function AdminProductEditPage() {
  const { sku } = useParams<{ sku: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/products/${sku}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setProduct(data);
          setDescription(data.description || "");
        }
      });
  }, [sku]);

  async function handleSaveDescription() {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/description", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku, description }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage("Descripción guardada");
    } else {
      setMessage("Error al guardar");
    }
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.append("image", file);
    formData.append("sku", sku);

    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    setUploading(false);
    if (res.ok) {
      setMessage("Imagen subida");
      // Reload product to get updated images
      const data = await fetch(`/api/products/${sku}`).then((r) => r.json());
      setProduct(data);
    } else {
      setMessage("Error al subir imagen");
    }
    e.target.value = "";
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-gray-500">
        Cargando...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{product.name}</h1>
      <p className="text-sm text-gray-500 mb-6">SKU: {sku}</p>

      {message && (
        <div className="bg-brand-50 text-brand-600 px-4 py-2 rounded-lg text-sm mb-4">
          {message}
        </div>
      )}

      {/* Images */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Imágenes</h2>

        <div className="flex gap-3 flex-wrap mb-4">
          {product.images.map((img) => (
            <div
              key={img.id}
              className="w-24 h-24 border rounded overflow-hidden"
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {product.images.length === 0 && (
            <p className="text-sm text-gray-400">Sin imágenes</p>
          )}
        </div>

        <label className={`inline-block bg-brand-400 text-white px-4 py-2 rounded-lg text-sm ${uploading || saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-brand-500"}`}>
          {uploading ? "Subiendo..." : "Subir Imagen"}
          <input
            type="file"
            accept="image/*"
            onChange={handleUploadImage}
            className="hidden"
            disabled={uploading || saving}
          />
        </label>
      </div>

      {/* Description */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Descripción</h2>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          disabled={saving || uploading}
          className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
          placeholder="Escribir descripción del producto..."
        />
        <button
          onClick={handleSaveDescription}
          disabled={saving || uploading}
          className="mt-3 bg-brand-400 text-white px-6 py-2 rounded-lg text-sm hover:bg-brand-500 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar Descripción"}
        </button>
      </div>
    </div>
  );
}
