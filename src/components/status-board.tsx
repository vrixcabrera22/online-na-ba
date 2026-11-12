import { getTranslations } from "next-intl/server";
import { CATEGORY_ORDER, getStatusBoard } from "@/lib/status";
import { SiteCard } from "./site-card";
import { StatusIcon } from "./status-badge";

/** Summary line + site cards grouped by category. */
export async function StatusBoard({ locale }: { locale: string }) {
  const [sites, t, tc] = await Promise.all([
    getStatusBoard(),
    getTranslations({ locale, namespace: "Home" }),
    getTranslations({ locale, namespace: "Categories" }),
  ]);

  if (sites.length === 0) {
    return <p className="rounded-xl border border-border bg-surface p-6 text-muted">{t("empty")}</p>;
  }

  // "Online" here means reachable: up or slow.
  const online = sites.filter((s) => s.status === "up" || s.status === "slow").length;
  const total = sites.length;
  const allOnline = online === total;

  return (
    <div className="space-y-8">
      <p
        className={`flex items-center gap-2 rounded-xl px-4 py-3 font-semibold ${
          allOnline ? "bg-up-bg text-up-fg" : "bg-slow-bg text-slow-fg"
        }`}
      >
        <StatusIcon status={allOnline ? "up" : "slow"} className="size-5 shrink-0" />
        {allOnline ? t("summaryAll", { total }) : t("summary", { online, total })}
      </p>

      {CATEGORY_ORDER.map((category) => {
        const inCategory = sites.filter((s) => s.category === category);
        if (inCategory.length === 0) return null;
        return (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <h2 id={`cat-${category}`} className="mb-3 text-lg font-bold">
              {tc(category)}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inCategory.map((site) => (
                <SiteCard key={site.id} site={site} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Placeholder with the same shape while data loads. */
export function StatusBoardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-xl bg-unknown-bg" />
      {[5, 5, 2, 3].map((n, i) => (
        <div key={i}>
          <div className="mb-3 h-6 w-48 animate-pulse rounded bg-unknown-bg" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: n }, (_, j) => (
              <div key={j} className="h-36 animate-pulse rounded-xl bg-unknown-bg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
