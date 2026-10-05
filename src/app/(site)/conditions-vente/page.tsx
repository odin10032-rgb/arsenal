"use client";

/**
 * Conditions de vente (CGV) — produits numériques, paiement, accès.
 * Décrit le fonctionnement RÉEL : paiement par prestataire externe (Chariow)
 * ou via la monnaie interne pour les membres ; livraison numérique immédiate
 * ou manuelle ; le fichier/l'accès est accessible depuis le compte.
 * La politique de remboursement n'est PAS définie à ce jour : placeholder
 * explicite, jamais une règle inventée.
 */

import { LegalList, LegalNote, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export default function ConditionsVentePage() {
  return (
    <LegalPage
      title="Conditions de vente"
      currentPath="/conditions-vente/"
      lead="Ces conditions encadrent l'achat des produits numériques proposés sur Arsenal Tools."
      sections={[
        {
          id: "produits",
          title: "Produits proposés",
          body: (
            <>
              <p>
                Arsenal Tools propose des produits <strong className="text-tx1">numériques</strong> :
                ressources à télécharger, applications, formations, outils et packs. La
                fiche de chaque produit décrit son contenu, son format et son mode
                d&apos;accès.
              </p>
              <p>
                Les produits sont hébergés et livrés par Arsenal Tools (téléchargement
                depuis votre compte) ou via un service externe, selon ce qui est indiqué
                sur la fiche du produit.
              </p>
            </>
          ),
        },
        {
          id: "prix",
          title: "Prix",
          body: (
            <LegalList
              items={[
                "les prix sont affichés sur la fiche de chaque produit, dans la devise indiquée (FCFA pour les achats par lien de paiement externe) ;",
                "le prix affiché au moment de la commande est celui qui s'applique ;",
                "certains produits peuvent être réglés avec la monnaie interne du site, réservée aux membres du programme — le montant applicable est alors affiché sur la fiche du produit.",
              ]}
            />
          ),
        },
        {
          id: "paiement",
          title: "Paiement",
          body: (
            <>
              <p>
                Les achats par lien de paiement externe sont traités par le prestataire{" "}
                <strong className="text-tx1">Chariow</strong>, selon ses propres conditions
                et sa politique de confidentialité.{" "}
                <strong className="text-tx1">
                  Arsenal Tools ne stocke jamais vos données bancaires
                </strong>{" "}
                : elles sont traitées directement par le prestataire de paiement.
              </p>
              <p>
                Les achats réglés avec la monnaie interne du site sont débités de votre
                solde interne au moment de la commande.
              </p>
            </>
          ),
        },
        {
          id: "commande",
          title: "Confirmation de commande",
          body: (
            <p>
              Toute commande fait l&apos;objet d&apos;une confirmation dans votre espace
              personnel (section « Mes produits »), avec l&apos;état de la livraison.
            </p>
          ),
        },
        {
          id: "livraison",
          title: "Accès et livraison numérique",
          body: (
            <LegalList
              items={[
                "la livraison est numérique : aucun envoi physique n'a lieu ;",
                "lorsque le produit est livré automatiquement, l'accès est disponible immédiatement après le paiement ;",
                "certains produits peuvent être livrés manuellement (vérification par l'éditeur) — la fiche ou la confirmation l'indique ;",
                "l'accès au produit se fait depuis votre compte, où le téléchargement ou la clé d'accès reste disponible.",
              ]}
            />
          ),
        },
        {
          id: "problemes",
          title: "Problème d'accès",
          body: (
            <p>
              Si un produit acheté n&apos;est pas accessible, ou si l&apos;accès ne
              fonctionne pas, contactez-nous :{" "}
              <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                {LEGAL.siteEmail}
              </a>{" "}
              — nous corrigeons l&apos;accès dès que possible.
            </p>
          ),
        },
        {
          id: "erreurs",
          title: "Erreurs de paiement et fraude",
          body: (
            <>
              <p>
                En cas d&apos;erreur de paiement (double débit, montant erroné), contactez
                le support avec les informations de la commande concernée.
              </p>
              <p>
                Toute tentative de fraude (paiement frauduleux, manipulation du parcours
                d&apos;achat) entraîne l&apos;annulation de l&apos;accès au produit
                concerné et peut entraîner la fermeture du compte.
              </p>
            </>
          ),
        },
        {
          id: "remboursement",
          title: "Remboursements",
          body: (
            <>
              <p>
                Les produits vendus sont des contenus numériques livrés immédiatement
                après le paiement.
              </p>
              <LegalNote tone="todo">
                [À COMPLÉTER — politique de remboursement] Aucune règle de remboursement
                n&apos;est définie à ce jour. Décidez la règle applicable (par exemple :
                pas de remboursement après livraison du contenu numérique, ou conditions
                précises d&apos;un remboursement) et remplacez ce bloc par la règle
                choisie.
              </LegalNote>
            </>
          ),
        },
        {
          id: "propriete",
          title: "Propriété intellectuelle",
          body: (
            <p>
              L&apos;achat d&apos;un produit donne un droit d&apos;usage{" "}
              <strong className="text-tx1">personnel</strong> du contenu acheté. La
              revente, la redistribution ou la mise à disposition publique du contenu
              acheté sont interdites.
            </p>
          ),
        },
        {
          id: "responsabilite",
          title: "Responsabilité",
          body: (
            <p>
              Les produits sont fournis en l&apos;état, pour l&apos;usage décrit sur leur
              fiche. Arsenal Tools ne garantit pas de résultat particulier lié à
              l&apos;utilisation d&apos;un produit acheté.
            </p>
          ),
        },
        {
          id: "support",
          title: "Support",
          body: (
            <p>
              Support achats et accès :{" "}
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
