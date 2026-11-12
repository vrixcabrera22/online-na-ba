import "server-only";

/** Read a required server environment variable, with a clear error if missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Honest User-Agent: names the bot and links to the page explaining it. */
export function checkerUserAgent(): string {
  // e.g. "shey/1.0 (uptime monitor; +https://online-na-ba.vercel.app/en/about)"
  return `shey/1.0 (uptime monitor; +${siteUrl()}/en/about)`;
}
