"use client";

/**
 * Politique de confidentialité — DÉCRIT LE FONCTIONNEMENT RÉEL du site
 * (audit du 05/10) :
 *  • compte : pseudo, email, mot de passe (jamais stocké en clair — PBKDF2) ;
 *  • panier, achats, historique de transactions internes ;
 *  • affiliation : candidature, liens, clics, ventes, commissions ;
 *  • mesure d'audience : empreinte hachée côté serveur (sha256) — AUCUNE IP
 *    brute stockée, aucun cookie, aucun traceur publicitaire tiers.
 *
 * Si l'admin a rédigé sa propre version, elle REMPLACE ce contenu par défaut.
 */

import Link from "next/link";
import { LegalList, LegalNote, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";
import { useLegalOverride } from "@/lib/legal-override";

export default function ConfidentialitePage() {
  const override = useLegalOverride("privacy");
  if (override) {
    return (
      <LegalPage
        title="Politique de confidentialité"
        currentPath="/confidentialite/"
        sections={[
          { id: "contenu", title: "Contenu", body: <p className="whitespace-pre-line">{override}</p> },
        ]}
      />
    );
  }

  return (
    <LegalPage
      title="Politique de confidentialité"
      currentPath="/confidentialite/"
      lead="Cette politique décrit, sans formalismes inutiles, quelles données Arsenal Tools traite réellement, pourquoi, et comment exercer vos droits."
      sections={[
        {
          id: "responsable",
          title: "Responsable du traitement",
          body: (
            <>
              <p>
                Le responsable du traitement des données est{" "}
                <strong className="text-tx1">{LEGAL.editor}</strong>, personne physique
                exploitant le projet Arsenal Tools.
              </p>
              <LegalList
                items={[
                  <>
                    Contact :{" "}
                    <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                      {LEGAL.siteEmail}
                    </a>{" "}
                    — alternative :{" "}
                    <a href={`mailto:${LEGAL.editorEmail}`} className="text-teal underline-offset-4 hover:underline">
                      {LEGAL.editorEmail}
                    </a>
                  </>,
                ]}
              />
            </>
          ),
        },
        {
          id: "donnees",
          title: "Données réellement traitées",
          body: (
            <>
              <p>
                Arsenal Tools applique une collecte minimale. Voici ce qui est
                effectivement enregistré lorsque vous utilisez le site :
              </p>
              <LegalList
                items={[
                  <>
                    <strong className="text-tx1">Compte</strong> : pseudo, adresse
                    email, mot de passe (stocké uniquement sous forme de condensat
                    cryptographique — jamais en clair), date d&apos;inscription.
                  </>,
                  <>
                    <strong className="text-tx1">Panier</strong> : contenu du panier,
                    associé à un identifiant anonyme de navigateur tant que vous
                    n&apos;êtes pas connecté.
                  </>,
                  <>
                    <strong className="text-tx1">Achats et transactions</strong> :
                    produits obtenus, dates, statut de livraison, historique des
                    opérations liées à la monnaie interne du site, échanges internes
                    entre comptes.
                  </>,
                  <>
                    <strong className="text-tx1">Programme d&apos;affiliation</strong> :
                    candidature, statut, liens de suivi créés, clics et ventes
                    attribués, montants de commission, historique des changements de
                    statut.
                  </>,
                  <>
                    <strong className="text-tx1">Mesure d&apos;audience interne</strong>{" "}
                    : comptage de visites et de clics. Les empreintes utilisées pour
                    éviter les doubles comptages sont des condensats cryptographiques
                    (SHA-256) — <strong className="text-tx1">aucune adresse IP n&apos;est
                    conservée en clair</strong>, ni aucun profil publicitaire.
                  </>,
                  <>
                    <strong className="text-tx1">Journaux de sécurité</strong> :
                    événements techniques (connexions, échecs, actions
                    d&apos;administration) avec empreinte d&apos;IP hachée, pour la
                    sécurité et la prévention des abus.
                  </>,
                  <>
                    <strong className="text-tx1">Fichiers d&apos;identification
                    locale</strong> : langue, thème, jeton de session — stockés dans
                    votre navigateur (voir la{" "}
                    <Link href="/cookies/" className="text-teal underline-offset-4 hover:underline">
                      page dédiée au stockage local
                    </Link>
                    ).
                  </>,
                ]}
              />
              <p>
                Aucune newsletter n&apos;est envoyée, aucun profilage publicitaire
                n&apos;est réalisé, et aucune donnée n&apos;est vendue.
              </p>
            </>
          ),
        },
        {
          id: "finalites",
          title: "Pourquoi ces données sont utilisées",
          body: (
            <LegalList
              items={[
                "création et gestion de votre compte, authentification ;",
                "fonctionnement du site (panier, catalogue, préférences d'affichage) ;",
                "traitement des achats et accès aux produits numériques ;",
                "gestion du programme d'affiliation : attribution des ventes, calcul des commissions, suivi ;",
                "sécurité du service : prévention de la fraude, des abus et des accès non autorisés ;",
                "réponse à vos demandes de support ;",
                "comptage d'audience interne (statistiques agrégées).",
              ]}
            />
          ),
        },
        {
          id: "bases",
          title: "Sur quelle base ces traitements reposent",
          body: (
            <LegalList
              items={[
                <>
                  <strong className="text-tx1">Exécution du service</strong> : compte,
                  authentification, panier, achats, affiliation — ces traitements sont
                  nécessaires pour vous fournir ce que vous utilisez.
                </>,
                <>
                  <strong className="text-tx1">Intérêt légitime</strong> : sécurité,
                  prévention de la fraude et des abus, intégrité des mécanismes
                  d&apos;attribution.
                </>,
                <>
                  <strong className="text-tx1">Consentement</strong> : uniquement
                  lorsqu&apos;un traitement facultatif le requiert ; vous pouvez le
                  retirer à tout moment.
                </>,
              ]}
            />
          ),
        },
        {
          id: "durees",
          title: "Durées de conservation",
          body: (
            <>
              <p>
                Les données sont conservées pendant la durée nécessaire à la finalité
                pour laquelle elles ont été collectées, puis supprimées ou anonymisées,
                sous réserve des obligations légales de conservation.
              </p>
              <LegalList
                items={[
                  "sessions de connexion : 30 jours de validité, renouvelées à chaque utilisation ;",
                  "jeton de suivi affilié (anonyme) : 30 jours ;",
                  "comptage de clics dédupliqué : empreinte journalière, sans conservation d'IP ;",
                  "compte, achats, commissions : conservés tant que le compte existe, puis archivés ou supprimés selon les obligations applicables.",
                ]}
              />
            </>
          ),
        },
        {
          id: "partage",
          title: "Prestataires et partage",
          body: (
            <>
              <p>
                Vos données ne sont jamais vendues ni louées. Elles peuvent être traitées
                par les prestataires techniques réellement utilisés par le site :
              </p>
              <LegalList
                items={[
                  <>
                    <strong className="text-tx1">Cloudflare</strong> — hébergement du
                    site, de l&apos;API et de la base de données.
                  </>,
                  <>
                    <strong className="text-tx1">GitHub</strong> — hébergement technique
                    de certains fichiers (images de catalogue, fichiers livrables des
                    produits).
                  </>,
                  <>
                    <strong className="text-tx1">Chariow</strong> — prestataire de
                    paiement pour les achats réglés par lien externe. Lors d&apos;un tel
                    achat, les informations nécessaires à la commande (email, nom
                    d&apos;usage, téléphone par défaut configuré) sont transmises à
                    Chariow, qui applique ses propres conditions et sa propre politique
                    de confidentialité.
                  </>,
                ]}
              />
              <p>
                Aucun autre partenaire n&apos;est destinataire de vos données. Les
                données de paiement bancaire ne sont jamais stockées par Arsenal Tools :
                elles sont traitées par le prestataire de paiement.
              </p>
            </>
          ),
        },
        {
          id: "transferts",
          title: "Transferts internationaux",
          body: (
            <p>
              Les prestataires ci-dessus sont établis en dehors de votre pays de
              résidence. Vos données peuvent donc être traitées ou hébergées dans
              d&apos;autres pays, dans le cadre nécessaire au fonctionnement des
              services décrits.
            </p>
          ),
        },
        {
          id: "droits",
          title: "Vos droits",
          body: (
            <>
              <p>
                Selon la réglementation qui vous est applicable, vous pouvez demander à
                accéder à vos données, les faire rectifier, demander leur suppression
                lorsque c&apos;est possible, vous opposer ou demander la limitation de
                certains traitements, et retirer un consentement donné.
              </p>
              <p>
                Pour exercer ces droits :{" "}
                <a href={`mailto:${LEGAL.siteEmail}`} className="text-teal underline-offset-4 hover:underline">
                  {LEGAL.siteEmail}
                </a>{" "}
                — alternative :{" "}
                <a href={`mailto:${LEGAL.editorEmail}`} className="text-teal underline-offset-4 hover:underline">
                  {LEGAL.editorEmail}
                </a>
                .
              </p>
              <LegalNote>
                Certaines données peuvent devoir être conservées malgré une demande de
                suppression (par exemple des éléments comptables ou de sécurité) —
                dans ce cas, vous en êtes informé.
              </LegalNote>
            </>
          ),
        },
        {
          id: "securite",
          title: "Sécurité",
          body: (
            <LegalList
              items={[
                "mots de passe stockés uniquement sous forme de condensats cryptographiques ;",
                "jetons de session opaques, jamais lisibles en base ;",
                "adresses IP jamais conservées en clair (empreintes hachées uniquement) ;",
                "limitation de débit sur les routes sensibles et journalisation des actions d'administration.",
              ]}
            />
          ),
        },
      ]}
    />
  );
}
