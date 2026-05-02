import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { runToolCall } from "@/lib/llmTools";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

export const dynamic = "force-dynamic";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const attemptDateFilterProps = {
  last_days: {
    type: "integer",
    minimum: 1,
    maximum: 366,
    description:
      "If set, only attempts from the last N calendar days (UTC) are included. Takes precedence over from_date/to_date.",
  },
  from_date: {
    type: "string",
    description:
      "Inclusive start date YYYY-MM-DD (UTC midnight). Use with to_date or alone (to end of today UTC).",
  },
  to_date: {
    type: "string",
    description:
      "Inclusive end date YYYY-MM-DD (UTC end of day). Use with from_date or alone (from epoch).",
  },
} as const;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_my_attempts",
      description:
        "Fetch recent quiz attempts for the logged-in student. Optionally filter by subject (English/Maths/Science), class 1-8, and a date window (last_days or from_date/to_date YYYY-MM-DD UTC).",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            enum: ["English", "Maths", "Science"],
            description:
              "If set, only attempts for this subject are returned.",
          },
          classLevel: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "If set, filter by paper class.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 40,
            description: "Max rows (default 15).",
          },
          ...attemptDateFilterProps,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_my_performance",
      description:
        "Summarize quiz attempt counts and score percentages; optional subject, class, and date window (last_days or from_date/to_date).",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            enum: ["English", "Maths", "Science"],
          },
          classLevel: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "If set, filter by paper class.",
          },
          ...attemptDateFilterProps,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_learning_insights",
      description:
        "Per-topic accuracy in a date window (or all time): strongest and weakest topics and short practice suggestions. Use when the student asks about strengths, weaknesses, what to revise, trends by topic, or performance over the last days/week/month. Same filters as list_my_attempts.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            enum: ["English", "Maths", "Science"],
          },
          classLevel: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "If set, filter by paper class.",
          },
          ...attemptDateFilterProps,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_feedback",
      description:
        "Save free-text feedback or bug reports linked to this user. Only call after the user clearly asked to send feedback.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Feedback text from user." },
          category: {
            type: "string",
            description: "Short label e.g. bug, content, ux, general",
          },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
  },
];

const MAX_TOOL_ROUNDS = 6;

export async function POST(req: Request) {
  const session = await getServerSession();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string; debug?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userMsg = String(body.message || "").trim();
  if (!userMsg) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a helpful tutor coach for math-olympiad.app. You only see data returned from tools — always call tools when the user asks about past quizzes, scores, subjects, classes, strengths/weaknesses by topic, trends, date ranges ("last week", specific dates), or to save feedback. For topic-level strengths/weaknesses and revision advice in a period, prefer get_learning_insights (pass last_days or from_date/to_date as YYYY-MM-DD). Use summarize_my_performance for overall averages; list_my_attempts for raw attempt rows. Keep answers concise. Never invent attempts or scores.`,
    },
    { role: "user", content: userMsg },
  ];

  let toolCallsLog: Array<{
    name: string;
    args: Record<string, unknown>;
    rawArgs: string;
  }> = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: process.env.LLM_TOOLS_MODEL || "gpt-4o-mini",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) {
      return NextResponse.json(
        { error: "Empty model response" },
        { status: 500 }
      );
    }

    if (!choice.tool_calls?.length) {
      return NextResponse.json({
        reply: choice.content ?? "",
        ...(body.debug ? { toolCallsUsed: toolCallsLog } : {}),
      });
    }

    messages.push(choice);

    for (const tc of choice.tool_calls) {
      if (tc.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      console.log("[llm/chat] model requested tool call", {
        round: round + 1,
        tool: tc.function.name,
        toolCallId: tc.id,
        arguments: args,
        userId: userEmail,
      });

      toolCallsLog.push({
        name: tc.function.name,
        args,
        rawArgs: tc.function.arguments ?? "",
      });

      const result = await runToolCall(
        tc.function.name,
        args,
        userEmail,
        userEmail
      );

      console.log("[llm/chat] tool result", {
        tool: tc.function.name,
        toolCallId: tc.id,
        resultChars: result.length,
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  return NextResponse.json(
    {
      error: "Tool loop limit reached",
      ...(body.debug ? { toolCallsUsed: toolCallsLog } : {}),
    },
    { status: 500 }
  );
}
