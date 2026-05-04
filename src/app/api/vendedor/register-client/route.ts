import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const IVA_MAP: Record<string, string> = {
  CF: " ",
  RI: "1",
  MT: "3",
  EX: "4",
};

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { nombre, direccion, localidad, telefono, whatsapp, cuit, iva, fotoLocal, fotoCuit, lat, lng } = await req.json();

    if (!nombre || !telefono) {
      return NextResponse.json({ error: "Nombre y telefono son obligatorios" }, { status: 400 });
    }

    const pool = await getPool();
    const dbClientes = getDbName("clientes");

    // Get next Cod
    const maxResult = await pool.request().query(
      `SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod FROM [${dbClientes}].dbo.Clientes`
    );
    const nextCod = (maxResult.recordset[0]?.maxCod || 0) + 1;
    const codPadded = String(nextCod).padStart(7, " ");

    // Today as YYYYMMDD
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fechaAlta = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    const telClean = (telefono || "").replace(/[^0-9]/g, "").slice(-14).padEnd(14, " ");
    const waClean = (whatsapp || "").replace(/[^0-9]/g, "").slice(-14).padEnd(14, " ");
    const ivaCode = IVA_MAP[iva || "CF"] || " ";
    const userName = (session.user as { name?: string })?.name || "vendedor";

    // Insert into PunTouch
    await pool.request()
      .input("cod", codPadded)
      .input("nombre", (nombre || "").toUpperCase().substring(0, 60))
      .input("calle", [direccion, localidad].filter(Boolean).join(", ").toUpperCase().substring(0, 40))
      .input("localidad", "    ")
      .input("tel", telClean)
      .input("wa", waClean)
      .input("cuit", (cuit || "").replace(/[^0-9]/g, "").substring(0, 14))
      .input("iva", ivaCode)
      .input("fecha", fechaAlta)
      .input("obs", `WEB-${userName}`.substring(0, 20))
      .query(`
        INSERT INTO [${dbClientes}].dbo.Clientes
          (Cod, Nombre, Calle, Nume, PisoDto, Entre1, Entre2, Localidad, Zona, CodPostal,
           TelClave1, TelClave2, Telclave3, Observaciones, Email, FechaAlta, FechaUlt, FechaBaja,
           DeBaja, MotivoBaja, TransaUlt, Saldo, IVA, CUIT, Cumple, Descuento, ListaPrecios,
           Puntaje, TotalCompras, TotalVeces, Vendedor,
           FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
           Filler1, Filler2, Filler3, Filler4,
           FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
        VALUES
          (@cod, @nombre, @calle, '', '', '', '', @localidad, '    ', '',
           @tel, '              ', @wa, @obs, '', @fecha, @fecha, '        ',
           0, '', '         ', 0, @iva, @cuit, '    ', 0, '2',
           0, 0, 0, '       ',
           0, 0, 0, 0, 0,
           '', '', '', '',
           0, 0, 0, 0, 0)
      `);

    // Upload photos to Cloudinary
    let fotoLocalUrl: string | null = null;
    let fotoCuitUrl: string | null = null;

    if (fotoLocal) {
      try {
        const result = await cloudinary.uploader.upload(fotoLocal, {
          folder: "distrialma/clientes",
          public_id: `local-${nextCod}-${Date.now()}`,
          transformation: [{ width: 1200, height: 1200, crop: "limit", quality: "auto", format: "webp" }],
        });
        fotoLocalUrl = result.secure_url;
      } catch {}
    }

    if (fotoCuit) {
      try {
        const result = await cloudinary.uploader.upload(fotoCuit, {
          folder: "distrialma/clientes",
          public_id: `cuit-${nextCod}-${Date.now()}`,
          transformation: [{ width: 1200, height: 1200, crop: "limit", quality: "auto", format: "webp" }],
        });
        fotoCuitUrl = result.secure_url;
      } catch {}
    }

    // Save extra data in PostgreSQL
    await prisma.clienteRegistro.create({
      data: {
        clienteCod: codPadded,
        whatsapp: whatsapp || null,
        fotoLocal: fotoLocalUrl,
        fotoCuit: fotoCuitUrl,
        lat: lat || null,
        lng: lng || null,
        registradoPor: userName,
      },
    });

    return NextResponse.json({
      ok: true,
      cod: String(nextCod),
      nombre: (nombre || "").toUpperCase(),
    });
  } catch (error) {
    console.error("Register client error:", error);
    return NextResponse.json({ error: "Error al registrar cliente" }, { status: 500 });
  }
}
