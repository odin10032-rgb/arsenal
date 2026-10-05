"use client";

/**
 * Contact — page de contact centralisée (créée le 05/10).
 * Deux adresses réelles : le contact public d'Arsenal Tools et le contact
 * professionnel de l'exploitant. Aucune adresse inventée, aucun formulaire
 * fictif : le site n'expose pas de boîte de réception interne.
 */

import { LegalList, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact"
      currentPath="/contact/"
      lead="Une question, un problème, une demande ? Voici les bons interlocuteurs — et le canal adapté à chaque situation."
      sections={[
        {
          id: "support",
          title: "Support et questions générales",
          body: (
            <>
              <p>
                Pour toute question sur le site, votre compte, un achat ou un produit :{" "}
                <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                  {LEGAL.siteEmail}
                </a>
              </p>
              <p className="text-[0.86rem] text-tx3">
                Précisez si possible votre pseudo et l&apos;objet concerné (produit,
                commande, affiliation) pour un traitement plus rapide.
              </p>
            </>
          ),
        },
        {
          id: "affiliation",
          title: "Programme d'affiliation",
          body: (
            <>
              <p>
                Pour une candidature, une question sur vos liens, vos commissions ou le
                statut Super Affilié : la réponse se trouve d&apos;abord dans votre{" "}
                <a href="/affilie/" className="text-teal underline-offset-4 hover:underline">
                  espace affilié
                </a>
                , puis par email :{" "}
                <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                  {LEGAL.siteEmail}
                </a>
              </p>
              <p>
                Les règles du programme sont détaillées dans les{" "}
                <a href="/conditions-affiliation/" className="text-teal underline-offset-4 hover:underline">
                  conditions d&apos;affiliation
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: "donnees",
          title: "Données personnelles et droits",
          body: (
            <>
              <p>
                Pour exercer vos droits (accès, rectification, suppression, opposition) ou
                toute question relative à vos données :
              </p>
              <LegalList
                items={[
                  <>
                    <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                      {LEGAL.siteEmail}
                    </a>
                  </>,
                  <>
                    <a href={`mailto:${LEGAL.editorEmail}`} className="text-teal underline-offset-4 hover:underline">
                      {LEGAL.editorEmail}
                    </a>
                  </>,
                ]}
              />
              <p>
                Voir la{" "}
                <a href="/confidentialite/" className="text-teal underline-offset-4 hover:underline">
                  politique de confidentialité
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: "editeur",
          title: "Contact de l'éditeur",
          body: (
            <p>
              {LEGAL.siteName} est un projet indépendant créé et exploité par{" "}
              <strong className="text-tx1">{LEGAL.editor}</strong>. Pour toute
              correspondance professionnelle ou relative au site en tant qu&apos;éditeur :{" "}
              <a href={`mailto:${LEGAL.editorEmail}`} className="text-teal underline-offset-4 hover:underline">
                {LEGAL.editorEmail}
              </a>
              .
            </p>
          ),
        },
        {
          id: "signalement",
          title: "Signalements",
          body: (
            <p>
              Contenu inapproprié, lien défectueux, comportement abusif ou tentative de
              fraude : écrivez à{" "}
              <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                {LEGAL.siteEmail}
              </a>{" "}
              avec le maximum de précisions (capture, lien concerné).
            </p>
          ),
        },
      ]}
    />
  );
}
