import { useTranslations } from "next-intl";
import type { DisplayStatus } from "@/lib/format";

/** A display status, or "paused" for personal monitors that are switched off. */
export type BadgeStatus = DisplayStatus | "paused";

const STYLES: Record<BadgeStatus, string> = {
  up: "bg-up-bg text-up-fg",
  slow: "bg-slow-bg text-slow-fg",
  down: "bg-down-bg text-down-fg",
  unknown: "bg-unknown-bg text-unknown-fg",
  paused: "bg-unknown-bg text-unknown-fg",
};

/** Status pill: icon + translated label (Online / Mabagal / Hindi ma-access). */
export function StatusBadge({
  status,
  size = "sm",
}: {
  status: BadgeStatus;
  size?: "sm" | "lg";
}) {
  const t = useTranslations("Status");
  const sizing = size === "lg" ? "gap-2 px-3 py-1.5 text-base" : "gap-1.5 px-2.5 py-1 text-sm";

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sizing} ${STYLES[status]}`}>
      <StatusIcon status={status} className={size === "lg" ? "size-5" : "size-4"} />
      {t(status)}
    </span>
  );
}

export function StatusIcon({ status, className }: { status: BadgeStatus; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 20 20",
    fill: "currentColor",
    "aria-hidden": true,
  } as const;

  switch (status) {
    case "up": // check in a circle
      return (
        <svg {...common}>
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "slow": // clock
      return (
        <svg {...common}>
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "down": // x in a circle
      return (
        <svg {...common}>
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "paused": // pause in a circle
      return (
        <svg {...common}>
          <path
            fillRule="evenodd"
            d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Zm4 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Z"
            clipRule="evenodd"
          />
        </svg>
      );
    default: // question mark in a circle
      return (
        <svg {...common}>
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        </svg>
      );
  }
}
