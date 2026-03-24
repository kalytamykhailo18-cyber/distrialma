import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { requireStaff } from "@/lib/api-auth";

const db = () => getDbName("productos");

export async function POST() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();

    // Fetch all visible products with their current prices from SQL Server
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        s.Precio AS precio,
        s.Precio2 AS precio2,
        s.Precio4 AS precio4
      FROM [${db()}].dbo.Productos p
      JOIN [${db()}].dbo.Stock s ON s.CodProducto = p.Cod
      WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND s.Precio2 > 0
    `);

    const products = result.recordset as {
      sku: string;
      name: string;
      precio: number;
      precio2: number;
      precio4: number;
    }[];

    // Get existing snapshots
    const snapshots = await prisma.priceSnapshot.findMany();
    const snapshotMap = new Map(snapshots.map((s) => [s.sku, s]));

    const changes: {
      sku: string;
      name: string;
      field: string;
      oldPrice: Decimal;
      newPrice: Decimal;
    }[] = [];

    const upserts: Promise<unknown>[] = [];

    for (const p of products) {
      const existing = snapshotMap.get(p.sku);
      const newPrecio = new Decimal(p.precio);
      const newPrecio2 = new Decimal(p.precio2);
      const newPrecio4 = new Decimal(p.precio4);

      if (existing) {
        // Compare prices
        if (!existing.precio.equals(newPrecio)) {
          changes.push({
            sku: p.sku,
            name: p.name,
            field: "precio",
            oldPrice: existing.precio,
            newPrice: newPrecio,
          });
        }
        if (!existing.precio2.equals(newPrecio2)) {
          changes.push({
            sku: p.sku,
            name: p.name,
            field: "precio2",
            oldPrice: existing.precio2,
            newPrice: newPrecio2,
          });
        }
        if (!existing.precio4.equals(newPrecio4)) {
          changes.push({
            sku: p.sku,
            name: p.name,
            field: "precio4",
            oldPrice: existing.precio4,
            newPrice: newPrecio4,
          });
        }
      }
      // First scan: no changes logged, just snapshot

      // Upsert snapshot
      upserts.push(
        prisma.priceSnapshot.upsert({
          where: { sku: p.sku },
          update: {
            precio: newPrecio,
            precio2: newPrecio2,
            precio4: newPrecio4,
            takenAt: new Date(),
          },
          create: {
            sku: p.sku,
            precio: newPrecio,
            precio2: newPrecio2,
            precio4: newPrecio4,
          },
        })
      );
    }

    // Batch upserts in chunks of 50
    for (let i = 0; i < upserts.length; i += 50) {
      await Promise.all(upserts.slice(i, i + 50));
    }

    // Insert changes
    if (changes.length > 0) {
      await prisma.priceChange.createMany({
        data: changes.map((c) => ({
          sku: c.sku,
          name: c.name,
          field: c.field,
          oldPrice: c.oldPrice,
          newPrice: c.newPrice,
        })),
      });
    }

    return NextResponse.json({
      scanned: products.length,
      changes: changes.length,
      isFirstScan: snapshots.length === 0,
    });
  } catch (error) {
    console.error("Price scan error:", error);
    return NextResponse.json(
      { error: "Error al escanear precios" },
      { status: 500 }
    );
  }
}
