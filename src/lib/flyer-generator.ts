import sharp from "sharp";

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

  // Fetch product image
  let productImg: Buffer;
  try {
    const res = await fetch(imageUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    productImg = await sharp(buf)
      .resize(450, 450, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    // Fallback: generate without product image
    productImg = await sharp({ create: { width: 450, height: 450, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer();
  }

  // Price boxes
  const priceBoxes = priceCC
    ? `<rect x="200" y="680" width="300" height="90" rx="12" fill="#fff3e0"/>
       <text x="350" y="718" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">MAYORISTA</text>
       <text x="350" y="755" text-anchor="middle" font-family="Arial" font-size="40" font-weight="bold" fill="#e53e3e">${priceStr}</text>
       <rect x="580" y="680" width="300" height="90" rx="12" fill="#e8f5e9"/>
       <text x="730" y="718" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">CAJA CERRADA</text>
       <text x="730" y="755" text-anchor="middle" font-family="Arial" font-size="40" font-weight="bold" fill="#2e7d32">${formatPrice(priceCC)}</text>`
    : `<rect x="340" y="680" width="400" height="90" rx="12" fill="#fff3e0"/>
       <text x="540" y="718" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">MAYORISTA</text>
       <text x="540" y="755" text-anchor="middle" font-family="Arial" font-size="48" font-weight="bold" fill="#e53e3e">${priceStr}</text>`;

  const svg = `<svg width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FB9A47"/>
        <stop offset="100%" stop-color="#e8791f"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect x="30" y="30" width="1020" height="1020" rx="24" fill="white" opacity="0.97"/>
    <rect x="30" y="30" width="1020" height="80" rx="24" fill="#FB9A47"/>
    <rect x="30" y="80" width="1020" height="30" fill="#FB9A47"/>
    <text x="540" y="85" text-anchor="middle" font-family="Arial,Helvetica" font-size="38" font-weight="bold" fill="white">OFERTA MAYORISTA</text>
    <text x="540" y="650" text-anchor="middle" font-family="Arial,Helvetica" font-size="32" font-weight="bold" fill="#333">${name}</text>
    ${priceBoxes}
    <rect x="30" y="970" width="1020" height="80" fill="#FB9A47" opacity="0.08"/>
    <text x="540" y="1005" text-anchor="middle" font-family="Arial" font-size="22" font-weight="bold" fill="#FB9A47">Distrialma - Av. Calle Real 387, Merlo</text>
    <text x="540" y="1035" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">distrialma.com.ar</text>
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([{ input: productImg, top: 150, left: 315 }])
    .png()
    .toBuffer();
}
