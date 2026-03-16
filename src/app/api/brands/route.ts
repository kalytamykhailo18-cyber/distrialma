import { NextResponse } from "next/server";
import { getBrands } from "@/lib/queries";

export async function GET() {
  try {
    const brands = await getBrands();
    return NextResponse.json(brands);
  } catch (error) {
    console.error("Error fetching brands:", error);
    return NextResponse.json(
      { error: "Error al cargar marcas" },
      { status: 500 }
    );
  }
}
