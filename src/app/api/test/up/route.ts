import { connection } from "next/server";

/** Always "up" (HTTP 200). Counterpart of /api/test/down for alert testing. */
export async function GET() {
  await connection(); // run on every request (never prerendered/cached)
  return new Response("OK (test endpoint)", {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
