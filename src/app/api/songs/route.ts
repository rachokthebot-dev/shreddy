import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const songs = await prisma.song.findMany({
    orderBy: { createdAt: "desc" },
    include: { importJob: true },
  });
  return NextResponse.json(songs);
}
