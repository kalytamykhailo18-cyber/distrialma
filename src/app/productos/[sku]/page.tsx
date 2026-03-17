"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { data: session } = useSession();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);

  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";

  // Admin edit state
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/products/${sku}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setProduct(null);
        else {
          setProduct(data);
          setDescription(data.description || "");
        }
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [sku]);

  async function handleSaveDescription() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/description", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, description }),
      });
      if (res.ok) {
        setMessage("Descripción guardada");
        setProduct((prev) => (prev ? { ...prev, description } : prev));
      } else {
        setMessage("Error al guardar");
      }
    } catch {
      setMessage("Error al guardar");
    } finally {
      setSaving(false);
    }
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.append("image", file);
    formData.append("sku", sku);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setMessage("Imagen subida");
        const data = await fetch(`/api/products/${sku}`).then((r) => r.json());
        setProduct(data);
      } else {
        setMessage("Error al subir imagen");
      }
    } catch {
      setMessage("Error al subir imagen");
    } finally {
      setUploading(false);
    }
    e.target.value = "";
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleDeleteImage(imageId: number) {
    if (!confirm("¿Eliminar esta imagen?")) return;

    setDeleting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/delete-image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: imageId }),
      });
      if (res.ok) {
        setMessage("Imagen eliminada");
        const data = await fetch(`/api/products/${sku}`).then((r) => r.json());
        setProduct(data);
      } else {
        setMessage("Error al eliminar imagen");
      }
    } catch {
      setMessage("Error al eliminar imagen");
    } finally {
      setDeleting(false);
    }
    setTimeout(() => setMessage(""), 3000);
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
        <div className="h-64 bg-gray-200 rounded mb-4" />
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
        <div className="h-6 bg-gray-200 rounded w-1/3" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500 mb-4">Producto no encontrado</p>
        <Link href="/productos" className="text-blue-600 hover:underline">
          Volver a productos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/productos"
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; Volver a productos
      </Link>

      {message && (
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm mb-4">
          {message}
        </div>
      )}

      <div className="bg-white rounded-lg border p-6 flex flex-col md:flex-row gap-8">
        {/* Left: Images */}
        <div className="md:w-1/2">
          <div className="w-full h-72 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
            {product.images.length > 0 ? (
              <img
                src={product.images[0].url}
                alt={product.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-gray-400">Sin imagen</span>
            )}
          </div>
          {((product.images.length > 1) || (isAdmin && product.images.length > 0)) && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {product.images.map((img) => (
                <div
                  key={img.id}
                  className="relative w-16 h-16 border rounded overflow-hidden group"
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteImage(img.id)}
                      disabled={deleting || uploading || saving}
                      className="absolute top-0 right-0 w-5 h-5 bg-red-600 text-white text-xs rounded-bl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="mt-4">
              <label
                className={`inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm ${
                  uploading || saving || deleting
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:bg-blue-700"
                }`}
              >
                {uploading ? "Subiendo..." : "Subir Imagen"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadImage}
                  className="hidden"
                  disabled={uploading || saving || deleting}
                />
              </label>
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div className="md:w-1/2">
          <p className="text-sm text-gray-500 mb-1">
            {product.brand}
            {product.brand && product.category ? " | " : ""}
            {product.category}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {product.name}
          </h1>

          <div className="space-y-3 mb-6">
            {product.precioMayorista > 0 && (
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-gray-700 font-medium">Mayorista</span>
                <span className="text-xl font-bold text-green-700">
                  {formatPrice(product.precioMayorista)}
                </span>
              </div>
            )}
            {product.precioCajaCerrada > 0 && (
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-gray-700 font-medium">
                  Caja Cerrada
                </span>
                <span className="text-xl font-bold text-blue-700">
                  {formatPrice(product.precioCajaCerrada)}
                </span>
              </div>
            )}
            {product.precioEspecial !== undefined &&
              product.precioEspecial > 0 && (
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span className="text-gray-700 font-medium">Especial</span>
                  <span className="text-xl font-bold text-purple-700">
                    {formatPrice(product.precioEspecial)}
                  </span>
                </div>
              )}
            {!session?.user && (
              <p className="text-sm text-gray-500 italic">
                <Link href="/login" className="text-blue-600 hover:underline">
                  Iniciá sesión
                </Link>{" "}
                para ver el precio Especial.
              </p>
            )}
          </div>

          <p className="text-sm text-gray-500">SKU: {product.sku}</p>
          {product.barcode && (
            <p className="text-sm text-gray-500">
              Código de barras: {product.barcode}
            </p>
          )}

          {/* Description: admin editable, public read-only */}
          {isAdmin ? (
            <div className="mt-6 pt-4 border-t">
              <h2 className="font-semibold text-gray-900 mb-2">Descripción</h2>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={saving || uploading || deleting}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                placeholder="Escribir descripción del producto..."
              />
              <button
                onClick={handleSaveDescription}
                disabled={saving || uploading || deleting}
                className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : uploading || deleting ? "Esperando..." : "Guardar Descripción"}
              </button>
            </div>
          ) : (
            product.description && (
              <div className="mt-6 pt-4 border-t">
                <h2 className="font-semibold text-gray-900 mb-2">
                  Descripción
                </h2>
                <p className="text-gray-700 text-sm whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
