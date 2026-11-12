"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { createMonitor, updateMonitor, type MonitorFormState } from "@/app/[locale]/dashboard/actions";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/** Add or edit a monitor: name + URL. */
export function MonitorForm({
  monitor,
  onDone,
}: {
  monitor?: { id: string; name: string; url: string };
  onDone?: () => void;
}) {
  const t = useTranslations("Dashboard");
  const editing = Boolean(monitor);
  const [state, action, pending] = useActionState<MonitorFormState, FormData>(
    editing ? updateMonitor : createMonitor,
    { status: "idle" },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const prefix = monitor ? `edit-${monitor.id}` : "add";

  // After a successful save: clear the add form, or close the edit form.
  useEffect(() => {
    if (state.status !== "saved") return;
    if (editing) onDone?.();
    else formRef.current?.reset();
  }, [state, editing, onDone]);

  const values = state.status === "error" ? state : monitor;

  return (
    <form ref={formRef} action={action} className="space-y-3" noValidate>
      {monitor && <input type="hidden" name="id" value={monitor.id} />}
      {state.status === "error" && (
        <p className="rounded-lg bg-down-bg p-3 text-sm text-down-fg" role="alert">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <label htmlFor={`${prefix}-name`} className="block text-sm font-medium">
            {t("name")}
          </label>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={100}
            placeholder={t("namePlaceholder")}
            defaultValue={values?.name ?? ""}
            key={`name-${state.status}`}
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${prefix}-url`} className="block text-sm font-medium">
            {t("url")}
          </label>
          <input
            id={`${prefix}-url`}
            name="url"
            type="url"
            inputMode="url"
            required
            placeholder={t("urlPlaceholder")}
            defaultValue={values?.url ?? ""}
            key={`url-${state.status}`}
            className={input}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60"
        >
          {editing ? t("save") : t("add")}
        </button>
        {editing && (
          <button type="button" onClick={onDone} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
