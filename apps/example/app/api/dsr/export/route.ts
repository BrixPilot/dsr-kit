import { NextRequest } from "next/server";
import { dsrHandlers, type DsrRequest } from "@/lib/dsr";

export async function POST(req: NextRequest) {
  try {
    return await dsrHandlers.handleExport(req as unknown as DsrRequest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("Identity verification") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
