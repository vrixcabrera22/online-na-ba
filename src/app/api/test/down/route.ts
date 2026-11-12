import { connection } from "next/server";

/**
 * Always "down" (HTTP 503). For testing alerts end to end: point a monitor
 * here, and after 2 checks (~10 min) its owner gets a "down" email; point it
 * back at /api/test/up for the "back up" email.
 */
export async function GET() {
  await connection(); // run on every request (never prerendered/cached)
  return new Response("Service Unavailable (test endpoint)", {
    status: 503,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
