import sharp from "sharp";
import { join } from "path";

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function generateFlyer(opts: {
  productName: string;
  price: number;
  priceCC?: number;
  imageUrl: string;
}): Promise<Buffer> {
  const { productName, price, priceCC, imageUrl } = opts;
  const width = 1080;
  const height = 1080;
  const name = escapeXml(productName);
  const priceStr = formatPrice(price);

  // Fetch product image (bigger)
  let productImg: Buffer;
  try {
    const res = await fetch(imageUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    productImg = await sharp(buf)
      .resize(580, 580, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    productImg = await sharp({ create: { width: 580, height: 580, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer();
  }

  // Logo watermark
  let logoWatermark: Buffer;
  try {
    logoWatermark = await sharp(join(process.cwd(), "public", "logo.png"))
      .resize(500, 350, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .modulate({ brightness: 1 })
      .png()
      .toBuffer();
    // Make it very transparent for watermark effect
    logoWatermark = await sharp(logoWatermark)
      .composite([{ input: Buffer.from([0, 0, 0, 25]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    logoWatermark = Buffer.alloc(0);
  }

  // Price boxes
  const priceBoxes = priceCC
    ? `<rect x="140" y="770" width="370" height="100" rx="16" fill="#fff3e0"/>
       <text x="325" y="810" text-anchor="middle" font-family="Arial" font-size="18" fill="#999">MAYORISTA</text>
       <text x="325" y="852" text-anchor="middle" font-family="Arial" font-size="46" font-weight="bold" fill="#e53e3e">${priceStr}</text>
       <rect x="570" y="770" width="370" height="100" rx="16" fill="#e8f5e9"/>
       <text x="755" y="810" text-anchor="middle" font-family="Arial" font-size="18" fill="#999">CAJA CERRADA</text>
       <text x="755" y="852" text-anchor="middle" font-family="Arial" font-size="46" font-weight="bold" fill="#2e7d32">${formatPrice(priceCC)}</text>`
    : `<rect x="290" y="770" width="500" height="100" rx="16" fill="#fff3e0"/>
       <text x="540" y="810" text-anchor="middle" font-family="Arial" font-size="18" fill="#999">PRECIO MAYORISTA</text>
       <text x="540" y="855" text-anchor="middle" font-family="Arial" font-size="54" font-weight="bold" fill="#e53e3e">${priceStr}</text>`;

  const svg = `<svg width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FB9A47"/>
        <stop offset="50%" stop-color="#f58529"/>
        <stop offset="100%" stop-color="#e8791f"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect x="24" y="24" width="1032" height="1032" rx="28" fill="white" opacity="0.97"/>

    <!-- Header bar -->
    <rect x="24" y="24" width="1032" height="90" rx="28" fill="#FB9A47"/>
    <rect x="24" y="85" width="1032" height="29" fill="#FB9A47"/>
    <text x="540" y="82" text-anchor="middle" font-family="Arial,Helvetica" font-size="42" font-weight="bold" fill="white">OFERTA MAYORISTA</text>

    <!-- Product name -->
    <text x="540" y="730" text-anchor="middle" font-family="Arial,Helvetica" font-size="34" font-weight="bold" fill="#333">${name}</text>

    <!-- Prices -->
    ${priceBoxes}

    <!-- Footer with 3 locations -->
    <rect x="24" y="900" width="1032" height="156" rx="0" fill="#FB9A47" opacity="0.06"/>
    <rect x="24" y="1028" width="1032" height="28" rx="0" fill="#FB9A47" opacity="0.06"/>
    <text x="540" y="935" text-anchor="middle" font-family="Arial" font-size="20" font-weight="bold" fill="#FB9A47">NUESTROS LOCALES</text>
    <text x="540" y="965" text-anchor="middle" font-family="Arial" font-size="17" fill="#666">Mayorista Merlo — Av. Calle Real 387</text>
    <text x="540" y="990" text-anchor="middle" font-family="Arial" font-size="17" fill="#666">Mayorista Pontevedra — Av. San Martín 868</text>
    <text x="540" y="1015" text-anchor="middle" font-family="Arial" font-size="17" fill="#666">Minorista — Calle Real 435, Merlo</text>
    <text x="540" y="1043" text-anchor="middle" font-family="Arial" font-size="15" font-weight="bold" fill="#FB9A47">distrialma.com.ar</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];

  // Add logo watermark behind product image
  if (logoWatermark.length > 0) {
    composites.push({ input: logoWatermark, top: 250, left: 290 });
  }

  // Add product image on top
  composites.push({ input: productImg, top: 120, left: 250 });

  return sharp(Buffer.from(svg))
    .composite(composites)
    .png()
    .toBuffer();
}
