"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { signIn, signInDemo, signUp, type AuthFormState } from "@/app/[locale]/(auth)/actions";
import { Link } from "@/i18n/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-helpers";

/** Email + password form, used for both log in and sign up. */
export function AuthForm({ mode, notice }: { mode: "login" | "signup"; notice?: string }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    mode === "login" ? signIn : signUp,
    { status: "idle" },
  );

  if (state.status === "check-email") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6" role="status">
        <h2 className="text-lg font-bold">{t("checkEmailTitle")}</h2>
        <p className="mt-2 text-muted">{t("checkEmail", { email: state.email })}</p>
      </div>
    );
  }

  const email = state.status === "error" ? state.email : "";
  const errorId = "auth-error";

  return (
    <div className="space-y-4">
    <form action={action} className="space-y-4 rounded-xl border border-border bg-surface p-6" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {notice && (
        <p className="rounded-lg bg-up-bg p-3 text-sm text-up-fg" role="status">
          {notice}
        </p>
      )}
      {state.status === "error" && (
        <p id={errorId} className="rounded-lg bg-down-bg p-3 text-sm text-down-fg" role="alert">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={email}
          aria-describedby={state.status === "error" ? errorId : undefined}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          {t("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
          aria-describedby={mode === "signup" ? "password-hint" : undefined}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        {mode === "signup" && (
          <p id="password-hint" className="text-xs text-muted">
            {t("passwordHint")}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background disabled:opacity-60"
      >
        {pending ? t("pending") : mode === "login" ? t("loginButton") : t("signupButton")}
      </button>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? t("noAccount") : t("haveAccount")}{" "}
        <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-accent hover:underline">
          {mode === "login" ? t("signupLink") : t("loginLink")}
        </Link>
      </p>
    </form>

    {mode === "login" && (
      <form action={signInDemo} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border p-4">
        <input type="hidden" name="locale" value={locale} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{t("demoTitle")}</p>
          <p className="text-muted">{t("demoBody")}</p>
        </div>
        <button type="submit" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-unknown-bg">
          {t("demoButton")}
        </button>
      </form>
    )}
    </div>
  );
}
