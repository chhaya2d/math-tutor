import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { questions, ocrText, analysis, userId } = await req.json();

  const db = await getDb();

  const result = await db.collection("papers").insertOne({
    questions,
    ocrText,
    analysis,
    createdBy: userId,
    createdAt: new Date(),
  });

  return NextResponse.json({ paperId: result.insertedId });
}
