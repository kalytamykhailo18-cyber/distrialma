import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// DELETE: remove pending order after it's been invoiced
export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { boleta } = await req.json();
    if (!boleta) return NextResponse.json({ error: "boleta requerida" }, { status: 400 });

    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");

    await pool.request().input("boleta", boleta.padStart(9, " ")).query(`
      DELETE FROM [${dbPedidos}].dbo.Pedidos WHERE Boleta = @boleta
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete pendiente error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// GET: list pending orders for a sucursal
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sucursal = req.nextUrl.searchParams.get("sucursal") || "";

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbEmpleados = getDbName("empleados");
    // const dbClientes = getDbName("clientes");

    // Get pending order headers (Tipo='V', not anulado)
    const headers = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Nroped)) AS nroped,
        p.Total AS total,
        p.Cant AS cant,
        LTRIM(RTRIM(p.Fechora)) AS fechora,
        LTRIM(RTRIM(p.Cliente)) AS clienteCod,
        LTRIM(RTRIM(p.Nombre)) AS clienteNombre,
        LTRIM(RTRIM(p.Empleado)) AS empleadoCod,
        LTRIM(RTRIM(ISNULL(e.Nombre, p.Empleado))) AS empleadoNombre,
        LTRIM(RTRIM(ISNULL(p.Observaciones, ''))) AS notas,
        LTRIM(RTRIM(ISNULL(p.Filler1, ''))) AS filler1
      FROM [${dbPedidos}].dbo.Pedidos p
      LEFT JOIN [${dbEmpleados}].dbo.Empleados e ON e.Cod COLLATE Modern_Spanish_CI_AS = p.Empleado COLLATE Modern_Spanish_CI_AS
      WHERE p.Tipo = 'V'
        ${sucursal ? `AND LTRIM(RTRIM(p.Sucursal)) = '${sucursal}'` : ""}
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
      ORDER BY p.Fechora ASC
    `);

    // Get items for each header
    const boletas = headers.recordset.map((h: { boleta: string }) => h.boleta);
    const itemsMap: Map<string, Array<{ sku: string; nombre: string; cantidad: number; precio: number; impo: number; lista: number }>> = new Map();

    if (boletas.length > 0) {
      const boletaList = boletas.map((b: string) => `'${b.padStart(9, " ")}'`).join(",");
      const dbProd = getDbName("productos");
      const items = await pool.request().query(`
        SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Producto)) AS sku,
          LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
          p.Cant AS cantidad,
          p.Precio AS precio,
          p.Impo AS impo,
          p.ListaPrecio AS lista
        FROM [${dbPedidos}].dbo.Pedidos p
        LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = p.Producto
        WHERE p.Tipo = 'I'
          AND p.Boleta IN (${boletaList})
        ORDER BY p.Boleta, CAST(p.Itm AS INT)
      `);

      for (const item of items.recordset) {
        const list = itemsMap.get(item.boleta) || [];
        list.push({
          sku: item.sku,
          nombre: item.nombre,
          cantidad: Number(item.cantidad),
          precio: Number(item.precio),
          impo: Number(item.impo),
          lista: Number(item.lista),
        });
        itemsMap.set(item.boleta, list);
      }
    }

    // Format response
    const pendientes = headers.recordset.map((h: Record<string, unknown>) => {
      const fechora = h.fechora as string;
      const fecha = fechora.length >= 8 ? `${(fechora as string).slice(6, 8)}/${(fechora as string).slice(4, 6)}/${(fechora as string).slice(0, 4)}` : "";
      const hora = fechora.length >= 12 ? `${(fechora as string).slice(8, 10)}:${(fechora as string).slice(10, 12)}` : "";

      return {
        boleta: h.boleta as string,
        nroped: h.nroped as string,
        total: Number(h.total),
        cant: Number(h.cant),
        fecha,
        hora,
        fechora: h.fechora as string,
        clienteCod: h.clienteCod as string,
        clienteNombre: h.clienteNombre as string,
        empleadoCod: h.empleadoCod as string,
        empleadoNombre: h.empleadoNombre as string,
        notas: h.notas as string,
        origen: (h.filler1 as string) === "POS" ? "POS" : (h.filler1 as string) === "WEB" ? "Web" : "PunTouch",
        items: itemsMap.get(h.boleta as string) || [],
      };
    });

    return NextResponse.json({ pendientes, total: pendientes.length });
  } catch (error) {
    console.error("POS pendientes error:", error);
    return NextResponse.json({ error: "Error al cargar pendientes" }, { status: 500 });
  }
}
