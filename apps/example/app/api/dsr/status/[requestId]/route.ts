import { NextRequest } from "next/server";
import { dsrHandlers } from "@/lib/dsr";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  return dsrHandlers.handleStatus(_req, requestId);
}
