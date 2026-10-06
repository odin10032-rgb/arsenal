/**
 * Arsenal Tools — informations légales partagées (source unique de vérité).
 *
 * Toutes les pages légales utilisent CES valeurs : jamais de société inventée,
 * jamais d'adresse inventée. Les informations manquantes pour être juridiquement
 * complet sont marquées « [À COMPLÉTER] » et listées dans le rapport final.
 */

export const LEGAL = {
  /** Nom du projet. */
  siteName: "Arsenal Tools",
  /** Créateur et exploitant — PERSONNE PHYSIQUE, pas une société (§20). */
  editor: "Florian BOKO",
  /** Contact professionnel de l'éditeur. */
  editorEmail: "florianboko@hotmail.com",
  /** Contact officiel d'Arsenal Tools. */
  siteEmail: "arsenaltools.services@hotmail.com",
  /** Adresse publique du site. */
  siteUrl: "https://arsenal-tools.pages.dev/",
  /** Date affichée sur chaque document (spec pages légales). */
  updatedAt: "5 octobre 2026",
  /** Hébergeur réellement utilisé (vérifié : Cloudflare Pages + Workers + D1). */
  host: {
    name: "Cloudflare, Inc.",
    /** Adresse officielle publiée par Cloudflare (politique de confidentialité). */
    address: "101 Townsend St, San Francisco, CA 94107, États-Unis",
    site: "https://www.cloudflare.com/",
    /**
     * Localisation RÉELLE du backend (vérifiée via l'API Cloudflare le 06/10) :
     * la base principale est servie par la région « WEUR » (Europe de l'Ouest),
     * centre de données de Marseille (France).
     */
    region: "Europe de l'Ouest — centre de données de Marseille (France)",
  },
} as const;

/** Placeholder visible pour une information obligatoire non encore fournie. */
export function TODO_LABEL(what: string): string {
  return `[À COMPLÉTER — ${what}]`;
}
