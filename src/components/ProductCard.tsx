import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/productos/${product.sku}`}
      className="bg-white rounded-lg border hover:shadow-md transition-shadow p-4 flex flex-col"
    >
      <div className="w-full h-40 bg-gray-100 rounded mb-3 flex items-center justify-center overflow-hidden">
        {product.images.length > 0 ? (
          <img
            src={product.images[0].url}
            alt={product.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-gray-400 text-sm">Sin imagen</span>
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
        {product.precioMayorista > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Mayorista</span>
            <span className="font-semibold text-green-700">
              {formatPrice(product.precioMayorista)}
            </span>
          </div>
        )}
        {product.precioCajaCerrada > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Caja Cerrada</span>
            <span className="font-semibold text-blue-700">
              {formatPrice(product.precioCajaCerrada)}
            </span>
          </div>
        )}
        {product.precioEspecial !== undefined && product.precioEspecial > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Especial</span>
            <span className="font-semibold text-purple-700">
              {formatPrice(product.precioEspecial)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
