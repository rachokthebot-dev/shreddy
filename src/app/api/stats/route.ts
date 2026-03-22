import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

  // Today's practice time
  const todayResult = await prisma.practiceSession.aggregate({
    where: { startedAt: { gte: todayStart }, durationSec: { not: null } },
    _sum: { durationSec: true },
    _count: true,
  });

  // This week's practice time
  const weekResult = await prisma.practiceSession.aggregate({
    where: { startedAt: { gte: weekStart }, durationSec: { not: null } },
    _sum: { durationSec: true },
    _count: true,
  });

  // All time
  const allTimeResult = await prisma.practiceSession.aggregate({
    where: { durationSec: { not: null } },
    _sum: { durationSec: true },
    _count: true,
  });

  // Streak: count consecutive days with practice sessions
  const recentSessions = await prisma.practiceSession.findMany({
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
    take: 365,
  });

  let streak = 0;
  const daySet = new Set<string>();
  for (const s of recentSessions) {
    const d = s.startedAt;
    daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }

  const checkDate = new Date(todayStart);
  // Check if practiced today; if not, start from yesterday
  const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
  if (!daySet.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (daySet.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Daily breakdown for the past 7 days
  const dailyBreakdown = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayResult = await prisma.practiceSession.aggregate({
      where: {
        startedAt: { gte: dayStart, lt: dayEnd },
        durationSec: { not: null },
      },
      _sum: { durationSec: true },
    });

    dailyBreakdown.push({
      date: dayStart.toISOString().split("T")[0],
      durationSec: dayResult._sum.durationSec ?? 0,
    });
  }

  // Most practiced songs this week
  const topSongs = await prisma.practiceSession.groupBy({
    by: ["songId"],
    where: { startedAt: { gte: weekStart }, durationSec: { not: null } },
    _sum: { durationSec: true },
    _count: true,
    orderBy: { _sum: { durationSec: "desc" } },
    take: 5,
  });

  const topSongDetails = await Promise.all(
    topSongs.map(async (s) => {
      const song = await prisma.song.findUnique({
        where: { id: s.songId },
        select: { title: true, artist: true },
      });
      return {
        songId: s.songId,
        title: song?.title ?? "Unknown",
        artist: song?.artist ?? "",
        totalTimeSec: s._sum.durationSec ?? 0,
        sessionCount: s._count,
      };
    })
  );

  return NextResponse.json({
    today: {
      durationSec: todayResult._sum.durationSec ?? 0,
      sessions: todayResult._count,
    },
    week: {
      durationSec: weekResult._sum.durationSec ?? 0,
      sessions: weekResult._count,
    },
    allTime: {
      durationSec: allTimeResult._sum.durationSec ?? 0,
      sessions: allTimeResult._count,
    },
    streak,
    dailyBreakdown,
    topSongs: topSongDetails,
  });
}
