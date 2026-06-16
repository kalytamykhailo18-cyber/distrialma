import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import { writeFileSync, existsSync } from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min: covers slow Drive download + large MDB import

const MDB_PATH = "/tmp/fichador-base.mdb";

function parseMdbCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }
  return rows;
}

function parseAccessDate(dateStr: string): string | null {
  // Format: "MM/DD/YY HH:MM:SS" or "12/30/99 HH:MM:SS"
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  return match[4]; // Return just HH:MM:SS
}

function parseAccessFecha(dateStr: string): string | null {
  // Format: "MM/DD/YY HH:MM:SS" → YYYY-MM-DD
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!match) return null;
  const m = match[1];
  const d = match[2];
  let y = match[3];
  if (y.length === 2) y = parseInt(y) > 50 ? `19${y}` : `20${y}`;
  return `${y}-${m}-${d}`;
}

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// POST: import MDB file
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    const session = await requireStaff();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Sync from Google Drive — download only, then import below
  const action = new URL(req.url).searchParams.get("action");
  if (action === "sync") {
    try {
      const dlDir = "/tmp/fichador-sync-api";
      execSync(`rm -rf ${dlDir} && gdown --folder "https://drive.google.com/drive/folders/1Om0-kOGnCMB4Lr0KzR9OdZPRqk0864KD" -O ${dlDir} --no-cookies 2>&1`, { timeout: 240000, maxBuffer: 10 * 1024 * 1024 });
      const mdbFile = execSync(`find ${dlDir} -maxdepth 1 -name "*.mdb" -type f | head -1`).toString().trim();
      if (!mdbFile) return NextResponse.json({ error: "No se encontro archivo MDB en Drive" }, { status: 500 });
      execSync(`cp "${mdbFile}" "${MDB_PATH}"`);
      execSync(`rm -rf ${dlDir}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Fichador Drive sync error:", msg);
      return NextResponse.json({ error: `Error al sincronizar desde Drive: ${msg.slice(0, 200)}` }, { status: 500 });
    }
  }

  try {
    // Check if file uploaded or use existing path
    const contentType = req.headers.get("content-type") || "";
    let mdbPath = MDB_PATH;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      writeFileSync(MDB_PATH, buffer);
    } else if (!existsSync(MDB_PATH)) {
      // Try the downloaded file
      const altPath = "/tmp/gaston-files/Nueva carpeta/base.mdb";
      if (existsSync(altPath)) mdbPath = altPath;
      else return NextResponse.json({ error: "No MDB file found" }, { status: 400 });
    }

    // Extract LEGAJOS
    const legajosCsv = execSync(`mdb-export "${mdbPath}" LEGAJOS`, { maxBuffer: 50 * 1024 * 1024 }).toString();
    const legajos = parseMdbCsv(legajosCsv);

    // Extract ACCESOS
    const accesosCsv = execSync(`mdb-export "${mdbPath}" ACCESOS`, { maxBuffer: 50 * 1024 * 1024 }).toString();
    const accesos = parseMdbCsv(accesosCsv);

    // Extract AREAS for reference
    // const areasCsv = execSync(`mdb-export "${mdbPath}" AREAS`, { maxBuffer: 1024 * 1024 }).toString();
    // const areas = parseMdbCsv(areasCsv);

    // Import employees
    let empImported = 0;
    const legajoToEmpId = new Map<string, number>();

    for (const leg of legajos) {
      const legajoId = parseInt(leg.ID);
      if (!legajoId || !leg.NOMBRE) continue;

      const nombre = leg.NOMBRE.trim();
      const area = leg.AREA?.trim() || null;
      const turno = leg.TURNO?.trim() || null;

      const existing = await prisma.fichadorEmpleado.findUnique({ where: { legajoId } });
      if (existing) {
        if (existing.nombre !== nombre || existing.area !== area || existing.turno !== turno) {
          await prisma.fichadorEmpleado.update({
            where: { legajoId },
            data: { nombre, area, turno },
          });
        }
        legajoToEmpId.set(leg.ID, existing.id);
        continue;
      }

      const emp = await prisma.fichadorEmpleado.create({
        data: { legajoId, nombre, area, turno },
      });
      legajoToEmpId.set(leg.ID, emp.id);
      empImported++;
    }

    // Get all employee IDs for lookup (by both ID and COD)
    const allEmps = await prisma.fichadorEmpleado.findMany();
    for (const emp of allEmps) {
      legajoToEmpId.set(String(emp.legajoId), emp.id);
    }
    // Also map COD → employee ID (LEGAJOS.COD may differ from LEGAJOS.ID)
    for (const leg of legajos) {
      const cod = leg.COD?.trim();
      const id = leg.ID?.trim();
      if (cod && id && legajoToEmpId.has(id)) {
        legajoToEmpId.set(cod, legajoToEmpId.get(id)!);
      }
    }

    // Import punches in batches
    let punchImported = 0;
    let punchDuplicates = 0;
    const batchSize = 500;
    const punchBatch: Array<{ empleadoId: number; fecha: Date; hora: string; tipo: string }> = [];

    // Track last punch per employee per day to infer Entrada/Salida
    const lastPunchType = new Map<string, string>();

    for (const acc of accesos) {
      const legId = acc.idLegajos || acc.LEGAJO;
      const empId = legajoToEmpId.get(legId);
      if (!empId) continue;

      const fecha = parseAccessFecha(acc.fecha);
      const hora = parseAccessDate(acc.hora);
      let tipo = acc.TIPO || acc.accion || "";

      if (!fecha || !hora) continue;

      // Infer tipo if empty: alternate Entrada/Salida, or use vInOutMode
      if (tipo !== "Entrada" && tipo !== "Salida") {
        const inOut = acc.vInOutMode;
        if (inOut === "1") tipo = "Salida";
        else if (inOut === "0") tipo = "Entrada";
        else {
          // Alternate based on last punch for this employee on this day
          const key = `${empId}-${fecha}`;
          const last = lastPunchType.get(key);
          tipo = last === "Entrada" ? "Salida" : "Entrada";
        }
      }
      lastPunchType.set(`${empId}-${fecha}`, tipo);

      punchBatch.push({
        empleadoId: empId,
        fecha: new Date(fecha),
        hora,
        tipo,
      });

      if (punchBatch.length >= batchSize) {
        const result = await flushBatch(punchBatch);
        punchImported += result.imported;
        punchDuplicates += result.duplicates;
        punchBatch.length = 0;
      }
    }

    // Flush remaining
    if (punchBatch.length > 0) {
      const result = await flushBatch(punchBatch);
      punchImported += result.imported;
      punchDuplicates += result.duplicates;
    }

    return NextResponse.json({
      ok: true,
      employees: { total: legajos.length, imported: empImported, existing: legajos.length - empImported },
      punches: { total: accesos.length, imported: punchImported, duplicates: punchDuplicates },
    });
  } catch (error) {
    console.error("Fichador import error:", error);
    return NextResponse.json({ error: "Error importing: " + (error as Error).message }, { status: 500 });
  }
}

async function flushBatch(batch: Array<{ empleadoId: number; fecha: Date; hora: string; tipo: string }>) {
  let imported = 0;
  let duplicates = 0;

  for (const punch of batch) {
    try {
      await prisma.fichadorPunch.upsert({
        where: { empleadoId_fecha_hora: { empleadoId: punch.empleadoId, fecha: punch.fecha, hora: punch.hora } },
        update: { tipo: punch.tipo },
        create: punch,
      });
      imported++;
    } catch {
      duplicates++;
    }
  }

  return { imported, duplicates };
}

// PUT: update employee config
export async function PUT(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id, empleadoCod, horasExtras, tipoTurno, horasTurno, turnoInicio, turnoFin, activo } = await req.json();
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (empleadoCod !== undefined) data.empleadoCod = empleadoCod || null;
    if (horasExtras !== undefined) data.horasExtras = !!horasExtras;
    if (tipoTurno !== undefined) data.tipoTurno = tipoTurno;
    if (activo !== undefined) data.activo = !!activo;
    if (horasTurno !== undefined) data.horasTurno = parseInt(horasTurno) || 9;
    if (turnoInicio !== undefined) data.turnoInicio = turnoInicio;
    if (turnoFin !== undefined) data.turnoFin = turnoFin;

    await prisma.fichadorEmpleado.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// GET: list employees and stats
export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { getPool, getDbName } = await import("@/lib/mssql");

  const empleados = await prisma.fichadorEmpleado.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { punches: true } } },
  });

  const totalPunches = await prisma.fichadorPunch.count();

  // Get PunTouch employees for mapping dropdown
  let ptEmpleados: Array<{ cod: string; nombre: string }> = [];
  try {
    const pool = await getPool();
    const dbEmp = getDbName("empleados");
    const result = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmp}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
      ORDER BY Nombre
    `);
    ptEmpleados = result.recordset;
  } catch {}

  return NextResponse.json({
    empleados: empleados.map((e) => ({
      id: e.id,
      legajoId: e.legajoId,
      nombre: e.nombre,
      area: e.area,
      turno: e.turno,
      empleadoCod: e.empleadoCod,
      horasExtras: e.horasExtras,
      tipoTurno: e.tipoTurno,
      activo: e.activo,
      horasTurno: e.horasTurno,
      turnoInicio: e.turnoInicio,
      turnoFin: e.turnoFin,
      punches: e._count.punches,
    })),
    totalPunches,
    ptEmpleados,
  });
}
