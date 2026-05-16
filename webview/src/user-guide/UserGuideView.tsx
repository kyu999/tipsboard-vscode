import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { renderBundledMarkdown } from "@/export/buildPageHtml";
import { getSupportedLanguage } from "@/shared/i18n";

import { getBundledUserGuideMarkdown } from "./bundledGuide";

export function UserGuideView() {
  const { i18n } = useTranslation();
  const lang = getSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);
  const html = useMemo(() => {
    return renderBundledMarkdown(getBundledUserGuideMarkdown(lang));
  }, [lang]);

  return (
    <section className="tb-shell flex min-h-0 flex-1 flex-col overflow-y-auto py-4 sm:py-6">
      <div className="mx-auto w-full max-w-3xl">
        <article
          className="tipsboard-user-guide tb-card px-5 py-6 sm:px-8 sm:py-8"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </section>
  );
}
