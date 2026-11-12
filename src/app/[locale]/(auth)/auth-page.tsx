import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Shared shell for /login and /signup. The heading renders immediately; the
 * part that reads cookies and the URL (already signed in? just confirmed?)
 * streams in behind Suspense.
 */
export async function AuthPage({
  mode,
  locale,
  searchParams,
}: {
  mode: "login" | "signup";
  locale: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations({ locale, namespace: "Auth" });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{mode === "login" ? t("loginTitle") : t("signupTitle")}</h1>
        {mode === "signup" && <p className="text-muted">{t("signupIntro")}</p>}
      </header>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-unknown-bg" />}>
        <AuthPageBody mode={mode} locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AuthPageBody({
  mode,
  locale,
  searchParams,
}: {
  mode: "login" | "signup";
  locale: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, params, t] = await Promise.all([
    getCurrentUser(),
    searchParams,
    getTranslations({ locale, namespace: "Auth" }),
  ]);
  if (user) redirect({ href: "/dashboard", locale });

  const notice =
    params.confirmed === "1" ? t("confirmed") : params.confirm === "failed" ? t("confirmFailed") : undefined;

  return <AuthForm mode={mode} notice={notice} />;
}
