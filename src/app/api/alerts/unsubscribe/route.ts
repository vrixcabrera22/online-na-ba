import { NextResponse, type NextRequest } from "next/server";
import { setAlertSettingEnabled } from "@/lib/alerts/unsubscribe";

/**
 * One-click unsubscribe (RFC 8058). Gmail/Outlook show an "Unsubscribe"
 * button for alert emails and POST here; the link's signature authorizes it.
 */
export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const ok = await setAlertSettingEnabled(id, token, false);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

/** A plain visit goes to the confirmation page instead of unsubscribing. */
export async function GET(request: NextRequest) {
  const url = new URL("/fil/unsubscribe", request.nextUrl.origin);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}
