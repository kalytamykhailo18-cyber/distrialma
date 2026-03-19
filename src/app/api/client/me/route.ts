import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = session.user as { name?: string; role?: string; clientId?: string };

  // Admin users don't have client records in SQL Server
  if (user.role === "admin") {
    return NextResponse.json({
      name: user.name,
      role: user.role,
      deliveryDay: null,
    });
  }

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const result = await pool
      .request()
      .input("cod", user.clientId)
      .query(
        `SELECT LTRIM(RTRIM(c.Nombre)) AS nombre,
                LTRIM(RTRIM(c.Calle)) AS calle,
                LTRIM(RTRIM(c.Nume)) AS numero,
                LTRIM(RTRIM(c.TelClave1)) AS tel1,
                LTRIM(RTRIM(c.Telclave3)) AS celular,
                LTRIM(RTRIM(ISNULL(z.[Desc], ''))) AS zona
         FROM [${dbClientes}].dbo.Clientes c
         LEFT JOIN [${dbClientes}].dbo.Zonas z ON z.Cod = c.Zona
         WHERE LTRIM(RTRIM(c.Cod)) = @cod
           AND (c.DeBaja = 0 OR c.DeBaja IS NULL)`
      );

    if (result.recordset.length === 0) {
      return NextResponse.json({
        name: user.name,
        role: user.role,
        deliveryDay: null,
      });
    }

    const client = result.recordset[0];
    return NextResponse.json({
      name: client.nombre,
      role: user.role,
      address: [client.calle, client.numero].filter(Boolean).join(" "),
      phone: client.celular || client.tel1 || "",
      deliveryDay: client.zona || null,
    });
  } catch (error) {
    console.error("Error fetching client info:", error);
    return NextResponse.json(
      { error: "Error al obtener datos del cliente" },
      { status: 500 }
    );
  }
}
