"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/components/CartProvider";
import type { Product } from "@/types";

interface ComboItem {
  sku: string;
  quantity: number;
  name: string;
  unitPrice: number;
  unit: string;
  images: string[];
}

interface ComboDetail {
  id: number;
  name: string;
  description: string | null;
  price: number;
  hasCustomPrice: boolean;
  originalPrice: number;
  items: ComboItem[];
  images: { id: number; url: string }[];
}

export default function ComboDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [combo, setCombo] = useState<ComboDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);

  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";

  // Admin edit state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editItems, setEditItems] = useState<{ sku: string; quantity: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  // Product search for adding items
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const { addItem, findItem, updateQuantity, removeItem } = useCart();
  const comboSku = `combo-${id}`;
  const inCart = findItem(comboSku, "unit");

  function loadCombo() {
    fetch(`/api/combos/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setCombo(null);
        else {
          setCombo(data);
          setEditName(data.name);
          setEditDescription(data.description || "");
          setEditPrice(data.hasCustomPrice ? String(data.price) : "");
          setEditItems(data.items.map((i: ComboItem) => ({ sku: i.sku, quantity: i.quantity, name: i.name })));
        }
      })
      .catch(() => setCombo(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCombo();
  }, [id]);

  function handleSearch(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(value)}&limit=8`);
        const data = await res.json();
        setResults(data.products || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }

  function addProductToCombo(product: Product) {
    if (editItems.find((i) => i.sku === product.sku)) return;
    setEditItems([...editItems, { sku: product.sku, quantity: 1, name: product.name }]);
    setSearch("");
    setResults([]);
  }

  async function handleSaveAll() {
    if (!editName.trim() || editItems.length < 2) {
      setMessage("Nombre y al menos 2 productos requeridos");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/combos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: combo!.id,
          name: editName.trim(),
          description: editDescription.trim() || null,
          price: editPrice ? parseFloat(editPrice) : null,
          active: true,
          items: editItems.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        }),
      });
      if (res.ok) {
        setMessage("Combo guardado");
        loadCombo();
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
    formData.append("sku", comboSku);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      if (res.ok) {
        setMessage("Imagen subida");
        loadCombo();
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
        loadCombo();
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

  function handleAddToCart() {
    if (!combo) return;
    addItem(
      {
        sku: comboSku,
        name: combo.name,
        unit: "UN",
        pesoMayorista: 0,
        precioMayorista: combo.price,
        precioCajaCerrada: 0,
        cantidadPorCaja: 0,
        isCombo: true,
        comboId: combo.id,
        comboItems: combo.items.map((i) => ({
          sku: i.sku,
          name: i.name,
          quantity: i.quantity,
        })),
      },
      "unit"
    );
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

  if (!combo) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500 mb-4">Combo no encontrado</p>
        <Link href="/productos" className="text-brand-600 hover:underline">
          Volver a productos
        </Link>
      </div>
    );
  }

  const displayImages = combo.images.length > 0
    ? combo.images
    : combo.items
        .filter((i) => i.images.length > 0)
        .map((i, idx) => ({ id: -(idx + 1), url: i.images[0] }));

  const discount = combo.originalPrice > 0 && combo.price < combo.originalPrice
    ? Math.round((1 - combo.price / combo.originalPrice) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/productos"
        className="text-sm text-brand-600 hover:underline mb-4 inline-block"
      >
        &larr; Volver a COMBOS
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
            {displayImages.length > 0 ? (
              <img
                src={displayImages[activeImage >= displayImages.length ? 0 : activeImage]?.url}
                alt={combo.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-gray-400">Sin imagen</span>
            )}
          </div>
          {displayImages.length > 1 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {displayImages.map((img, i) => (
                <div
                  key={img.id}
                  className={`relative w-16 h-16 border-2 rounded overflow-hidden group cursor-pointer ${
                    i === activeImage ? "border-brand-400" : "border-transparent"
                  }`}
                  onClick={() => setActiveImage(i)}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  {isAdmin && img.id > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                      disabled={deleting || uploading || saving}
                      className="absolute top-0 right-0 w-5 h-5 bg-red-600 text-white text-xs rounded-bl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
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
                  uploading || saving || deleting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-brand-500"
                }`}
              >
                {uploading ? "Subiendo..." : "Subir Imagen"}
                <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" disabled={uploading || saving || deleting} />
              </label>
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div className="md:w-1/2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">COMBO</span>
            {discount > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">-{discount}%</span>
            )}
          </div>

          {/* Name — admin editable */}
          {isAdmin ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-2xl font-bold text-gray-900 mb-4 w-full border-b-2 border-dashed border-gray-300 focus:border-brand-400 focus:outline-none pb-1"
            />
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{combo.name}</h1>
          )}

          {/* Included products */}
          <div className="space-y-2 mb-4">
            <h2 className="text-sm font-medium text-gray-700">Incluye:</h2>
            {(isAdmin ? editItems : combo.items).map((item, idx) => (
              <div key={item.sku} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-800 flex-1">
                  {item.name}
                </span>
                {isAdmin ? (
                  <>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {
                        const newItems = [...editItems];
                        newItems[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                        setEditItems(newItems);
                      }}
                      className="w-14 text-center text-sm border rounded py-1"
                      min={1}
                    />
                    <button
                      onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Quitar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-gray-600 font-medium">{item.quantity > 1 ? `x${item.quantity}` : ""}</span>
                    <span className="text-gray-500 text-xs">{formatPrice((item as ComboItem).unitPrice)}</span>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Admin: add product search */}
          {isAdmin && (
            <div className="relative mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Buscar producto para agregar..."
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              {searching && <span className="absolute right-3 top-2.5 text-gray-400 text-xs">Buscando...</span>}
              {results.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {results.map((p) => {
                    const added = editItems.some((i) => i.sku === p.sku);
                    return (
                      <button
                        key={p.sku}
                        onClick={() => !added && addProductToCombo(p)}
                        disabled={added}
                        className={`w-full text-left px-4 py-2 text-sm border-b last:border-b-0 ${
                          added ? "bg-gray-50 text-gray-400" : "hover:bg-blue-50"
                        }`}
                      >
                        <span className="font-mono text-gray-500 mr-2">{p.sku}</span>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Admin: custom price */}
          {isAdmin && (
            <div className="mb-4">
              <label className="text-sm text-gray-600 block mb-1">Precio especial (vacío = suma automática)</label>
              <input
                type="number"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="Automático"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          )}

          {/* Price display */}
          <div className="p-4 bg-green-50 rounded-lg mb-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-700 font-medium">Precio Combo</span>
              <div className="flex items-center gap-3">
                {discount > 0 && (
                  <span className="text-gray-400 line-through text-sm">{formatPrice(combo.originalPrice)}</span>
                )}
                <span className="text-2xl font-bold text-green-700">{formatPrice(combo.price)}</span>
              </div>
            </div>
          </div>

          {/* Add to cart (not for admin) */}
          {!isAdmin && (
            <div className="mb-6">
              {inCart ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (inCart.quantity <= 1) removeItem(comboSku, "unit");
                      else updateQuantity(comboSku, "unit", inCart.quantity - 1);
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-green-600 text-green-600 font-bold text-lg hover:bg-green-50"
                  >-</button>
                  <span className="w-12 text-center font-semibold text-gray-900">{inCart.quantity}</span>
                  <button
                    onClick={() => updateQuantity(comboSku, "unit", inCart.quantity + 1)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-green-600 text-white font-bold text-lg hover:bg-green-700"
                  >+</button>
                  <span className="text-sm text-gray-500 ml-2">en carrito</span>
                </div>
              ) : (
                <button
                  onClick={handleAddToCart}
                  className="w-full py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Agregar al carrito
                </button>
              )}
            </div>
          )}

          {/* Description — admin editable */}
          {isAdmin ? (
            <div className="pt-4 border-t">
              <h2 className="font-semibold text-gray-900 mb-2">Descripción</h2>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                disabled={saving || uploading || deleting}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
                placeholder="Escribir descripción del combo..."
              />
            </div>
          ) : (
            combo.description && (
              <div className="pt-4 border-t">
                <h2 className="font-semibold text-gray-900 mb-2">Descripción</h2>
                <p className="text-gray-700 text-sm whitespace-pre-line">{combo.description}</p>
              </div>
            )
          )}

          {/* Admin: save all button */}
          {isAdmin && (
            <button
              onClick={handleSaveAll}
              disabled={saving || uploading || deleting}
              className="mt-4 w-full py-3 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
