"use client";

import { LANGUAGES, useI18n } from "@/lib/i18n";

/**
 * Sélecteur de langue (footer) — deux petits boutons mono « FR » / « EN »,
 * la langue active soulignée d'un filet rouge Arsenal. Volontairement sobre.
 * Racine en <span> : le composant vit dans le <p> flex des liens légaux
 * (un <div> casserait le parsing HTML et l'hydratation).
 */
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();

  return (
    <span
      role="group"
      aria-label={t("lang_switch_aria")}
      title={t("lang_switch_aria")}
      className="inline-flex items-center gap-1.5"
    >
      {LANGUAGES.map(({ code, label }) => {
        const active = code === lang;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`cursor-pointer font-mono text-[0.72rem] leading-none transition-colors ${
              active
                ? "text-[#f0f0f0] underline decoration-[#e63946] decoration-[1.5px] underline-offset-[3px]"
                : "text-[#666] hover:text-[#f0f0f0]"
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </span>
  );
}
