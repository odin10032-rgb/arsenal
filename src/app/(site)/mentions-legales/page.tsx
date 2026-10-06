"use client";

/**
 * Mentions légales — éditeur, hébergement, propriété intellectuelle.
 * Aucune société n'est présentée : Arsenal Tools est un projet indépendant
 * exploité par une personne physique. Les informations non connues restent
 * « [À COMPLÉTER] » — jamais inventées.
 *
 * Si l'admin a rédigé sa propre version (Paramètres → Pages légales), elle
 * REMPLACE ce contenu par défaut.
 */

import { LegalList, LegalNote, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";
import { useLegalOverride } from "@/lib/legal-override";

export default function MentionsLegalesPage() {
  const override = useLegalOverride("notice");
  if (override) {
    return (
      <LegalPage
        title="Mentions légales"
        currentPath="/mentions-legales/"
        sections={[
          { id: "contenu", title: "Contenu", body: <p className="whitespace-pre-line">{override}</p> },
        ]}
      />
    );
  }

  return (
    <LegalPage
      title="Mentions légales"
      currentPath="/mentions-legales/"
      lead="Informations relatives à l'éditeur et à l'exploitation du site Arsenal Tools."
      sections={[
        {
          id: "editeur",
          title: "Éditeur du site",
          body: (
            <>
              <p>
                <strong className="text-tx1">{LEGAL.siteName}</strong> est un projet
                indépendant créé et exploité par{" "}
                <strong className="text-tx1">{LEGAL.editor}</strong>, personne physique.
                Arsenal Tools n&apos;est pas une société et ne dispose pas de la
                personnalité morale.
              </p>
              <LegalList
                items={[
                  <>
                    Contact de l&apos;exploitant :{" "}
                    <a href={`mailto:${LEGAL.editorEmail}`} className="text-teal underline-offset-4 hover:underline">
                      {LEGAL.editorEmail}
                    </a>
                  </>,
                  <>
                    Contact d&apos;Arsenal Tools :{" "}
                    <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                      {LEGAL.siteEmail}
                    </a>
                  </>,
                  <>
                    Site :{" "}
                    <a href={LEGAL.siteUrl} className="text-teal underline-offset-4 hover:underline">
                      {LEGAL.siteUrl}
                    </a>
                  </>,
                ]}
              />
              <LegalNote tone="todo">
                [À COMPLÉTER — si nécessaire] Adresse postale de l&apos;exploitant, numéro
                d&apos;immatriculation ou IFU : ces informations n&apos;ont pas été
                fournies et ne sont pas inventées. Un site édité par une personne
                physique n&apos;est pas toujours tenu de publier une adresse postale —
                ajoutez-la ici uniquement si votre situation l&apos;exige.
              </LegalNote>
            </>
          ),
        },
        {
          id: "hebergement",
          title: "Hébergement",
          body: (
            <>
              <p>
                Le site est hébergé et opéré techniquement via l&apos;infrastructure de{" "}
                <strong className="text-tx1">{LEGAL.host.name}</strong> (hébergement des
                pages, de l&apos;API et de la base de données) :{" "}
                <a href={LEGAL.host.site} className="text-teal underline-offset-4 hover:underline">
                  {LEGAL.host.site}
                </a>
                .
              </p>
              <LegalList
                items={[
                  <>Adresse : {LEGAL.host.address}</>,
                  <>
                    Localisation du service : {LEGAL.host.region}. Le réseau mondial de
                    Cloudflare peut également traiter des données depuis d&apos;autres
                    points de présence, pour la diffusion et la sécurité du site.
                  </>,
                ]}
              />
              <p className="text-[0.86rem] text-tx3">
                Aucune adresse d&apos;un autre hébergeur ne s&apos;applique : le site
                n&apos;est hébergé que chez Cloudflare.
              </p>
            </>
          ),
        },
        {
          id: "propriete",
          title: "Propriété intellectuelle",
          body: (
            <>
              <p>
                Sauf indication contraire, le nom{" "}
                <strong className="text-tx1">Arsenal Tools</strong>, son logo, son
                identité visuelle, ses textes, ses interfaces, ses illustrations et les
                composants originaux du site sont protégés par les droits de propriété
                intellectuelle applicables.
              </p>
              <p>
                Toute reproduction, copie, modification ou redistribution non autorisée de
                ces éléments est interdite. L&apos;achat d&apos;un produit donne un droit
                d&apos;usage personnel du contenu acheté, pas un transfert de propriété
                intellectuelle.
              </p>
              <p>
                Certains éléments utilisés sur le site peuvent appartenir à des tiers
                (bibliothèques logicielles libres, contenus fournis par des partenaires,
                images ou services externes) et restent soumis à leurs propres licences
                et conditions. Ces éléments ne sont pas revendiqués comme appartenant à
                Arsenal Tools.
              </p>
            </>
          ),
        },
        {
          id: "responsabilite",
          title: "Responsabilité",
          body: (
            <>
              <p>
                Arsenal Tools s&apos;efforce de fournir des informations exactes et un
                service fonctionnel, sans pouvoir garantir l&apos;absence totale
                d&apos;erreurs ou d&apos;interruptions. Les contenus sont fournis en
                l&apos;état, sans garantie de résultat.
              </p>
              <p>
                Les liens externes présents sur le site (tunnels de paiement, plateformes
                communautaires, services tiers) relèvent de la responsabilité de leurs
                éditeurs respectifs.
              </p>
            </>
          ),
        },
        {
          id: "signalement",
          title: "Signalement",
          body: (
            <p>
              Pour signaler un contenu problématique, une erreur ou un usage abusif :{" "}
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
