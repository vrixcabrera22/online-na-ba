import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <div className="space-y-4 py-12 text-center">
      <p className="text-5xl font-bold text-muted">404</p>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <Link href="/" className="inline-block font-medium text-accent hover:underline">
        {t("home")}
      </Link>
    </div>
  );
}
