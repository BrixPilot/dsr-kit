import { NextRequest } from "next/server";
import { dsrHandlers } from "@/lib/dsr";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return dsrHandlers.handleProof(_req, id);
}
