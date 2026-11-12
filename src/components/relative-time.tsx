"use client";

import { useFormatter } from "next-intl";
import { useEffect, useState } from "react";

/**
 * "5 minuto ang nakalipas" / "5 minutes ago", kept up to date every 30 s.
 *
 * The server can't know the visitor's "now" when the page is cached, so the
 * first render shows the absolute Manila time; the relative text takes over
 * once the page is running in the browser.
 */
export function RelativeTime({ date }: { date: string }) {
  const format = useFormatter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Syncing with an external system (the clock), so setState here is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const d = new Date(date);
  const absolute = format.dateTime(d, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <time dateTime={date} title={absolute}>
      {now === null ? absolute : format.relativeTime(d, now)}
    </time>
  );
}
