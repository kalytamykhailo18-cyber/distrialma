import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const cod = searchParams.get("cod");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");

    // Single client detail with invoices
    if (cod) {
      const codPadded = cod.padStart(7, " ");

      const clientResult = await pool.request().input("cod", codPadded).query(`
        SELECT
          LTRIM(RTRIM(c.Cod)) AS cod,
          LTRIM(RTRIM(c.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(c.Calle, ''))) AS calle,
          LTRIM(RTRIM(ISNULL(c.Nume, ''))) AS numero,
          LTRIM(RTRIM(ISNULL(c.Localidad, ''))) AS localidad,
          LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) AS tel1,
          LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) AS tel3,
          LTRIM(RTRIM(ISNULL(c.CUIT, ''))) AS cuit,
          LTRIM(RTRIM(ISNULL(c.Email, ''))) AS email,
          ISNULL(c.Saldo, 0) AS saldo,
          ISNULL(c.TotalCompras, 0) AS totalCompras,
          ISNULL(c.TotalVeces, 0) AS totalVeces,
          LTRIM(RTRIM(ISNULL(c.FechaAlta, ''))) AS fechaAlta,
          LTRIM(RTRIM(ISNULL(c.Observaciones, ''))) AS observaciones,
          LTRIM(RTRIM(ISNULL(z.[Desc], ''))) AS zona
        FROM [${dbClientes}].dbo.Clientes c
        LEFT JOIN [${dbClientes}].dbo.Zonas z ON z.Cod = c.Zona
        WHERE c.Cod = @cod
      `);

      if (clientResult.recordset.length === 0) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }

      const client = clientResult.recordset[0];

      // Calculate real saldo from Transas (source of truth, Saldo field can be stale)
      const saldoReal = await pool.request().input("codSaldo", codPadded).query(`
        SELECT ISNULL(SUM(CASE WHEN FillerBit1 = 1 THEN Deuda * 100 ELSE Deuda END), 0) AS saldo
        FROM [${dbTransas}].dbo.Transas
        WHERE Cliente = @codSaldo
          AND (LTRIM(RTRIM(Itm)) = '0' OR LTRIM(RTRIM(Itm)) = '')
          AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
      `);
      client.saldo = Number(saldoReal.recordset[0].saldo);

      // Get recent invoices (last 50)
      const invoicesResult = await pool.request().input("cod", codPadded).query(`
        SELECT TOP 50
          LTRIM(RTRIM(t.Boleta)) AS boleta,
          LTRIM(RTRIM(t.Sucursal)) AS sucursal,
          ISNULL(t.Total, 0) AS total,
          ISNULL(t.Efectivo, 0) AS efectivo,
          ISNULL(t.Tarjeta, 0) AS tarjeta,
          ISNULL(t.Deuda, 0) AS deuda,
          LTRIM(RTRIM(t.Fechora)) AS fechora
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Cliente = @cod AND t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        ORDER BY t.Fechora DESC
      `);

      const facturas = invoicesResult.recordset.map((f: { boleta: string; sucursal: string; total: number; efectivo: number; tarjeta: number; deuda: number; fechora: string }) => ({
        boleta: f.boleta,
        sucursal: f.sucursal,
        total: Number(f.total),
        efectivo: Number(f.efectivo),
        tarjeta: Number(f.tarjeta),
        deuda: Number(f.deuda),
        fecha: f.fechora.length >= 8 ? `${f.fechora.slice(6, 8)}/${f.fechora.slice(4, 6)}/${f.fechora.slice(0, 4)}` : f.fechora,
        hora: f.fechora.length >= 12 ? `${f.fechora.slice(8, 10)}:${f.fechora.slice(10, 12)}` : "",
      }));

      // Get web orders (Filler1 = 'WEB' in Pedidos or archived)
      const dbPedidos = getDbName("pedidos");
      const webOrdersResult = await pool.request().input("cod", codPadded).query(`
        SELECT TOP 30
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Nroped)) AS nroped,
          ISNULL(p.Total, 0) AS total,
          LTRIM(RTRIM(p.Fechora)) AS fechora,
          LTRIM(RTRIM(ISNULL(p.Observaciones, ''))) AS notas
        FROM [${dbPedidos}].dbo.Pedidos p
        WHERE p.Cliente = @cod AND p.Tipo = 'V' AND LTRIM(RTRIM(p.Itm)) = '0'
          AND LTRIM(RTRIM(ISNULL(p.Filler1, ''))) = 'WEB'
          AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
        ORDER BY p.Fechora DESC
      `);

      const pedidosWeb = webOrdersResult.recordset.map((p: { boleta: string; nroped: string; total: number; fechora: string; notas: string }) => ({
        boleta: p.boleta,
        nroped: p.nroped,
        total: Number(p.total),
        fecha: p.fechora.length >= 8 ? `${p.fechora.slice(6, 8)}/${p.fechora.slice(4, 6)}/${p.fechora.slice(0, 4)}` : p.fechora,
        hora: p.fechora.length >= 12 ? `${p.fechora.slice(8, 10)}:${p.fechora.slice(10, 12)}` : "",
        notas: p.notas,
      }));

      // Also check archived web orders from PostgreSQL (both PedidoBackup and ArchivedOrder)
      const { PrismaClient } = await import("@prisma/client");
      const prismaLocal = new PrismaClient();
      const [backups, archivedOrders] = await Promise.all([
        prismaLocal.pedidoBackup.findMany({
          where: { clienteCod: cod },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prismaLocal.archivedOrder.findMany({
          where: { clienteCod: { in: [cod, cod.padStart(7, " ")] } },
          orderBy: { archivedAt: "desc" },
          take: 20,
          include: { items: true },
        }),
      ]);
      await prismaLocal.$disconnect();

      // Merge both sources, deduplicate by boleta
      const seenBoletas = new Set<string>();
      const pedidosArchivados: Array<{ boleta: string; nroped: string; total: number; fecha: string; hora: string; items: unknown[]; active: boolean }> = [];

      for (const a of backups) {
        if (seenBoletas.has(a.boleta)) continue;
        seenBoletas.add(a.boleta);
        pedidosArchivados.push({
          boleta: a.boleta,
          nroped: a.nroped || "",
          total: Number(a.total),
          fecha: a.fechora.length >= 8 ? `${a.fechora.slice(6, 8)}/${a.fechora.slice(4, 6)}/${a.fechora.slice(0, 4)}` : a.fechora,
          hora: a.fechora.length >= 12 ? `${a.fechora.slice(8, 10)}:${a.fechora.slice(10, 12)}` : "",
          items: JSON.parse(a.items || "[]"),
          active: a.active,
        });
      }

      for (const a of archivedOrders) {
        const boleta = a.boleta.trim();
        if (seenBoletas.has(boleta)) continue;
        seenBoletas.add(boleta);
        pedidosArchivados.push({
          boleta,
          nroped: a.nroped || "",
          total: Number(a.total),
          fecha: a.fechora.length >= 8 ? `${a.fechora.slice(6, 8)}/${a.fechora.slice(4, 6)}/${a.fechora.slice(0, 4)}` : a.fechora,
          hora: a.fechora.length >= 12 ? `${a.fechora.slice(8, 10)}:${a.fechora.slice(10, 12)}` : "",
          items: a.items.map((i) => ({ sku: i.sku.trim(), name: i.productName, cant: Number(i.cant), price: Number(i.precio), listaPrecio: i.listaPrecio })),
          active: true,
        });
      }

      return NextResponse.json({
        cliente: {
          ...client,
          saldo: Number(client.saldo),
          totalCompras: Number(client.totalCompras),
          telefono: client.tel1 || client.tel3,
          direccion: [client.calle, client.numero].filter(Boolean).join(" "),
        },
        facturas,
        pedidosWeb,
        pedidosArchivados,
      });
    }

    // Search/list clients
    let where = "WHERE (c.DeBaja = 0 OR c.DeBaja IS NULL)";
    if (search.trim()) {
      where += ` AND (c.Nombre LIKE @search OR LTRIM(RTRIM(c.Cod)) LIKE @search OR ISNULL(c.TelClave1,'') LIKE @search OR ISNULL(c.Telclave3,'') LIKE @search OR ISNULL(c.CUIT,'') LIKE @search)`;
    }

    const countResult = await pool.request()
      .input("search", `%${search}%`)
      .query(`SELECT COUNT(*) AS total FROM [${dbClientes}].dbo.Clientes c ${where}`);

    const total = countResult.recordset[0].total;
    const offset = (page - 1) * limit;

    const result = await pool.request()
      .input("search", `%${search}%`)
      .input("offset", offset)
      .input("limit", limit)
      .query(`
        SELECT
          LTRIM(RTRIM(c.Cod)) AS cod,
          LTRIM(RTRIM(c.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(c.Calle, ''))) AS calle,
          LTRIM(RTRIM(ISNULL(c.TelClave1, ISNULL(c.Telclave3, '')))) AS telefono,
          ISNULL((SELECT SUM(CASE WHEN FillerBit1 = 1 THEN Deuda * 100 ELSE Deuda END) FROM [${dbTransas}].dbo.Transas WHERE Cliente = c.Cod AND (LTRIM(RTRIM(Itm)) = '0' OR LTRIM(RTRIM(Itm)) = '') AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')), 0) AS saldo,
          ISNULL(c.TotalVeces, 0) AS totalVeces
        FROM [${dbClientes}].dbo.Clientes c
        ${where}
        ORDER BY c.Nombre
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const clientes = result.recordset.map((c: { cod: string; nombre: string; calle: string; telefono: string; saldo: number; totalVeces: number }) => ({
      cod: c.cod,
      nombre: c.nombre,
      direccion: c.calle,
      telefono: c.telefono,
      saldo: Number(c.saldo),
      totalVeces: c.totalVeces,
    }));

    return NextResponse.json({ clientes, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Clientes error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
