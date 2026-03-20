"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import ConfirmModal from "@/components/ConfirmModal";
import { useCart } from "@/components/CartProvider";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { data: session } = useSession();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);

  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";
  const { addItem, updateQuantity, removeItem, findItem } = useCart();
  const inCartUnit = findItem(sku, "unit");
  const inCartBox = findItem(sku, "box");
  const [addedUnit, setAddedUnit] = useState(false);
  const [addedBox, setAddedBox] = useState(false);

  // Admin edit state
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteImageId, setDeleteImageId] = useState<number | null>(null);

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
    setDeleteImageId(null);
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
        setActiveImage(0);
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
        <Link href="/productos" className="text-brand-600 hover:underline">
          Volver a productos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href={product.categoryId ? `/categoria/${product.categoryId}` : "/productos"}
        className="text-sm text-brand-600 hover:underline mb-4 inline-block"
      >
        &larr; {product.category ? `Volver a ${product.category}` : "Volver a productos"}
      </Link>

      {message && (
        <div className="bg-brand-50 text-brand-600 px-4 py-2 rounded-lg text-sm mb-4">
          {message}
        </div>
      )}

      <div className="bg-white rounded-lg border p-6 flex flex-col md:flex-row gap-8">
        {/* Left: Images */}
        <div className="md:w-1/2">
          <div className="w-full h-72 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
            {product.images.length > 0 ? (
              <img
                src={product.images[activeImage >= product.images.length ? 0 : activeImage]?.url}
                alt={product.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-gray-400">Sin imagen</span>
            )}
          </div>
          {((product.images.length > 1) || (isAdmin && product.images.length > 0)) && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {product.images.map((img, i) => (
                <div
                  key={img.id}
                  className={`relative w-16 h-16 border-2 rounded overflow-hidden group cursor-pointer ${
                    i === activeImage ? "border-brand-400" : "border-transparent"
                  }`}
                  onClick={() => setActiveImage(i)}
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteImageId(img.id);
                      }}
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
                className={`inline-block bg-brand-400 text-white px-4 py-2 rounded-lg text-sm ${
                  uploading || saving || deleting
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:bg-brand-500"
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
            {(() => {
              const isKg = product.unit === "KG";
              const priceLabel = isKg ? "/KG" : "";
              return (
                <>
                  {product.precioMayorista > 0 && (
                    <div className="p-3 bg-green-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700 font-medium">Mayorista{priceLabel}</span>
                        <span className="text-xl font-bold text-green-700">
                          {formatPrice(product.precioMayorista)}
                        </span>
                      </div>
                      {product.pesoMayorista > 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          {isKg
                            ? `Horma aprox. ${product.pesoMayorista} KG = ${formatPrice(product.precioMayorista * product.pesoMayorista)}`
                            : `x${product.pesoMayorista} un. = ${formatPrice(product.precioMayorista * product.pesoMayorista)}`
                          }
                        </p>
                      )}
                    </div>
                  )}
                  {product.precioCajaCerrada > 0 && product.cantidadPorCaja > 0 && (
                    <div className="p-3 bg-brand-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700 font-medium">Caja Cerrada{priceLabel}</span>
                        <span className="text-xl font-bold text-brand-600">
                          {formatPrice(product.precioCajaCerrada)}
                        </span>
                      </div>
                      {product.cantidadPorCaja > 0 && (
                        <p className="text-xs text-brand-500 mt-1">
                          Caja x{product.cantidadPorCaja}{isKg ? " KG" : " un."} = {formatPrice(product.precioCajaCerrada * product.cantidadPorCaja)}
                        </p>
                      )}
                    </div>
                  )}
                  {product.precioEspecial !== undefined &&
                    product.precioEspecial > 0 && (
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700 font-medium">Especial{priceLabel}</span>
                          <span className="text-xl font-bold text-purple-700">
                            {formatPrice(product.precioEspecial)}
                          </span>
                        </div>
                        {product.cantidadPorCaja > 0 && (
                          <p className="text-xs text-purple-600 mt-1">
                            Caja x{product.cantidadPorCaja}{isKg ? " KG" : " un."} = {formatPrice(product.precioEspecial * product.cantidadPorCaja)}
                          </p>
                        )}
                      </div>
                    )}
                </>
              );
            })()}
            {product.precioEspecial === undefined && (
              <p className="text-sm text-gray-500 italic">
                {!session?.user ? (
                  <>
                    <Link href="/login" className="text-brand-600 hover:underline">
                      Iniciá sesión
                    </Link>{" "}
                    para ver el precio Especial.
                  </>
                ) : (
                  "Tu cuenta no tiene acceso al precio Especial."
                )}
              </p>
            )}
          </div>

          {product.minimoCompra && (
            <div className="p-3 bg-amber-50 rounded-lg mb-6">
              <span className="text-sm text-amber-800 font-medium">
                Compra mínima: {product.minimoCompra}
                {product.unit === "KG" && product.pesoMayorista > 0
                  ? ` (${product.pesoMayorista} KG aprox.)`
                  : ""}
              </span>
            </div>
          )}

          {/* Add to cart */}
          {!isAdmin && product.precioMayorista > 0 && (() => {
            const unitMin = product.pesoMayorista > 0 ? product.pesoMayorista : 1;
            const unitStep = 1;
            const itemData = {
              sku: product.sku,
              name: product.name,
              unit: product.unit,
              pesoMayorista: product.pesoMayorista,
              precioMayorista: product.precioMayorista,
              precioCajaCerrada: product.precioCajaCerrada,
              cantidadPorCaja: product.cantidadPorCaja,
            };

            return (
              <div className="mb-6 space-y-3">
                {/* Unit mode */}
                <div className="flex items-center gap-2">
                  {inCartUnit ? (
                    <>
                      <button
                        onClick={() => {
                          if (inCartUnit.quantity <= unitMin) removeItem(product.sku, "unit");
                          else updateQuantity(product.sku, "unit", inCartUnit.quantity - unitStep);
                        }}
                        className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-green-600 text-green-600 font-bold text-lg hover:bg-green-50"
                      >
                        -
                      </button>
                      <span className="w-12 text-center font-semibold text-gray-900">{inCartUnit.quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.sku, "unit", inCartUnit.quantity + unitStep)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg bg-green-600 text-white font-bold text-lg hover:bg-green-700"
                      >
                        +
                      </button>
                      <span className="text-sm text-gray-500 ml-2">
                        {product.unit === "KG" ? "KG" : "un."} en carrito
                      </span>
                    </>
                  ) : (
                    <button
                      onClick={() => { addItem(itemData, "unit"); setAddedUnit(true); setTimeout(() => setAddedUnit(false), 2000); }}
                      className="flex-1 py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      {addedUnit ? "Agregado!" : `Agregar por ${product.unit === "KG" ? "KG" : "unidad"}`}
                    </button>
                  )}
                </div>

                {/* Box mode */}
                {product.precioCajaCerrada > 0 && product.cantidadPorCaja > 0 && (
                  <div className="flex items-center gap-2">
                    {inCartBox ? (
                      <>
                        <button
                          onClick={() => {
                            if (inCartBox.quantity <= 1) removeItem(product.sku, "box");
                            else updateQuantity(product.sku, "box", inCartBox.quantity - 1);
                          }}
                          className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-brand-400 text-brand-600 font-bold text-lg hover:bg-brand-50"
                        >
                          -
                        </button>
                        <span className="w-12 text-center font-semibold text-gray-900">{inCartBox.quantity}</span>
                        <button
                          onClick={() => updateQuantity(product.sku, "box", inCartBox.quantity + 1)}
                          className="w-10 h-10 flex items-center justify-center rounded-lg bg-brand-400 text-white font-bold text-lg hover:bg-brand-500"
                        >
                          +
                        </button>
                        <span className="text-sm text-gray-500 ml-2">
                          caja{inCartBox.quantity > 1 ? "s" : ""} en carrito
                        </span>
                      </>
                    ) : (
                      <button
                        onClick={() => { addItem(itemData, "box"); setAddedBox(true); setTimeout(() => setAddedBox(false), 2000); }}
                        className="flex-1 py-3 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition-colors"
                      >
                        {addedBox ? "Agregado!" : "Agregar caja cerrada"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

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
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
                placeholder="Escribir descripción del producto..."
              />
              <button
                onClick={handleSaveDescription}
                disabled={saving || uploading || deleting}
                className="mt-2 bg-brand-400 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-500 disabled:opacity-50"
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

      <ConfirmModal
        open={deleteImageId !== null}
        message="¿Eliminar esta imagen?"
        loading={deleting}
        onConfirm={() => {
          if (deleteImageId !== null) handleDeleteImage(deleteImageId);
        }}
        onCancel={() => setDeleteImageId(null)}
      />
    </div>
  );
}
