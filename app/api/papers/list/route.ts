import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    const db = await getDb();

    const papers = await db.collection("papers").find().toArray();
    const attempts = await db
      .collection("attempts")
      .find({ userId })
      .toArray();

    const attemptedMap = new Map(
      attempts.map((a) => [a.paperId.toString(), a.score])
    );

    const result = papers.map((p) => ({
      ...p,
      attempted: attemptedMap.has(p._id.toString()),
      score: attemptedMap.get(p._id.toString()) || null,
    }));

    return NextResponse.json(
      { data: result },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("papers/list error:", error);
    return NextResponse.json(
      { error: "Failed to load papers" },
      { status: 500 }
    );
  }
}
