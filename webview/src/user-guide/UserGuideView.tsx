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
    <section className="tb-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto py-4 sm:py-6">
      <div className="relative mx-auto w-full min-w-0 max-w-5xl">
        <article className="tipsboard-user-guide tb-editor-surface" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </section>
  );
}
