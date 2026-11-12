import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusBadge } from "@/components/status-badge";
import { localeAlternates } from "@/i18n/alternates";
import { checkerUserAgent } from "@/lib/env";
import { REPO_URL } from "@/lib/site";



export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return { title: t("metaTitle"), description: t("metaDescription"), alternates: localeAlternates(locale, "/about") };
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "About" });

  const h2 = "text-xl font-bold";
  const p = "text-muted leading-relaxed";

  return (
    <article className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-lg leading-relaxed">{t("lead")}</p>
      </header>

      <section className="space-y-3">
        <h2 className={h2}>{t("storyTitle")}</h2>
        <p className={p}>{t("story1")}</p>
        <p className={p}>{t("story2")}</p>
      </section>

      <section className="space-y-4">
        <h2 className={h2}>{t("howTitle")}</h2>
        <p className={p}>{t("how1")}</p>
        <table className="w-full overflow-hidden rounded-xl border border-border bg-surface text-sm">
          <caption className="sr-only">{t("rulesCaption")}</caption>
          <thead className="bg-background text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("ruleStatus")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("ruleMeaning")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(
              [
                ["up", "ruleUp"],
                ["slow", "ruleSlow"],
                ["down", "ruleDown"],
              ] as const
            ).map(([status, rule]) => (
              <tr key={status}>
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  <StatusBadge status={status} />
                </td>
                <td className="px-4 py-3">{t(rule)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className={`list-disc space-y-2 pl-5 ${p}`}>
          <li>{t("note4xx")}</li>
          <li>{t("noteIncident")}</li>
          <li>{t("noteUptime")}</li>
        </ul>
      </section>

      {/* The checker's User-Agent links here, so site admins land on this. */}
      <section id="bot" className="space-y-3">
        <h2 className={h2}>{t("gentleTitle")}</h2>
        <ul className={`list-disc space-y-2 pl-5 ${p}`}>
          <li>{t("gentle1")}</li>
          <li>{t("gentle2")}</li>
          <li>{t("gentle3")}</li>
        </ul>
        <p className={p}>{t("gentle4")}</p>
        <code className="block overflow-x-auto rounded-lg bg-surface px-4 py-3 text-sm border border-border">
          {checkerUserAgent()}
        </code>
        <p className={p}>
          {t("botNote")}{" "}
          <a href={`${REPO_URL}/issues`} className="font-medium text-accent hover:underline" rel="noopener noreferrer">
            GitHub Issues
          </a>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2}>{t("faqTitle")}</h2>
        <dl className="space-y-4">
          {([1, 2, 3, 4] as const).map((n) => (
            <div key={n}>
              <dt className="font-semibold">{t(`faq${n}q`)}</dt>
              <dd className={`mt-1 ${p}`}>{t(`faq${n}a`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-bold">{t("disclaimerTitle")}</h2>
        <p className={p}>{t("disclaimer")}</p>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>{t("sourceTitle")}</h2>
        <p className={p}>
          {t("source")}{" "}
          <a href={REPO_URL} className="font-medium text-accent hover:underline" rel="noopener noreferrer">
            {t("sourceLink")} ↗
          </a>
        </p>
      </section>
    </article>
  );
}
