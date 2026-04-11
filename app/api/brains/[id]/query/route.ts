import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import { readAllPages, writePage, rebuildIndex, appendLog } from "@/lib/wiki-fs";
import { llm } from "@/lib/llm";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const body = await request.json();
    const { question, saveAsPage = false } = body;

    if (!question) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 }
      );
    }

    const pages = readAllPages(brain.path);
    const wikiContext = pages
      .map(
        (p) =>
          `## ${p.title} (${p.type})\n${p.content}`
      )
      .join("\n\n---\n\n");

    const system = `You are a research assistant with access to a knowledge wiki about "${brain.topic}". Answer questions using the wiki content provided. Cite specific pages using [[Page Title]] syntax. If the wiki doesn't cover something, say so.`;
    const prompt = `Wiki content:\n\n${wikiContext}\n\n---\n\nQuestion: ${question}`;

    const response = await llm(system, prompt, 4096);
    appendLog(brain.path, "query", `Question: ${question.slice(0, 100)}`);

    let savedAsPage: string | null = null;

    if (saveAsPage) {
      const pageId =
        "query-" +
        question
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50);

      writePage(brain.path, {
        id: pageId,
        title: `Query: ${question.slice(0, 80)}`,
        type: "analysis",
        content: response.text,
        links: [],
        sources: [],
      });

      rebuildIndex(brain.path, brain.topic);
      appendLog(brain.path, "save", `Saved query as page: ${pageId}`);
      savedAsPage = pageId;
    }

    return NextResponse.json({ answer: response.text, savedAsPage });
  } catch (error: any) {
    console.error("Query error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to query brain" },
      { status: 500 }
    );
  }
}
