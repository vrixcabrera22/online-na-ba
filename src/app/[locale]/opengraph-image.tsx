import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { LOGO_ASPECT, LOGO_DARK_DATA_URI } from "@/lib/brand";
import { getStatusBoard } from "@/lib/status";

// Link preview for Facebook, Reddit, Messenger, etc. Applies to every page
// under /[locale] that doesn't define its own. Rebuilt with the status cache,
// so the "X of 15 online" line stays current.
export const alt = "Online Na Ba? — Philippine government website status";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, sites] = await Promise.all([getTranslations({ locale, namespace: "Home" }), getStatusBoard()]);
  const online = sites.filter((s) => s.status === "up" || s.status === "slow").length;
  const total = sites.length;
  const summary = online === total ? t("summaryAll", { total }) : t("summary", { online, total });
  const allOk = online === total;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0f172a",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
        <img src={LOGO_DARK_DATA_URI} width={Math.round(56 * LOGO_ASPECT)} height={56} alt="Online Na Ba?" />
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.1, maxWidth: 1000 }}>{t("title")}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 36,
              fontWeight: 700,
              color: allOk ? "#4ade80" : "#fbbf24",
            }}
          >
            <div style={{ display: "flex", width: 22, height: 22, borderRadius: 999, background: allOk ? "#22c55e" : "#f59e0b" }} />
            {summary}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#94a3b8" }}>online-na-ba.vercel.app</div>
      </div>
    ),
    size,
  );
}
