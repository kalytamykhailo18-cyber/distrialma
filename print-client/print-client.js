/**
 * Distrialma Print Client — Windows Background Service
 *
 * Polls the server every 30 seconds for pending print jobs (cierres de caja).
 * Downloads the PDF and prints silently to the default printer.
 *
 * Requirements:
 *   - Node.js 18+ installed on Windows
 *   - SumatraPDF installed (portable, included in this folder)
 *   OR Adobe Reader installed
 *
 * Usage:
 *   node print-client.js
 *
 * To install as a Windows service, use node-windows or pm2-windows-service.
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Configuration ──
const SERVER_URL = "https://distrialma.com.ar";
const POLL_INTERVAL = 30000; // 30 seconds
const TEMP_DIR = path.join(process.env.TEMP || "C:\\Temp", "distrialma-prints");

// Secret for authentication — same as CRON_SECRET or first 16 chars of RESEND_API_KEY
// Set this to match your server configuration
const SECRET = process.env.PRINT_SECRET || "re_5wSDTNZc_3ZCp";

// Path to SumatraPDF (download from https://www.sumatrapdfreader.com/download-free-pdf-viewer)
// If not found, will try Adobe Reader
const SUMATRA_PATHS = [
  path.join(__dirname, "SumatraPDF.exe"),
  "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
  "C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe",
];
const ACROBAT_PATHS = [
  "C:\\Program Files\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe",
  "C:\\Program Files (x86)\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe",
  "C:\\Program Files\\Adobe\\Reader 11.0\\Reader\\AcroRd32.exe",
];

// ── Find PDF viewer ──
function findPdfViewer() {
  for (const p of SUMATRA_PATHS) {
    if (fs.existsSync(p)) return { path: p, type: "sumatra" };
  }
  for (const p of ACROBAT_PATHS) {
    if (fs.existsSync(p)) return { path: p, type: "acrobat" };
  }
  return null;
}

// ── Silent print ──
async function silentPrint(pdfPath) {
  // Try methods in order: SumatraPDF → Adobe Reader → PowerShell (Windows built-in)
  const viewer = findPdfViewer();

  if (viewer) {
    try {
      if (viewer.type === "sumatra") {
        execSync(`"${viewer.path}" -print-to-default -silent "${pdfPath}"`, { timeout: 30000 });
      } else {
        execSync(`"${viewer.path}" /t "${pdfPath}"`, { timeout: 30000 });
        setTimeout(() => {
          try { execSync('taskkill /IM AcroRd32.exe /F', { timeout: 5000 }); } catch {}
        }, 5000);
      }
      console.log(`  Printed: ${path.basename(pdfPath)} via ${viewer.type}`);
      return true;
    } catch (e) {
      console.error(`  Print error with ${viewer.type}: ${e.message}`);
    }
  }

  // Fallback: use pdf-to-printer npm package (Windows native print API)
  try {
    const ptp = require("pdf-to-printer");
    await ptp.print(pdfPath);
    console.log(`  Printed: ${path.basename(pdfPath)} via pdf-to-printer`);
    return true;
  } catch (e) {
    console.error(`  pdf-to-printer error: ${e.message}`);
    return false;
  }
}

// ── HTTP fetch helper ──
function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { method: options.method || "GET", headers: options.headers || {}, timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data.substring(0, 100)}`)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Main poll loop ──
async function poll() {
  const ts = () => new Date().toLocaleTimeString();
  try {
    const data = await fetchJSON(`${SERVER_URL}/api/admin/print-queue?secret=${encodeURIComponent(SECRET)}`);

    if (data.error) {
      console.error(`[${ts()}] Server error: ${data.error}`);
      return;
    }

    if (!data.jobs || data.jobs.length === 0) {
      // Uncomment next line for verbose polling logs:
      // console.log(`[${ts()}] No pending jobs`);
      return;
    }

    console.log(`[${ts()}] ${data.jobs.length} job(s) pending`);

    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    for (const job of data.jobs) {
      const pdfPath = path.join(TEMP_DIR, job.filename);

      // Save PDF to temp file
      const pdfBuffer = Buffer.from(job.pdfBase64, "base64");
      fs.writeFileSync(pdfPath, pdfBuffer);

      // Print it
      const printed = await silentPrint(pdfPath);

      if (printed) {
        // Mark as printed on the server
        try {
          await fetchJSON(`${SERVER_URL}/api/admin/print-queue?secret=${encodeURIComponent(SECRET)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: job.id }),
          });
        } catch (e) {
          console.error(`  Failed to mark as printed: ${e.message}`);
        }
      }

      // Clean up temp file
      try { fs.unlinkSync(pdfPath); } catch {}
    }
  } catch (e) {
    console.error(`[${ts()}] Poll error: ${e.message}`);
  }
}

// ── Startup ──
console.log("===========================================");
console.log("  Distrialma Print Client");
console.log("  Polling every 30 seconds...");
console.log(`  Server: ${SERVER_URL}`);
const viewer = findPdfViewer();
if (viewer) {
  console.log(`  PDF viewer: ${viewer.type} (${viewer.path})`);
} else {
  console.log("  WARNING: No PDF viewer found!");
  console.log("  Place SumatraPDF.exe in this folder.");
}
console.log("===========================================");

// Run immediately, then every 30 seconds
poll();
setInterval(poll, POLL_INTERVAL);
