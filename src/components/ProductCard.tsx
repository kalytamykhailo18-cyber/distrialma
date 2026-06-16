import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

export default function ProductCard({ product, index = 0, stockThreshold = 0 }: { product: Product; index?: number; stockThreshold?: number }) {
  const isKg = product.unit === "KG";
  const priceLabel = isKg ? "/KG" : "";
  const outOfStock = product.stock <= stockThreshold;

  return (
    <Link
      href={`/productos/${product.sku}`}
      onClick={() => {
        sessionStorage.setItem("productListScrollY", String(window.scrollY));
        sessionStorage.setItem("productListPath", window.location.pathname + window.location.search);
      }}
      className={`bg-white rounded-xl border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] p-4 flex flex-col ${outOfStock ? "opacity-60 grayscale-[40%]" : ""}`}
      style={{
        opacity: 0,
        animation: `cardIn 400ms cubic-bezier(0.25,1,0.5,1) ${index * 40}ms forwards`,
      }}
    >
      <div className="relative w-full h-40 bg-gray-100 rounded mb-3 flex items-center justify-center overflow-hidden">
        {product.images.length > 0 ? (
          <img
            src={product.images[0].url}
            alt={product.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <img
            src="/logo-alma-placeholder-v3.png"
            alt="Sin imagen"
            className="max-h-full max-w-full object-contain opacity-70"
          />
        )}
        {outOfStock ? (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
            Sin stock
          </div>
        ) : (
          <div className="absolute top-2 right-2" title={product.stock <= 20 ? "Stock bajo" : product.stock <= 40 ? "Stock medio" : "Disponible"}>
            <div className={`w-3 h-3 rounded-full shadow-sm border border-white ${
              product.stock <= 20 ? "bg-red-500" : product.stock <= 40 ? "bg-yellow-400" : "bg-green-500"
            }`} />
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 font-mono mb-0.5">
        SKU: {product.sku}
      </p>
      <p className="text-xs text-gray-500 mb-1">
        {product.brand && <span>{product.brand}</span>}
        {product.brand && product.category && <span> | </span>}
        {product.category && <span>{product.category}</span>}
      </p>

      <h3 className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">
        {product.name}
      </h3>

      <div className="mt-auto space-y-1">
        {outOfStock ? (
          <p className="text-xs text-gray-400 italic">Consultá precio al volver a tener stock</p>
        ) : null}
        {!outOfStock && product.precioMayorista > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Mayorista{priceLabel}</span>
            <span className="font-semibold text-green-700">
              {formatPrice(product.precioMayorista)}
            </span>
          </div>
        )}
        {!outOfStock && product.precioCajaCerrada > 0 && product.cantidadPorCaja > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Caja Cerrada{priceLabel}</span>
            <span className="font-semibold text-brand-600">
              {formatPrice(product.precioCajaCerrada)}
            </span>
          </div>
        )}
        {!outOfStock && product.precioEspecial !== undefined && product.precioEspecial > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Especial{priceLabel}</span>
            <span className="font-semibold text-purple-700">
              {formatPrice(product.precioEspecial)}
            </span>
          </div>
        )}
        {!outOfStock && product.minimoCompra && (
          <p className="text-xs text-amber-600 pt-1">
            Mín: {product.minimoCompra}
          </p>
        )}
        {(product.pesoMayorista > 0 || product.cantidadPorCaja > 0) && (
          <p className="text-xs text-gray-400">
            {product.pesoMayorista > 0 && (isKg ? `Horma aprox. ${product.pesoMayorista} KG` : `x${product.pesoMayorista} un.`)}
            {product.pesoMayorista > 0 && product.cantidadPorCaja > 0 && " — "}
            {product.cantidadPorCaja > 0 && `Caja x${product.cantidadPorCaja}${isKg ? " KG" : " un."}`}
          </p>
        )}
      </div>
    </Link>
  );
}
