"use client";

/**
 * Cookies et stockage local — page de transparence (créée le 05/10).
 *
 * AUDIT RÉEL du site : AUCUN cookie n'est utilisé (aucun document.cookie dans
 * le code). Seul le stockage local du navigateur (localStorage) est employé,
 * pour des finalités strictement nécessaires ou de préférence. Aucun traceur
 * publicitaire, aucun outil d'analytics tiers. → Aucune bannière de
 * consentement n'est donc nécessaire.
 */

import Link from "next/link";
import { LegalList, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies et stockage local"
      currentPath="/cookies/"
      lead="Arsenal Tools n'utilise aucun cookie. Cette page explique ce qui est réellement stocké dans votre navigateur, et pourquoi."
      sections={[
        {
          id: "pas-de-cookies",
          title: "Aucun cookie, aucun traceur publicitaire",
          body: (
            <>
              <p>
                Le site ne dépose <strong className="text-tx1">aucun cookie</strong> et
                n&apos;utilise aucun outil d&apos;analyse tiers ni traceur publicitaire.
                C&apos;est pourquoi aucune bannière de consentement aux cookies
                n&apos;apparaît : il n&apos;y a rien à consentir.
              </p>
              <p>
                Le comptage d&apos;audience du site est interne et sans cookie : il
                repose sur des empreintes cryptographiques calculées côté serveur, sans
                conservation d&apos;adresse IP en clair.
              </p>
            </>
          ),
        },
        {
          id: "necessaires",
          title: "Stockage strictement nécessaire",
          body: (
            <>
              <p>
                Ces éléments sont stockés dans votre navigateur (localStorage) et
                indispensables au fonctionnement :
              </p>
              <LegalList
                items={[
                  "jeton de session — vous maintient connecté ;",
                  "panier — conserve votre panier entre deux visites ;",
                  "jeton visiteur anonyme — relie votre panier et votre parcours d'achat tant que vous n'êtes pas connecté ;",
                  "cache du catalogue — affiche le catalogue instantanément à chaque visite.",
                ]}
              />
            </>
          ),
        },
        {
          id: "preferences",
          title: "Préférences d'affichage",
          body: (
            <LegalList
              items={[
                "langue choisie (français / anglais) ;",
                "thème choisi (clair, sombre ou système) ;",
                "mémorisation de certaines invitations déjà vues, pour ne pas les répéter.",
              ]}
            />
          ),
        },
        {
          id: "gestion",
          title: "Comment les effacer",
          body: (
            <>
              <p>
                Vous pouvez à tout moment vider le stockage local depuis les réglages de
                votre navigateur. Conséquence : vous serez déconnecté, votre panier sera
                oublié et vos préférences d&apos;affichage reviendront aux valeurs par
                défaut. Aucune autre donnée du site n&apos;est concernée.
              </p>
              <p>
                Pour en savoir plus sur les données réellement traitées par le site,
                consultez la{" "}
                <Link href="/confidentialite/" className="text-teal underline-offset-4 hover:underline">
                  politique de confidentialité
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Toute question relative à cette page :{" "}
              <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                {LEGAL.siteEmail}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
