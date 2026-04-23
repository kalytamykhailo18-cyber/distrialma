import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Reset difusion dedup logs for EMPLEADOS zone clients (testing)
export async function POST() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const deleted = await prisma.notificationLog.deleteMany({
    where: {
      tipo: "difusion",
      clientId: { in: ["897", "14137"] }, // Gaston + Ceci uso interno
    },
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
