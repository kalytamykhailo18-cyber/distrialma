import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as { clientId?: string; role?: string };
  if (user.role === "staff" || user.role === "admin") {
    return NextResponse.json({ error: "Solo para clientes" }, { status: 403 });
  }

  const clientId = user.clientId;
  if (!clientId) return NextResponse.json({ error: "Cliente no identificado" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") || "cuenta";

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");

    // Get client info
    const clientResult = await pool.request().input("cod", clientId).query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(Calle,''))) AS calle, LTRIM(RTRIM(ISNULL(CUIT,''))) AS cuit,
        LTRIM(RTRIM(ISNULL(TelClave1,''))) AS telefono,
        CASE WHEN ISNULL(FillerBit2, 0) = 1 THEN ISNULL(Saldo, 0) * 100 ELSE ISNULL(Saldo, 0) END AS saldo
      FROM [${dbClientes}].dbo.Clientes WHERE LTRIM(RTRIM(Cod)) = @cod
    `);

    if (clientResult.recordset.length === 0) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const client = clientResult.recordset[0];
    const clientData = {
      cod: client.cod.trim(),
      nombre: client.nombre.trim(),
      direccion: client.calle.trim(),
      cuit: client.cuit.trim(),
      telefono: client.telefono.trim(),
      saldo: Number(client.saldo),
    };

    // Tab: cuenta corriente (transactions)
    if (tab === "cuenta") {
      const transas = await pool.request().input("cod", clientId).query(`
        SELECT TOP 30
          LTRIM(RTRIM(t.Boleta)) AS boleta,
          LTRIM(RTRIM(t.Fechora)) AS fechora,
          t.Tipo AS tipo,
          t.Total AS total,
          t.Efectivo AS efectivo,
          t.Deuda AS deuda
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Cliente = @cod AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
          AND t.Tipo IN ('V', 'N', 'R')
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        ORDER BY t.Fechora DESC
      `);

      const transactions = transas.recordset.map((t: { boleta: string; fechora: string; tipo: string; total: number; efectivo: number; deuda: number }) => {
        const f = t.fechora;
        return {
          boleta: t.boleta.trim(),
          fecha: f.length >= 8 ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : f,
          tipo: t.tipo === "V" ? "Venta" : t.tipo === "N" ? "Nota credito" : t.tipo === "R" ? "Recibo" : t.tipo,
          total: Number(t.total),
        };
      });

      return NextResponse.json({ cliente: clientData, transacciones: transactions });
    }

    // Tab: pedidos (order history)
    if (tab === "pedidos") {
      const archived = await prisma.archivedOrder.findMany({
        where: { clienteCod: { in: [clientId, clientId.padStart(7, " ")] } },
        include: { items: true },
        orderBy: { archivedAt: "desc" },
        take: 20,
      });

      const backups = await prisma.pedidoBackup.findMany({
        where: { clienteCod: clientId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      // Merge and dedup
      const seen = new Set<string>();
      const pedidos = [];

      for (const a of archived) {
        const boleta = a.boleta.trim();
        if (seen.has(boleta)) continue;
        seen.add(boleta);
        pedidos.push({
          boleta,
          fecha: a.fechora.length >= 8 ? `${a.fechora.slice(6, 8)}/${a.fechora.slice(4, 6)}/${a.fechora.slice(0, 4)}` : "",
          total: Number(a.total),
          notas: a.notas || "",
          items: a.items.map((i) => ({
            sku: i.sku.trim(),
            nombre: i.productName,
            cantidad: Number(i.cant),
            precio: Number(i.precio),
            impo: Number(i.impo),
          })),
        });
      }

      for (const b of backups) {
        if (seen.has(b.boleta)) continue;
        seen.add(b.boleta);
        pedidos.push({
          boleta: b.boleta,
          fecha: b.fechora.length >= 8 ? `${b.fechora.slice(6, 8)}/${b.fechora.slice(4, 6)}/${b.fechora.slice(0, 4)}` : "",
          total: Number(b.total),
          notas: "",
          items: JSON.parse(b.items || "[]"),
        });
      }

      return NextResponse.json({ cliente: clientData, pedidos });
    }

    return NextResponse.json({ cliente: clientData });
  } catch (error) {
    console.error("Mi cuenta error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
