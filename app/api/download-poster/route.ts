import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "election-poster.jpg");
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Disposition": 'attachment; filename="niat-election-poster-2026.jpg"',
          "Content-Length": fileBuffer.length.toString(),
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    // Fallback: fetch from Supabase public CDN if file not on disk in serverless runtime
    const cdnUrl = "https://jfrphskbdjnokfhpshbe.supabase.co/storage/v1/object/public/media/assets/election-poster.jpg";
    const res = await fetch(cdnUrl);
    if (!res.ok) {
      return new NextResponse("Poster not found", { status: 404 });
    }
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": 'attachment; filename="niat-election-poster-2026.jpg"',
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[download-poster] error:", error);
    return new NextResponse("Error downloading poster", { status: 500 });
  }
}
