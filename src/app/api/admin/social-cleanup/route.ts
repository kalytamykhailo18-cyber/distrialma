import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
const RETENTION_DAYS = parseInt(process.env.SOCIAL_POST_RETENTION_DAYS || "7");

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const oldPosts = await prisma.socialPost.findMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (oldPosts.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, message: "No old posts to clean up" });
  }

  let igDeleted = 0;
  let fbDeleted = 0;
  const errors: string[] = [];

  for (const post of oldPosts) {
    // Delete from Instagram
    if (post.igPostId && FB_PAGE_TOKEN) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v25.0/${post.igPostId}?access_token=${FB_PAGE_TOKEN}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (data.success) igDeleted++;
        else errors.push(`IG ${post.igPostId}: ${JSON.stringify(data.error?.message || data)}`);
      } catch (e) {
        errors.push(`IG ${post.igPostId}: ${(e as Error).message}`);
      }
    }

    // Delete from Facebook
    if (post.fbPostId && FB_PAGE_TOKEN) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v25.0/${post.fbPostId}?access_token=${FB_PAGE_TOKEN}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (data.success) igDeleted++; // count
        else errors.push(`FB ${post.fbPostId}: ${JSON.stringify(data.error?.message || data)}`);
      } catch (e) {
        errors.push(`FB ${post.fbPostId}: ${(e as Error).message}`);
      }
      fbDeleted++;
    }

    // Remove from database
    await prisma.socialPost.delete({ where: { id: post.id } });
  }

  console.log(`[SOCIAL-CLEANUP] Deleted ${oldPosts.length} posts older than ${RETENTION_DAYS} days (IG: ${igDeleted}, FB: ${fbDeleted})`);

  return NextResponse.json({
    ok: true,
    retentionDays: RETENTION_DAYS,
    deleted: oldPosts.length,
    igDeleted,
    fbDeleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
