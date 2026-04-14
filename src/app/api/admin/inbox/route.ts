import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: list chats or get messages for a specific chat
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");

  try {
    if (chatId) {
      // Get messages for a specific chat
      const messages = await prisma.whatsAppMessage.findMany({
        where: { chatId },
        orderBy: { timestamp: "asc" },
        take: 100,
      });

      // Mark as read
      await prisma.whatsAppChat.update({
        where: { chatId },
        data: { unread: 0 },
      });

      return NextResponse.json({ messages });
    }

    // List all chats
    const search = searchParams.get("search") || "";
    const chats = await prisma.whatsAppChat.findMany({
      where: search ? {
        OR: [
          { contactName: { contains: search, mode: "insensitive" } },
          { contactPhone: { contains: search } },
          { lastMessage: { contains: search, mode: "insensitive" } },
        ],
      } : undefined,
      orderBy: { lastMessageAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Inbox error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: send a message through the bot
export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { chatId, message } = await req.json();
    if (!chatId || !message) {
      return NextResponse.json({ error: "chatId y message requeridos" }, { status: 400 });
    }

    // Send via bot's HTTP server
    const res = await fetch("http://127.0.0.1:3099/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.error || "Error al enviar" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Inbox send error:", error);
    return NextResponse.json({ error: "Error al enviar mensaje" }, { status: 500 });
  }
}
