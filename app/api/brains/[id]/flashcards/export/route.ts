import { getBrain } from "@/lib/config";
import { exportFlashcardsToAnkiCSV } from "@/lib/wiki-fs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return new Response(JSON.stringify({ error: "Brain not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const csv = exportFlashcardsToAnkiCSV(brain.path);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="flashcards-${params.id}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("Flashcard export error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to export flashcards",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
