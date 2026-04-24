import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const db = await getDb();

  await db.collection("attempts").insertOne({
    userId: body.userId,
    paperId: body.paperId,
    responses: body.responses,
    score: body.score,
    totalMarks: 45,
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true });
}
