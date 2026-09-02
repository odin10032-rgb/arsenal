/**
 * Bêta Arsenal — Données de départ (catalogue de démonstration)
 * 12 produits couvrant les 5 catégories, les 4 badges et les 3 mécaniques d'action.
 */

export interface SeedProduct {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  category: "saas" | "desktop" | "mobile" | "ebook" | "prompts";
  actionType: "chariow" | "terminal" | "mobile";
  badges: string[];
  price: string;
  actionUrl: string;
  apkUrl?: string;
  pwaUrl?: string;
  command?: string | null;
  videoUrl?: string | null;
  imageUrl: string;
  clicks: number;
  createdAt: number;
  updatedAt: number;
}

const IMG = (name: string) => `https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/${name}`;

const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number) => now - days * DAY;

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    id: "neuroform-ai",
    title: "NeuroForm AI",
    shortDescription: "Le générateur de formulaires intelligents qui crée, teste et optimise vos formulaires en 30 secondes.",
    description:
      "NeuroForm IA génère des formulaires complets à partir d'une simple description textuelle, puis les optimise en continu grâce au machine learning. Les taux de conversion sont mesurés en temps réel et l'IA propose des variantes à tester (A/B testing automatique).\n\nFonctionnalités clés : génération par prompt, logique conditionnelle, analyse heatmap des champs, intégration Notion / Airtable / HubSpot et export webhook. Idéal pour les SaaS, les agences et les créateurs d'audience qui veulent des formulaires qui convertissent vraiment.",
    category: "saas",
    actionType: "chariow",
    badges: ["premium", "nouveau"],
    price: "14,90 €/mois",
    actionUrl: "https://checkout.chariow.com/neuroform-pro",
    videoUrl: "https://www.youtube.com/watch?v=1FUcniACzmc",
    imageUrl: IMG("54ae361e5a6f.webp"),
    clicks: 0,
    createdAt: ago(6),
    updatedAt: ago(2),
  },
  {
    id: "pixelpeek",
    title: "PixelPeek API",
    shortDescription: "API de captures d'écran pixel-perfect de n'importe quelle page web, en 200 ms.",
    description:
      "PixelPeek transforme n'importe quelle URL en capture d'écran haute définition via une simple requête REST. Rendu Chrome headless, émulation mobile, injection de cookies, blocage des pop-ups et attente de sélecteur avant capture.\n\nLe plan gratuit offre 500 captures/mois sans carte bancaire. Utilisé par des équipes produit pour la veille concurrentielle, la modération de contenus et la documentation automatisée. Documentation claire, SDK JavaScript et Python inclus.",
    category: "saas",
    actionType: "chariow",
    badges: ["gratuit", "beta"],
    price: "Gratuit",
    actionUrl: "https://checkout.chariow.com/pixelpeek-free",
    videoUrl: "https://www.youtube.com/watch?v=Tn6-PIqc4UM",
    imageUrl: IMG("e5d6942c6b49.png"),
    clicks: 0,
    createdAt: ago(34),
    updatedAt: ago(12),
  },
  {
    id: "clipforge",
    title: "ClipForge",
    shortDescription: "Gestionnaire de presse-papiers pour développeurs : historique infini, snippets et recherche instantanée.",
    description:
      "ClipForge garde en mémoire chaque élément copié (texte, code, couleurs, images) avec un historique illimité et une recherche instantanée par mot-clé ou par application source. Les snippets récurrents deviennent des modèles réutilisables avec placeholders.\n\nApplication desktop native multi-plateforme (Windows, macOS, Linux), démarrage au lancement, mode « incognito » automatique pour les mots de passe. Léger : moins de 40 Mo en RAM. Installation en une seule ligne de commande.",
    category: "desktop",
    actionType: "terminal",
    badges: ["nouveau", "gratuit"],
    price: "Gratuit",
    actionUrl: "https://github.com/beta-arsenal/clipforge",
    command: "curl -fsSL https://clipforge.sh/install | bash",
    videoUrl: null,
    imageUrl: IMG("49eb45023c1e.jpg"),
    clicks: 0,
    createdAt: ago(9),
    updatedAt: ago(3),
  },
  {
    id: "termvault",
    title: "TermVault",
    shortDescription: "Coffre-fort de mots de passe en ligne de commande, chiffré localement, compatible teams.",
    description:
      "TermVault ramène la sécurité au terminal : vos secrets sont chiffrés localement (AES-256-GCM, clé maîtresse dérivée via Argon2) puis synchronisés de bout en bout. Aucun serveur tiers n'accède à vos données en clair.\n\nCommandes courtes (tv get, tv put, tv rotate), génération de mots de passe, injection directe dans les variables d'environnement de vos shells et CI. Le mode team permet de partager des secrets par projet avec audit des accès. Licence à vie, mises à jour incluses 1 an.",
    category: "desktop",
    actionType: "terminal",
    badges: ["premium"],
    price: "9,90 € — licence",
    actionUrl: "https://github.com/beta-arsenal/termvault",
    command: "npx termvault init --secure",
    videoUrl: null,
    imageUrl: IMG("164df61d5fa8.jpg"),
    clicks: 0,
    createdAt: ago(48),
    updatedAt: ago(20),
  },
  {
    id: "reposentinel",
    title: "RepoSentinel",
    shortDescription: "Scanner CLI qui audite vos dépôts GitHub : secrets exposés, dépendances vulnérables, mauvaises pratiques.",
    description:
      "RepoSentinel analyse vos dépôts en local avant chaque push et bloque les fuites de secrets (clés API, tokens, certificats) grâce à plus de 140 motifs de détection. Il vérifie aussi les dépendances vulnérables (CVE) et signale les fichiers trop permissifs.\n\nConfiguration zéro : détecte automatiquement les stacks (Node, Python, Go, PHP). Sortie lisible avec suggestions de correction, mode CI/CD inclus. Aucune donnée n'est envoyée en ligne — tout reste sur votre machine.",
    category: "desktop",
    actionType: "terminal",
    badges: ["beta"],
    price: "Gratuit",
    actionUrl: "https://github.com/beta-arsenal/reposentinel",
    command: null,
    videoUrl: null,
    imageUrl: IMG("ae049cb21c9e.jpg"),
    clicks: 0,
    createdAt: ago(21),
    updatedAt: ago(7),
  },
  {
    id: "hydrotrack",
    title: "HydroTrack",
    shortDescription: "Suivi d'hydratation gamifié : rappels intelligents, badges et widgets d'écran d'accueil.",
    description:
      "HydroTrack vous aide à boire régulièrement sans y penser : objectifs personnalisés selon votre poids et votre activité, rappels adaptatifs (pas pendant vos réunions !), badges de série et animations célébrant chaque palier.\n\nPWA ultra-légère (< 200 Ko) installable depuis n'importe quel navigateur, ou APK natif pour Android avec synchronisation offline. Le widget d'écran d'accueil affiche votre progression du jour d'un coup d'œil. 100 % gratuit, sans publicité et sans compte requis.",
    category: "mobile",
    actionType: "mobile",
    badges: ["gratuit", "nouveau"],
    price: "Gratuit",
    actionUrl: "https://cdn.betaarsenal.dev/hydrotrack/hydrotrack-v2.3.1.apk",
    apkUrl: "https://cdn.betaarsenal.dev/hydrotrack/hydrotrack-v2.3.1.apk",
    pwaUrl: "https://hydrotrack.betaarsenal.dev",
    command: null,
    videoUrl: "https://www.tiktok.com/@drjadeofficial/video/7550286763244211478",
    imageUrl: IMG("e22dd04629fc.png"),
    clicks: 0,
    createdAt: ago(4),
    updatedAt: ago(1),
  },
  {
    id: "fokusflow",
    title: "FokusFlow",
    shortDescription: "Minuteur Pomodoro avec son ambiant génératif et statistiques de concentration profonde.",
    description:
      "FokusFlow va plus loin que le simple Pomodoro : il génère des paysages sonores adaptatifs ( pluie, café, brown noise) dont l'intensité suit vos cycles de concentration, et mesure votre « temps de focus profond » réel grâce à l'analyse des interruptions.\n\nStatistiques hebdomadaires, synchronisation multi-appareils, mode strict qui bloque les distractions pendant les sessions de travail. La version Premium débloque les scènes sonores infinies, le suivi de projets et l'export CSV. Disponible en PWA installable et en APK Android.",
    category: "mobile",
    actionType: "mobile",
    badges: ["premium", "nouveau"],
    price: "4,99 €",
    actionUrl: "https://cdn.betaarsenal.dev/fokusflow/fokusflow-v1.8.0.apk",
    apkUrl: "https://cdn.betaarsenal.dev/fokusflow/fokusflow-v1.8.0.apk",
    pwaUrl: "https://fokusflow.betaarsenal.dev",
    command: null,
    videoUrl: "https://www.youtube.com/shorts/2g6cb23U9J8",
    imageUrl: IMG("7afbefd162ec.png"),
    clicks: 0,
    createdAt: ago(12),
    updatedAt: ago(2),
  },
  {
    id: "dev-independant",
    title: "Le Dev Indépendant",
    shortDescription: "E-book de 230 pages : lancez une activité de développeur solo rentable en 90 jours.",
    description:
      "La méthode complète pour passer de salarié à développeur indépendant sans y perdre : positionnement, tarification au valeur, prospection par contenu, gestion administrative (statuts, URSSAF, TVA) et automatisation de la production.\n\n230 pages illustrées, 14 modèles prêts à l'emploi (propositions commerciales, contrats, e-mails de relance), 6 études de cas de devs français et un plan d'action jour par jour sur 90 jours. Formats PDF, ePub et Notion offerts. Mise à jour gratuite à vie.",
    category: "ebook",
    actionType: "chariow",
    badges: ["premium"],
    price: "19,90 €",
    actionUrl: "https://checkout.chariow.com/dev-independant",
    command: null,
    videoUrl: "https://www.youtube.com/watch?v=CRsOXaofPmk",
    imageUrl: IMG("69cbc29afeb8.jpg"),
    clicks: 0,
    createdAt: ago(62),
    updatedAt: ago(15),
  },
  {
    id: "prompt-alchemy",
    title: "Prompt Alchemy",
    shortDescription: "Mini-guide gratuit : les 12 principes pour écrire des prompts qui produisent des résultats exploitables.",
    description:
      "Un e-book court et dense (42 pages) qui décortique l'anatomie d'un prompt efficace : rôle, contexte, contraintes, format de sortie et exemples few-shot. Chaque principe est illustré d'un avant/après mesurable sur GPT-4, Claude et Gemini.\n\nInclut la checklist « Prompt-Ready » imprimable et le framework C.A.S.T. (Contexte, Action, Structure, Ton) utilisé par les équipes qui industrialisent leurs prompts. Gratuit, en français, sans inscription.",
    category: "ebook",
    actionType: "chariow",
    badges: ["gratuit", "nouveau"],
    price: "Gratuit",
    actionUrl: "https://checkout.chariow.com/prompt-alchemy-free",
    command: null,
    videoUrl: null,
    imageUrl: IMG("80d107990458.jpg"),
    clicks: 0,
    createdAt: ago(16),
    updatedAt: ago(5),
  },
  {
    id: "megapack-prompts",
    title: "MegaPack 500 Prompts",
    shortDescription: "500 prompts testés et catégorisés pour marketing, code, design et productivité — prêts à copier.",
    description:
      "Le MegaPack réunit 500 prompts professionnels testés sur des projets réels, classés en 8 catégories (SEO, copywriting, développement, design, analyse de données, e-mailing, support client, automatisation). Chaque fiche indique le modèle recommandé, les variables à personnaliser et le résultat attendu.\n\nLivré en Notion + fichier JSON importable dans vos outils favoris (ChatGPT projets, Claude, Raycast). Mises à jour mensuelles avec les nouveaux prompts de la communauté. Licence d'équipe incluse jusqu'à 5 utilisateurs.",
    category: "prompts",
    actionType: "chariow",
    badges: ["premium"],
    price: "12,90 €",
    actionUrl: "https://checkout.chariow.com/megapack-500",
    command: null,
    videoUrl: null,
    imageUrl: IMG("8c880c42cd05.png"),
    clicks: 0,
    createdAt: ago(40),
    updatedAt: ago(9),
  },
  {
    id: "flowbridge-n8n",
    title: "FlowBridge — Pack n8n",
    shortDescription: "40 workflows n8n prêts à l'emploi : CRM, facturation, veille, publication sociale et support.",
    description:
      "FlowBridge est une collection open-source de 40 workflows n8n documentés et versionnés, prêts à importer en un clic. Chaque workflow est accompagné d'un guide d'installation, des variables d'environnement attendues et d'une vidéo de démonstration.\n\nCatégories couvertes : synchronisation CRM, relances de facturation, veille concurrentielle automatisée, publication multi-réseaux, triage du support avec réponses assistées par IA. Le dépôt est mis à jour chaque semaine par la communauté. Clonez, configurez, automatisez.",
    category: "prompts",
    actionType: "terminal",
    badges: ["beta", "gratuit"],
    price: "Gratuit",
    actionUrl: "https://github.com/beta-arsenal/flowbridge-templates",
    command: null,
    videoUrl: null,
    imageUrl: IMG("c454051a78ff.jpg"),
    clicks: 0,
    createdAt: ago(8),
    updatedAt: ago(1),
  },
  {
    id: "zenpost",
    title: "ZenPost",
    shortDescription: "Planificateur social qui écrit, programme et recycle vos contenus sur 6 réseaux.",
    description:
      "ZenPost centralise votre production de contenu : rédaction assistée par IA calée sur votre voix de marque, calendrier visuel, publication programmée sur X, LinkedIn, Instagram, TikTok, Bluesky et Threads, et recyclage intelligent de vos meilleurs posts.\n\nLa file d'attente « Evergreen » republie automatiquement vos contenus performants avec des variations générées. Statistiques unifiées par réseau et meilleur moment de publication calculé sur votre audience. Essai 14 jours sans carte bancaire.",
    category: "saas",
    actionType: "chariow",
    badges: ["beta"],
    price: "7,90 €/mois",
    actionUrl: "https://checkout.chariow.com/zenpost-trial",
    command: null,
    videoUrl: null,
    imageUrl: IMG("ed37f985b3b9.jpg"),
    clicks: 0,
    createdAt: ago(27),
    updatedAt: ago(10),
  },
];

/* ---------- Analytics de départ (cohérentes avec le catalogue) ---------- */
const BASE_CLICKS: Record<string, number> = {
  "neuroform-ai": 87,
  pixelpeek: 152,
  clipforge: 64,
  termvault: 41,
  reposentinel: 29,
  hydrotrack: 203,
  fokusflow: 118,
  "dev-independant": 96,
  "prompt-alchemy": 77,
  "megapack-prompts": 134,
  "flowbridge-n8n": 58,
  zenpost: 45,
};

const DAY_KEY = (offset: number) => new Date(Date.now() - offset * DAY).toISOString().slice(0, 10);
const VISITS_7D = [182, 214, 196, 243, 268, 312, 287];

export function seedAnalytics() {
  const clicksByProduct: Record<string, number> = { ...BASE_CLICKS };
  const visitsByDay: Record<string, number> = {};
  VISITS_7D.forEach((v, i) => {
    visitsByDay[DAY_KEY(i)] = v;
  });
  return {
    visits: 1247,
    actionsTotal: Object.values(BASE_CLICKS).reduce((a, b) => a + b, 0),
    clicksByProduct,
    visitsByDay,
    /* Présence de départ : 3 visiteurs "actifs" pour un dashboard vivant */
    recentVisits: [Date.now() - 9_000, Date.now() - 24_000, Date.now() - 47_000],
    updatedAt: Date.now(),
  };
}
