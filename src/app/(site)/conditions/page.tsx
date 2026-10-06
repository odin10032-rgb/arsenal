"use client";

/**
 * Conditions générales d'utilisation (CGU) — règles d'usage du site.
 * Contenu rédigé d'après le fonctionnement RÉEL du service. Si l'admin a sa
 * propre version (Paramètres → Pages légales), elle remplace ce contenu.
 */

import { LegalList, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";
import { useLegalOverride } from "@/lib/legal-override";

export default function ConditionsPage() {
  const override = useLegalOverride("terms");
  if (override) {
    return (
      <LegalPage
        title="Conditions générales d'utilisation"
        currentPath="/conditions/"
        sections={[
          { id: "contenu", title: "Contenu", body: <p className="whitespace-pre-line">{override}</p> },
        ]}
      />
    );
  }

  return (
    <LegalPage
      title="Conditions générales d'utilisation"
      currentPath="/conditions/"
      lead="En utilisant Arsenal Tools, vous acceptez les règles ci-dessous. Elles sont volontairement rédigées pour être compréhensibles, pas pour être dissuasives."
      sections={[
        {
          id: "objet",
          title: "Objet du service",
          body: (
            <p>
              Arsenal Tools est un catalogue de produits numériques (ressources,
              applications, formations, outils) sélectionnés et proposés par l&apos;éditeur.
              Le site permet de découvrir ces produits, d&apos;en acheter certains et de
              participer à un programme d&apos;affiliation.
            </p>
          ),
        },
        {
          id: "acces",
          title: "Accès au site",
          body: (
            <p>
              L&apos;accès au catalogue est libre. Certaines fonctionnalités (achat,
              affiliation, espace personnel) nécessitent un compte. Le site peut évoluer,
              être suspendu temporairement pour maintenance, ou certaines fonctionnalités
              peuvent être modifiées — sans que cela ouvre droit à indemnité.
            </p>
          ),
        },
        {
          id: "compte",
          title: "Création de compte",
          body: (
            <LegalList
              items={[
                "vous fournissez un pseudo, une adresse email valide et un mot de passe ;",
                "vous êtes responsable de l'exactitude des informations fournies ;",
                "un seul compte par personne ; la création de comptes multiples pour contourner les règles (plafonds, récompenses, attribution des ventes) est interdite.",
              ]}
            />
          ),
        },
        {
          id: "securite-compte",
          title: "Sécurité du compte",
          body: (
            <p>
              Vous êtes responsable de la confidentialité de votre mot de passe et de
              l&apos;usage fait depuis votre compte. En cas d&apos;accès non autorisé, vous
              êtes invité à modifier votre mot de passe et à nous contacter immédiatement.
            </p>
          ),
        },
        {
          id: "usage",
          title: "Utilisation acceptable",
          body: (
            <LegalList
              items={[
                "utiliser le site conformément à sa destination : découvrir, acheter et recommander des produits numériques ;",
                "ne pas porter atteinte au fonctionnement du service ni à l'expérience des autres utilisateurs ;",
                "ne pas publier de contenus illicites, trompeurs ou malveillants dans les espaces qui en permettent l'usage.",
              ]}
            />
          ),
        },
        {
          id: "fraude",
          title: "Fraude, abus et contournement",
          body: (
            <>
              <p>Sont strictement interdits :</p>
              <LegalList
                items={[
                  "toute fraude (fausses ventes, faux clics, manipulation des mécanismes d'attribution) ;",
                  "les achats réalisés par un affilié via son propre lien pour s'attribuer une commission (auto-achat) ;",
                  "le contournement des mécanismes de sécurité, des plafonds ou des limites anti-abus ;",
                  "l'utilisation de moyens automatisés pour gonfler artificiellement des chiffres ;",
                  "l'usurpation de l'identité d'Arsenal Tools ou de ses représentants.",
                ]}
              />
              <p>
                Ces manquements peuvent entraîner la suspension ou la fermeture du compte,
                et l'annulation des avantages indûment obtenus.
              </p>
            </>
          ),
        },
        {
          id: "propriete",
          title: "Propriété intellectuelle",
          body: (
            <p>
              Les éléments du site (nom, logo, identité visuelle, textes, interfaces,
              composants originaux) sont protégés. L&apos;achat d&apos;un produit donne un
              droit d&apos;usage personnel du contenu concerné ; la reproduction ou la
              redistribution de ce contenu est interdite sans autorisation. Voir les{" "}
              <a href="/mentions-legales/" className="text-teal underline-offset-4 hover:underline">
                mentions légales
              </a>
              .
            </p>
          ),
        },
        {
          id: "disponibilite",
          title: "Disponibilité du service",
          body: (
            <>
              <p>
                Arsenal Tools cherche à maintenir le site disponible et fonctionnel, mais
                ne peut garantir une disponibilité permanente : des interruptions (mises à
                jour, incidents techniques ou de nos prestataires) peuvent survenir.
              </p>
              <p>
                Des services tiers utilisés par le site (hébergement, paiement) peuvent
                également être momentanément indisponibles.
              </p>
            </>
          ),
        },
        {
          id: "liens-externes",
          title: "Liens externes et services tiers",
          body: (
            <p>
              Certains produits ou parcours passent par des services externes (tunnel de
              paiement, plateformes communautaires). Arsenal Tools ne contrôle pas leurs
              contenus ni leurs politiques : lorsque vous quittez le site, les conditions
              et politiques du service externe s&apos;appliquent.
            </p>
          ),
        },
        {
          id: "evolution",
          title: "Évolution du service et des conditions",
          body: (
            <p>
              Le service et les présentes conditions peuvent évoluer. Les changements
              importants sont reflétés par une nouvelle date de mise à jour en tête de ce
              document.
            </p>
          ),
        },
        {
          id: "suspension",
          title: "Suspension et résiliation de compte",
          body: (
            <p>
              Un compte peut être suspendu ou fermé en cas d&apos;abus, de fraude, de
              contournement des mécanismes du site ou de violation répétée des présentes
              conditions. Vous pouvez également demander la fermeture de votre compte à
              tout moment en nous contactant.
            </p>
          ),
        },
        {
          id: "responsabilite",
          title: "Responsabilité",
          body: (
            <>
              <p>
                Arsenal Tools met en œuvre des moyens raisonnables pour assurer l&apos;exactitude
                des informations et le bon fonctionnement du service, sans garantie
                d&apos;absence d&apos;erreur ni de résultat.
              </p>
              <p>
                L&apos;éditeur ne peut être tenu responsable des dommages indirects résultant
                de l&apos;utilisation du site ou de l&apos;indisponibilité temporaire d&apos;un
                service tiers.
              </p>
              <p>
                Les présentes conditions sont régies par le{" "}
                <strong className="text-tx1">droit béninois</strong>. En cas de litige, et
                à défaut de résolution amiable, les juridictions compétentes sont celles
                du <strong className="text-tx1">Bénin</strong>. Une solution amiable est
                toujours recherchée en premier lieu : écrivez-nous avant toute action.
              </p>
            </>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Question sur ces conditions :{" "}
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
