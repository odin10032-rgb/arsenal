"use client";

/**
 * Conditions du programme d'affiliation — règles RÉELLES du programme
 * (plafonds, attribution, commissions, interdictions, Super Affilié),
 * d'après le fonctionnement effectif du système.
 *
 * ⚠️ Cette documentation ne mentionne PAS la monnaie interne du site : le
 * programme d'affiliation rémunère les ventes en argent réel ; les mécanismes
 * internes de fidélité sont un sujet distinct.
 */

import { LegalList, LegalNote, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export default function ConditionsAffiliationPage() {
  return (
    <LegalPage
      title="Conditions du programme d'affiliation"
      currentPath="/conditions-affiliation/"
      lead="Ces conditions décrivent les règles du programme d'affiliation d'Arsenal Tools : comment une vente vous est attribuée, comment la commission est calculée et payée, et ce qui est interdit."
      sections={[
        {
          id: "eligibilite",
          title: "Éligibilité et candidature",
          body: (
            <LegalList
              items={[
                "la participation est gratuite ;",
                "il faut disposer d'un compte Arsenal Tools et présenter une candidature depuis l'espace affilié ;",
                "chaque candidature est examinée et validée (ou refusée) par Arsenal Tools ;",
                "la participation est réservée aux personnes capables de recommander les produits de manière honnête et conforme à ces conditions.",
              ]}
            />
          ),
        },
        {
          id: "liens",
          title: "Liens affiliés et plafonds",
          body: (
            <>
              <LegalList
                items={[
                  "chaque affilié dispose d'un code et de liens de suivi personnels, créés pour un produit précis ;",
                  "un affilié peut avoir jusqu'à 3 liens actifs en même temps (le plafond s'applique aux liens standards) ;",
                  "chaque lien est limité à 20 ventes attribuées ; au-delà, il est désactivé automatiquement et peut être remplacé ;",
                  "les liens liés à une campagne rejointe ne comptent pas dans le plafond de 3 ;",
                  "un lien ne fonctionne que s'il est actif et si le produit est toujours éligible à l'affiliation.",
                ]}
              />
              <p>
                Si un produit est retiré de l&apos;affiliation ou du catalogue, les liens
                concernés cessent d&apos;attribuer des ventes ; l&apos;affilié en est
                informé dans son espace.
              </p>
            </>
          ),
        },
        {
          id: "attribution",
          title: "Attribution des ventes",
          body: (
            <>
              <p>
                Lorsqu&apos;un visiteur arrive via un lien affilié, un identifiant de suivi
                anonyme est utilisé pour relier la vente au lien d&apos;origine.
              </p>
              <LegalList
                items={[
                  "règle appliquée : le DERNIER lien affilié cliqué avant l'achat est celui qui est crédité (dernier toucher) ;",
                  "la fenêtre d'attribution est de 30 jours après le clic ;",
                  "si une personne crée un compte après être arrivée via un lien, cette origine est mémorisée pour son premier achat ;",
                  "un affilié ne peut pas s'attribuer ses propres achats (auto-achat interdit) ;",
                  "les ventes non attribuables restent enregistrées comme non attribuées.",
                ]}
              />
            </>
          ),
        },
        {
          id: "commissions",
          title: "Commissions",
          body: (
            <>
              <LegalList
                items={[
                  "le taux de commission est affiché sur la fiche de chaque produit ; le taux par défaut du programme est de 30 % du prix de vente, certains produits appliquent un taux spécifique, et des campagnes temporaires peuvent le renforcer ;",
                  "la commission est calculée sur le montant réel de la vente attribuée ;",
                  "cycle d'une commission : enregistrée → validée (après confirmation de la vente) → payable → payée ;",
                  "le paiement des commissions est effectué manuellement par Arsenal Tools, après validation ;",
                  "lorsqu'une vente est annulée, rejetée ou remboursée, la commission associée est annulée ou reprise.",
                ]}
              />
              <LegalNote>
                Le montant des commissions dépend uniquement des ventes réellement
                générées : aucun revenu n&apos;est garanti ni promis.
              </LegalNote>
            </>
          ),
        },
        {
          id: "interdictions",
          title: "Pratiques interdites",
          body: (
            <>
              <p>Sont strictement interdits :</p>
              <LegalList
                items={[
                  "l'auto-achat : acheter via son propre lien pour s'attribuer une commission ;",
                  "la manipulation du suivi : faux clics, automatisation, altération des liens ou des identifiants de suivi ;",
                  "le spam : envois massifs, partages répétés non sollicités (des limites quotidiennes de partage s'appliquent) ;",
                  "les fausses promesses et la publicité trompeuse sur les produits ou sur les gains possibles ;",
                  "l'usurpation : se présenter comme Arsenal Tools, un de ses représentants, ou usurper l'identité d'un tiers ;",
                  "la promotion via des contenus illicites, trompeurs ou portant atteinte à des tiers.",
                ]}
              />
            </>
          ),
        },
        {
          id: "canaux",
          title: "Contenus et canaux de promotion",
          body: (
            <p>
              Vous êtes libre de recommander les produits sur les canaux que vous
              maîtrisez (réseaux sociaux, contenus, communautés, recommandations
              directes), à condition de respecter ces conditions et la réglementation
              applicable. La promotion doit rester honnête : décrivez le produit
              réellement, sans exagérer ses résultats.
            </p>
          ),
        },
        {
          id: "super",
          title: "Super Affilié",
          body: (
            <>
              <p>
                Le statut de Super Affilié récompense la performance constatée. Critères
                actuels (mesurés sur votre activité réelle) :{" "}
                <strong className="text-tx1">10 ventes attribuées et 100 clics</strong>.
              </p>
              <LegalList
                items={[
                  "avantage principal : vos liens actifs ne sont plus plafonnés ;",
                  "accès aux campagnes et à leurs conditions renforcées ;",
                  "possibilité de demander la mise en affiliation d'un produit qui ne l'est pas encore (soumis à validation).",
                ]}
              />
            </>
          ),
        },
        {
          id: "paiement",
          title: "Paiement des commissions",
          body: (
            <p>
              Les commissions validées deviennent payables puis sont versées par Arsenal
              Tools selon les modalités convenues avec l&apos;affilié, après vérification
              des ventes. Les commissions non validées ne sont pas payables. Tout
              soupçon de fraude suspend le traitement des paiements concernés le temps de
              la vérification.
            </p>
          ),
        },
        {
          id: "suspension",
          title: "Suspension et fin de participation",
          body: (
            <LegalList
              items={[
                "la participation peut être suspendue ou terminée en cas de violation de ces conditions (fraude, spam, manipulation, usurpation) ;",
                "vous pouvez quitter le programme à tout moment depuis votre espace ;",
                "en cas de fin de participation, les commissions validées dues restent traitées ; les commissions liées à des ventes frauduleuses sont annulées.",
              ]}
            />
          ),
        },
        {
          id: "garanties",
          title: "Absence de garantie de revenus",
          body: (
            <p>
              Le programme d&apos;affiliation ne garantit aucun revenu. Les revenus
              dépendent du nombre de ventes réellement générées par vos liens, du prix
              des produits et du taux de commission applicable. Aucune promesse de gain,
              de revenu passif ou de résultat n&apos;est faite par Arsenal Tools.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Questions sur le programme :{" "}
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
