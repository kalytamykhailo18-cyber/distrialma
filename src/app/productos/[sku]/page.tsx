import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getProductBySku } from "@/lib/queries";
import ProductDetailPage from "./ProductDetail";

interface Props {
  params: { sku: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const product = await getProductBySku(params.sku, false);
    if (!product) {
      return { title: "Producto no encontrado — Distrialma" };
    }

    const images = await prisma.productImage.findMany({
      where: { sku: product.sku },
      orderBy: { position: "asc" },
    });

    const imageUrl = images.length > 0 ? images[0].filename : undefined;
    const title = `${product.name} — Distrialma`;
    const description = `${product.name} | ${product.brand || ""} | ${product.category || ""} — Distribuidora Mayorista`;

    const productUrl = `https://distrialma.com.ar/productos/${params.sku}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: productUrl,
        siteName: "Distrialma",
        ...(imageUrl
          ? { images: [{ url: imageUrl, width: 800, height: 800, alt: product.name }] }
          : {}),
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return { title: "Distrialma — Distribuidora Mayorista" };
  }
}

export default function Page() {
  return <ProductDetailPage />;
}
