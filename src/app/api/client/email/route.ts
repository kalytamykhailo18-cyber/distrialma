import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const user = session.user as { clientId?: string; role?: string };
  if (user.role === "admin" || user.role === "staff" || !user.clientId) {
    return NextResponse.json({ error: "Solo clientes" }, { status: 403 });
  }

  try {
    const { email } = await req.json();
    const clean = (email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    if (clean.length > 100) {
      return NextResponse.json({ error: "Email demasiado largo" }, { status: 400 });
    }

    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const result = await pool.request()
      .input("cod", user.clientId)
      .input("email", clean)
      .query(`UPDATE [${dbClientes}].dbo.Clientes
              SET Email = @email
              WHERE LTRIM(RTRIM(Cod)) = @cod`);

    if ((result.rowsAffected[0] || 0) === 0) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, email: clean });
  } catch (e) {
    console.error("client/email POST error:", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
