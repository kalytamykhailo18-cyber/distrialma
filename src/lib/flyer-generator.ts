import sharp from "sharp";
import { join } from "path";

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadImage(path: string, w: number, h: number): Promise<Buffer> {
  try {
    return await sharp(join(process.cwd(), "public", path))
      .resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png()
      .toBuffer();
  } catch {
    return Buffer.alloc(0);
  }
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
      .resize(420, 420, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
  } catch {
    productImg = await sharp({ create: { width: 420, height: 420, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  }

  // Load seal badge
  const sello = await loadImage("sello-alma.png", 160, 160);

  // Logo watermark (subtle behind product)
  let logoWm = await loadImage("logo.png", 250, 180);
  if (logoWm.length > 0) {
    logoWm = await sharp(logoWm)
      .composite([{ input: Buffer.from([0, 0, 0, 35]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  const priceBoxes = priceCC
    ? `<rect x="60" y="720" width="440" height="100" rx="16" fill="white" opacity="0.93"/>
       <text x="280" y="758" text-anchor="middle" font-family="Arial" font-size="17" fill="#999">MAYORISTA</text>
       <text x="280" y="800" text-anchor="middle" font-family="Arial" font-size="46" font-weight="bold" fill="#e53e3e">${priceStr}</text>
       <rect x="580" y="720" width="440" height="100" rx="16" fill="white" opacity="0.93"/>
       <text x="800" y="758" text-anchor="middle" font-family="Arial" font-size="17" fill="#999">CAJA CERRADA</text>
       <text x="800" y="800" text-anchor="middle" font-family="Arial" font-size="46" font-weight="bold" fill="#2e7d32">${formatPrice(priceCC)}</text>`
    : `<rect x="240" y="720" width="600" height="100" rx="16" fill="white" opacity="0.93"/>
       <text x="540" y="758" text-anchor="middle" font-family="Arial" font-size="17" fill="#999">PRECIO MAYORISTA</text>
       <text x="540" y="802" text-anchor="middle" font-family="Arial" font-size="52" font-weight="bold" fill="#e53e3e">${priceStr}</text>`;

  const svg = `<svg width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FBB347"/>
        <stop offset="40%" stop-color="#f58529"/>
        <stop offset="100%" stop-color="#e06a10"/>
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="rgba(0,0,0,0.2)"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>

    <!-- Decorative circles -->
    <circle cx="80" cy="80" r="120" fill="white" opacity="0.06"/>
    <circle cx="1000" cy="180" r="80" fill="white" opacity="0.05"/>

    <!-- Header bar -->
    <rect x="0" y="0" width="1080" height="90" fill="rgba(0,0,0,0.15)"/>
    <text x="540" y="62" text-anchor="middle" font-family="Arial,Helvetica" font-size="40" font-weight="bold" fill="white">OFERTA MAYORISTA</text>

    <!-- White rounded container for product -->
    <rect x="280" y="105" width="520" height="480" rx="24" fill="white" filter="url(#shadow)"/>

    <!-- Product name -->
    <rect x="0" y="620" width="1080" height="65" fill="rgba(0,0,0,0.12)"/>
    <text x="540" y="663" text-anchor="middle" font-family="Arial,Helvetica" font-size="32" font-weight="bold" fill="white">${name}</text>

    <!-- Prices -->
    ${priceBoxes}

    <!-- Info strip -->
    <rect x="0" y="840" width="1080" height="55" fill="rgba(0,0,0,0.08)"/>
    <text x="270" y="875" text-anchor="middle" font-family="Arial" font-size="18" fill="white">📱 Pedidos: 11-6928-8114</text>
    <text x="540" y="875" text-anchor="middle" font-family="Arial" font-size="18" fill="white">💳 Todos los medios de pago</text>
    <text x="830" y="875" text-anchor="middle" font-family="Arial" font-size="18" fill="white">🚚 Hacemos envíos</text>

    <!-- Footer -->
    <rect x="0" y="910" width="1080" height="170" fill="rgba(0,0,0,0.18)"/>
    <text x="540" y="945" text-anchor="middle" font-family="Arial" font-size="20" font-weight="bold" fill="white">NUESTROS LOCALES</text>
    <text x="540" y="975" text-anchor="middle" font-family="Arial" font-size="16" fill="rgba(255,255,255,0.9)">Mayorista Merlo — Av. Calle Real 387</text>
    <text x="540" y="998" text-anchor="middle" font-family="Arial" font-size="16" fill="rgba(255,255,255,0.9)">Mayorista Pontevedra — Av. San Martín 868</text>
    <text x="540" y="1021" text-anchor="middle" font-family="Arial" font-size="16" fill="rgba(255,255,255,0.9)">Minorista — Calle Real 435, Merlo</text>
    <text x="540" y="1055" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold" fill="white">distrialma.com.ar</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];

  if (logoWm.length > 0) composites.push({ input: logoWm, top: 260, left: 415 });
  composites.push({ input: productImg, top: 135, left: 330 });
  if (sello.length > 0) composites.push({ input: sello, top: 480, left: 830 });

  return sharp(Buffer.from(svg))
    .composite(composites)
    .png()
    .toBuffer();
}

// Story format: 1080x1920 (9:16 vertical)
export async function generateStoryFlyer(opts: {
  productName: string;
  price: number;
  priceCC?: number;
  imageUrl: string;
}): Promise<Buffer> {
  const { productName, price, priceCC, imageUrl } = opts;
  const width = 1080;
  const height = 1920;
  const name = escapeXml(productName);
  const priceStr = formatPrice(price);

  let productImg: Buffer;
  try {
    const res = await fetch(imageUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    productImg = await sharp(buf)
      .resize(540, 540, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
  } catch {
    productImg = await sharp({ create: { width: 540, height: 540, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  }

  const sello = await loadImage("sello-alma.png", 200, 200);

  let logoWm = await loadImage("logo.png", 320, 230);
  if (logoWm.length > 0) {
    logoWm = await sharp(logoWm)
      .composite([{ input: Buffer.from([0, 0, 0, 30]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  const priceBoxes = priceCC
    ? `<rect x="80" y="1120" width="430" height="120" rx="20" fill="white" opacity="0.93"/>
       <text x="295" y="1165" text-anchor="middle" font-family="Arial" font-size="21" fill="#999">MAYORISTA</text>
       <text x="295" y="1218" text-anchor="middle" font-family="Arial" font-size="54" font-weight="bold" fill="#e53e3e">${priceStr}</text>
       <rect x="570" y="1120" width="430" height="120" rx="20" fill="white" opacity="0.93"/>
       <text x="785" y="1165" text-anchor="middle" font-family="Arial" font-size="21" fill="#999">CAJA CERRADA</text>
       <text x="785" y="1218" text-anchor="middle" font-family="Arial" font-size="54" font-weight="bold" fill="#2e7d32">${formatPrice(priceCC)}</text>`
    : `<rect x="190" y="1120" width="700" height="120" rx="20" fill="white" opacity="0.93"/>
       <text x="540" y="1165" text-anchor="middle" font-family="Arial" font-size="21" fill="#999">PRECIO MAYORISTA</text>
       <text x="540" y="1222" text-anchor="middle" font-family="Arial" font-size="62" font-weight="bold" fill="#e53e3e">${priceStr}</text>`;

  const svg = `<svg width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FBB347"/>
        <stop offset="40%" stop-color="#f58529"/>
        <stop offset="100%" stop-color="#e06a10"/>
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="4" stdDeviation="14" flood-color="rgba(0,0,0,0.2)"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>

    <!-- Decorative circles -->
    <circle cx="100" cy="150" r="160" fill="white" opacity="0.06"/>
    <circle cx="980" cy="350" r="100" fill="white" opacity="0.05"/>
    <circle cx="120" cy="1700" r="80" fill="white" opacity="0.04"/>

    <!-- Header -->
    <rect x="0" y="0" width="1080" height="110" fill="rgba(0,0,0,0.15)"/>
    <text x="540" y="74" text-anchor="middle" font-family="Arial,Helvetica" font-size="48" font-weight="bold" fill="white">OFERTA MAYORISTA</text>

    <!-- White rounded container for product -->
    <rect x="220" y="150" width="640" height="620" rx="30" fill="white" filter="url(#shadow)"/>

    <!-- Product name strip -->
    <rect x="0" y="980" width="1080" height="80" fill="rgba(0,0,0,0.12)"/>
    <text x="540" y="1032" text-anchor="middle" font-family="Arial,Helvetica" font-size="40" font-weight="bold" fill="white">${name}</text>

    <!-- Prices -->
    ${priceBoxes}

    <!-- Info strip -->
    <rect x="0" y="1280" width="1080" height="180" fill="rgba(0,0,0,0.08)"/>
    <text x="540" y="1330" text-anchor="middle" font-family="Arial" font-size="26" fill="white">📱 Pedidos por WhatsApp: 11-6928-8114</text>
    <text x="540" y="1375" text-anchor="middle" font-family="Arial" font-size="24" fill="white">💳 Todos los medios de pago</text>
    <text x="540" y="1420" text-anchor="middle" font-family="Arial" font-size="24" fill="white">🚚 Hacemos envíos a todo el país</text>

    <!-- Footer -->
    <rect x="0" y="1560" width="1080" height="360" fill="rgba(0,0,0,0.18)"/>
    <text x="540" y="1620" text-anchor="middle" font-family="Arial" font-size="26" font-weight="bold" fill="white">NUESTROS LOCALES</text>
    <text x="540" y="1665" text-anchor="middle" font-family="Arial" font-size="22" fill="rgba(255,255,255,0.9)">Mayorista Merlo — Av. Calle Real 387</text>
    <text x="540" y="1700" text-anchor="middle" font-family="Arial" font-size="22" fill="rgba(255,255,255,0.9)">Mayorista Pontevedra — Av. San Martín 868</text>
    <text x="540" y="1735" text-anchor="middle" font-family="Arial" font-size="22" fill="rgba(255,255,255,0.9)">Minorista — Calle Real 435, Merlo</text>
    <text x="540" y="1780" text-anchor="middle" font-family="Arial" font-size="22" font-weight="bold" fill="white">distrialma.com.ar</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];
  if (logoWm.length > 0) composites.push({ input: logoWm, top: 350, left: 380 });
  composites.push({ input: productImg, top: 190, left: 270 });
  if (sello.length > 0) composites.push({ input: sello, top: 830, left: 820 });

  return sharp(Buffer.from(svg))
    .composite(composites)
    .png()
    .toBuffer();
}
