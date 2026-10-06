"use client";

/**
 * Internationalisation légère — dictionnaire côté navigateur, sans routes /en
 * (la sortie de l'export statique reste identique côté HTML).
 *
 * Contrat anti-hydratation : le rendu initial (HTML pré-rendu au build ET
 * premier render client) est TOUJOURS en français ; la préférence réelle
 * (localStorage « arsenal_lang », sinon navigator.language) n'est lue qu'après
 * montage, dans un useEffect → aucun mismatch d'hydratation.
 *
 * Vague 1 : header + footer publics. L'administration n'est pas traduite.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Lang = "fr" | "en";

export const DEFAULT_LANG: Lang = "fr";

/** Clé localStorage — contrat : `arsenal_lang = "fr" | "en"` */
const LANG_STORAGE_KEY = "arsenal_lang";

/** Langues proposées par le sélecteur (label = nom natif, utilisé en aria-label/title) */
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

/**
 * Dictionnaire vague 1 — clés snake_case préfixées par zone d'interface.
 * `header_login` et `header_account_aria` sont préparées pour BalancePill
 * (composant externe, traduit dans une vague ultérieure).
 */
const DICT: Record<Lang, Record<string, string>> = {
  fr: {
    header_home_aria: "Arsenal Tools — retour à l'accueil",
    header_login: "Connexion",
    header_account_aria: "Compte de {pseudo} — solde {balance} A",
    footer_copyright_part1: "Forge ouverte aux créateurs digitaux.",
    footer_privacy: "Confidentialité",
    footer_terms: "Conditions",
    footer_notice: "Mentions légales",
    lang_switch_aria: "Changer la langue",
    lang_fr: "Français",
    lang_en: "English",
    // Refonte 05/10 — navigation principale + menu
    nav_aria: "Navigation principale",
    nav_home: "Accueil",
    nav_catalog: "Catalogue",
    nav_feed: "Feed",
    menu_title: "Menu",
    menu_open_aria: "Ouvrir le menu",
    menu_close_aria: "Fermer le menu",
    drawer_account: "Compte",
    drawer_community: "Communauté",
    drawer_appearance: "Apparence",
    drawer_language: "Langue",
    drawer_info: "Informations",
    drawer_login: "Connexion",
    drawer_register: "Créer un compte",
    drawer_account_page: "Mon compte",
    drawer_cart: "Mon panier",
    drawer_wallet: "Portefeuille",
    drawer_mine: "Mes produits",
    drawer_affiliate: "Espace affilié",
    drawer_become_affiliate: "Programme d'affiliation",
    drawer_telegram: "Rejoindre Telegram",
    theme_system: "Système",
    theme_light: "Clair",
    theme_dark: "Sombre",
    // Accueil + catalogue + feed
    // Hero (spec « hero direct » 05/10) : promesse en 3 temps — titre, deux
    // « 3× » graphiques, sous-titre, CTA. Le « 3× » est rendu à part (élément
    // graphique rouge) : la clé ne contient que le libellé.
    home_hero_eyebrow: "Arsenal Tools",
    home_hero_title: "Rentabilisez vos idées.",
    home_promise_fast: "Plus vite",
    home_promise_cheap: "Moins cher",
    home_hero_sub:
      "SaaS, applications, automatisations et ressources numériques pour transformer vos idées en quelque chose de concret.",
    home_cta_explore: "Explorer l’arsenal",
    home_doors_title: "Deux portes, deux intentions",
    home_door_catalog_title: "Je cherche un outil",
    home_door_catalog_text: "Filtrez le catalogue par catégorie, badge, langue et popularité.",
    home_door_feed_title: "Je veux découvrir",
    home_door_feed_text: "Analyses, guides et coulisses — la couche éditoriale d'Arsenal Tools.",
    home_top_products: "Les plus populaires",
    home_latest_posts: "Derniers articles",
    home_see_all_catalog: "Tout le catalogue",
    home_see_all_feed: "Tout le feed",
    catalog_title: "Catalogue",
    catalog_sub: "Tous les outils Arsenal — recherche, filtres et tri.",
    feed_title: "Feed",
    feed_sub: "La couche éditoriale d'Arsenal Tools — analyse et découverte.",
    feed_empty: "Aucun article publié pour le moment.",
    feed_back: "Retour au feed",
    feed_read_more: "Lire plus",
    feed_collapse: "Réduire",
    feed_published_on: "Publié le",
    feed_related_product: "Produit présenté",
    feed_share: "Partager",
    feed_share_copied: "Lien copié.",
    // Vague 2 — contenu des pages
    // /affiliation — programme d'affiliation
    aff_eyebrow: "Programme d'affiliation",
    aff_hero_title: "Gagnez de l'argent en recommandant les produits Arsenal Tools.",
    aff_hero_sub:
      "Partagez les produits que vous aimez avec votre audience. Lorsqu'une personne achète via votre lien affilié, vous recevez une commission.",
    aff_cta_space: "Accéder à mon espace affilié",
    aff_cta_become: "Devenir affilié",
    aff_cta_login: "Se connecter",
    aff_cta_how: "Comment ça marche ?",
    aff_how_title: "Comment ça marche",
    aff_step1_title: "Choisissez",
    aff_step1_text: "Trouvez un produit Arsenal Tools que vous souhaitez recommander.",
    aff_step2_title: "Partagez",
    aff_step2_text: "Utilisez votre lien affilié personnel et partagez-le avec votre audience.",
    aff_step3_title: "Générez une vente",
    aff_step3_text:
      "Lorsqu'une personne achète via votre lien, la vente est attribuée à votre compte.",
    aff_step4_title: "Recevez votre commission",
    aff_step4_text: "Vous recevez une commission en argent réel sur la vente.",
    aff_chain_product: "Produit",
    aff_chain_link: "Lien",
    aff_chain_sale: "Vente",
    aff_chain_commission: "Commission",
    aff_commissions_title: "Les commissions",
    aff_commissions_text_1:
      "Le taux de commission est affiché sur la fiche de chaque produit. Le taux par défaut du programme est de",
    aff_commissions_rate: "30 %",
    aff_commissions_text_2:
      "du prix de vente ; certains produits appliquent un taux spécifique, et des campagnes temporaires peuvent le renforcer.",
    aff_example_meta: "Produit à {price} · commission {rate}",
    aff_example_earn: "Vous gagnez {earn}",
    aff_examples_note:
      "Exemples calculés sur des produits réellement au catalogue, au taux affiché sur leur fiche. Vos gains réels dépendent des ventes effectivement générées.",
    aff_cycle_title: "Le cycle d'une commission",
    aff_cycle_confirmed: "Vente confirmée",
    aff_cycle_validated: "Commission validée",
    aff_cycle_payable: "Payable",
    aff_cycle_paid: "Payée",
    aff_cycle_text:
      "Les commissions validées sont payées par Arsenal Tools après vérification des ventes. Une vente annulée ou remboursée entraîne l'annulation de la commission associée.",
    aff_real_title: "Vos ventes génèrent de vraies commissions",
    aff_real_text:
      "Lorsqu'une vente est réalisée grâce à votre lien affilié, vous recevez une commission en argent réel. Ce que vous gagnez correspond à des ventes réellement passées, pas à des mécanismes internes.",
    aff_real_note:
      "Aucun revenu n'est garanti : vos gains dépendent uniquement des ventes générées par vos recommandations.",
    aff_stats_title: "Suivez vos performances",
    aff_stats_intro: "Votre espace affilié affiche les statistiques réelles de votre activité :",
    aff_stat_clicks: "clics sur vos liens",
    aff_stat_sales: "ventes attribuées",
    aff_stat_conversion: "taux de conversion",
    aff_stat_history: "commissions et historique",
    aff_benefits_title: "Pourquoi rejoindre",
    aff_benefit1_title: "Gagnez sur vos ventes",
    aff_benefit1_text: "Chaque vente attribuée à votre lien peut générer une commission.",
    aff_benefit2_title: "Vos liens personnels",
    aff_benefit2_text: "Partagez des liens de suivi qui attribuent les ventes à votre compte.",
    aff_benefit3_title: "Suivez vos performances",
    aff_benefit3_text:
      "Suivez vos clics, vos ventes et vos commissions depuis votre espace affilié.",
    aff_benefit4_title: "Un catalogue à recommander",
    aff_benefit4_text:
      "Choisissez parmi les produits Arsenal Tools ceux qui correspondent à votre audience.",
    aff_benefit5_title: "Concentrez-vous sur la recommandation",
    aff_benefit5_text:
      "Vous n'avez pas à créer le produit vous-même : vous recommandez des produits existants.",
    aff_products_title: "Produits à recommander",
    aff_products_text:
      "Choisissez les produits qui correspondent le mieux à votre audience et recommandez-les avec votre lien affilié. Le catalogue est organisé en catégories :",
    aff_cat_saas: "SaaS",
    aff_cat_desktop: "Applications desktop",
    aff_cat_mobile: "Applications mobiles / PWA",
    aff_cat_ebook: "E-books",
    aff_cat_prompts: "Prompts & Automations",
    aff_products_limit:
      "Vous pouvez promouvoir jusqu'à 3 produits à la fois (20 ventes par lien, renouvelables), et davantage en participant aux campagnes.",
    aff_browse_catalog: "Parcourir le catalogue",
    aff_super_title: "Le statut Super Affilié",
    aff_super_text_1: "Une progression basée sur votre performance réelle : à partir de",
    aff_super_threshold: "10 ventes attribuées et 100 clics",
    aff_super_text_2: ", le statut Super Affilié vous ouvre :",
    aff_super_b1: "vos liens actifs ne sont plus plafonnés ;",
    aff_super_b2: "accès aux campagnes et à leurs conditions renforcées ;",
    aff_super_b3:
      "possibilité de demander la mise en affiliation d'un produit qui ne l'est pas encore.",
    aff_who_title: "Pour qui ?",
    aff_who_intro: "Le programme peut convenir notamment aux :",
    aff_aud1: "créateurs de contenu",
    aff_aud2: "entrepreneurs",
    aff_aud3: "développeurs",
    aff_aud4: "administrateurs de communautés",
    aff_aud5: "personnes disposant d'une audience",
    aff_aud6: "toute personne capable de faire des recommandations pertinentes",
    aff_faq_title: "Questions fréquentes",
    aff_faq1_q: "Combien puis-je gagner ?",
    aff_faq1_a:
      "Vos revenus dépendent du nombre de ventes réellement générées par vos liens, du prix des produits et du taux de commission applicable. Aucun montant n'est garanti.",
    aff_faq2_q: "Comment une vente est-elle attribuée à mon compte ?",
    aff_faq2_a:
      "Chaque affilié dispose de liens de suivi personnels. Quand un visiteur arrive via votre lien, un identifiant de suivi anonyme relie l'achat à votre compte. La règle appliquée est le dernier lien cliqué (dans une fenêtre de 30 jours).",
    aff_faq3_q: "Quand suis-je payé ?",
    aff_faq3_a:
      "Une commission suit un cycle : enregistrée, puis validée après confirmation de la vente, puis payable. Arsenal Tools effectue les paiements de commissions manuellement, après vérification des ventes.",
    aff_faq4_q: "Dois-je avoir une grosse audience ?",
    aff_faq4_a:
      "Pas nécessairement. La pertinence de vos recommandations compte davantage que la taille de votre audience : une recommandation juste à la bonne personne peut générer une vente.",
    aff_faq5_q: "Puis-je promouvoir plusieurs produits ?",
    aff_faq5_a:
      "Oui. Vous pouvez avoir 3 liens actifs en même temps (les liens liés à une campagne rejointe ne comptent pas dans ce plafond), et chaque lien est limité à 20 ventes attribuées — au-delà il est désactivé automatiquement et remplaçable.",
    aff_faq6_q: "Comment devenir affilié ?",
    aff_faq6_a:
      "Créez votre compte Arsenal Tools, puis déposez votre candidature depuis l'espace affilié. Elle est examinée et validée par Arsenal Tools — vous êtes prévenu dans votre espace.",
    aff_faq7_q: "Qu'est-ce qu'un Super Affilié ?",
    aff_faq7_a:
      "C'est un statut qui récompense la performance : à partir de 10 ventes attribuées et 100 clics, vos liens ne sont plus plafonnés et vous accédez aux campagnes ainsi qu'aux demandes de mise en affiliation de produits.",
    aff_faq8_q: "Est-ce que devenir affilié est payant ?",
    aff_faq8_a: "Non. La participation au programme est entièrement gratuite.",
    aff_faq9_q: "Les revenus sont-ils garantis ?",
    aff_faq9_a:
      "Non. Les commissions dépendent uniquement des ventes réellement générées grâce à vos liens.",
    aff_faq10_q: "Puis-je partager mes liens sur les réseaux sociaux ?",
    aff_faq10_a:
      "Oui, sur les canaux que vous maîtrisez et dans le respect des règles du programme : pas de spam (des limites quotidiennes de partage s'appliquent), pas de fausses promesses, pas de manipulation du suivi. L'auto-achat via son propre lien est interdit.",
    aff_cta_final_title: "Prêt à commencer ?",
    aff_cta_final_text:
      "Recommandez les produits Arsenal Tools et transformez vos recommandations en commissions.",
    aff_cta_free: "Participation gratuite. Règles détaillées dans les",
    aff_cta_terms: "conditions du programme d'affiliation",
    // /catalogue — recherche, filtres, tri, compteur, état vide
    catalog_search_placeholder: "Rechercher un outil, un e-book, un prompt…",
    catalog_aria_filters: "Filtres et tri des produits",
    catalog_aria_search: "Recherche globale instantanée",
    catalog_aria_clear: "Effacer la recherche",
    catalog_aria_category: "Filtrer par catégorie",
    catalog_aria_badge: "Filtrer par badge",
    catalog_aria_language: "Filtrer par langue",
    catalog_filter_all: "Tous",
    catalog_badges_label: "Badges",
    catalog_sort_label: "Tri",
    catalog_sort_popular: "Plus populaires",
    catalog_sort_recent: "Plus récents",
    catalog_lang_label: "Langue",
    catalog_count_none: "Aucun résultat",
    catalog_count_one: "outil affiché sur",
    catalog_count_plural: "outils affichés sur",
    catalog_demo_source: "catalogue de démonstration chargé",
    catalog_loading: "Chargement du catalogue…",
    catalog_reset: "Réinitialiser les filtres",
    catalog_empty_title: "Aucun outil ne correspond",
    catalog_empty_text: "Essayez un autre mot-clé ou modifiez les filtres actifs.",
    // /produit — fiche produit
    prod_loading: "Chargement…",
    prod_back_catalog: "Retour au catalogue",
    prod_not_found_title: "Produit introuvable",
    prod_not_found_text:
      "Cet outil n'existe pas ou plus. Il a peut-être été retiré du catalogue.",
    prod_deleted_title: "Ce produit n'est plus disponible",
    prod_deleted_text:
      "« {title} » a été retiré du catalogue. Si vous l'avez acheté, votre accès reste disponible depuis votre compte.",
    prod_discover_others: "Découvrir d'autres produits",
    prod_aria_back: "Retour",
    prod_cover_alt: "Couverture de {title}",
    prod_clicks: "{count} clics",
    prod_available_in: "Disponible en :",
    prod_description: "Description",
    prod_media_demo: "Média · démo",
    prod_access: "Accès · {category}",
    prod_unavailable_banner:
      "Ce produit est momentanément indisponible. Revenez plus tard — les liens de cette page restent valides.",
    prod_unavailable_buy:
      "L'achat est temporairement fermé pour ce produit. Suivez son retour depuis le catalogue.",
    // /connexion + /inscription — formulaires (les messages d'erreur SERVEUR ne passent pas ici)
    auth_login_title: "Connexion",
    auth_login_sub: "Accédez à votre espace et à votre solde A.",
    auth_login_error_generic: "Connexion impossible.",
    auth_field_identifier: "Email ou pseudo",
    auth_placeholder_identifier: "florian ou florian@example.com",
    auth_field_password: "Mot de passe",
    auth_show_password_aria: "Afficher/masquer le mot de passe",
    auth_confirm_show_aria: "Afficher/masquer la confirmation",
    auth_login_submit: "Se connecter",
    auth_no_account: "Pas encore de compte ?",
    auth_create_account_link: "Créer un compte",
    auth_register_title: "Créer un compte",
    auth_register_sub: "Créez votre compte Arsenal Tools — achats, affiliation et suivi d'activité.",
    auth_register_error_generic: "Inscription impossible.",
    auth_err_pseudo:
      "Le pseudo doit contenir entre 3 et 24 caractères (lettres, chiffres, « - » ou « _ »).",
    auth_err_email: "Email invalide.",
    auth_err_password: "Le mot de passe doit contenir au moins 8 caractères.",
    auth_err_confirm: "Les mots de passe ne correspondent pas.",
    auth_field_pseudo: "Pseudo",
    auth_placeholder_pseudo: "3 à 24 caractères — a-z, 0-9, - _",
    auth_field_email: "Email",
    auth_placeholder_email: "vous@example.com",
    auth_placeholder_password_min: "8 caractères minimum",
    auth_field_confirm: "Confirmer le mot de passe",
    auth_register_submit: "Créer mon compte",
    auth_already_account: "Déjà inscrit ?",
    // /r — page de pont du lien affilié
    r_link_inactive: "Ce lien d'affiliation est introuvable ou n'est plus actif.",
    r_too_many_attempts: "Trop de tentatives — réessayez dans une minute.",
    r_loading: "Redirection en cours…",
    r_no_code: "Aucun code affilié dans cette adresse.",
    r_error_title: "Lien indisponible",
    r_go_catalog: "Aller au catalogue",
  },
  en: {
    header_home_aria: "Arsenal Tools — back to home",
    header_login: "Sign in",
    header_account_aria: "Account: {pseudo} — balance {balance} A",
    footer_copyright_part1: "An open forge for digital creators.",
    footer_privacy: "Privacy",
    footer_terms: "Terms",
    footer_notice: "Legal notice",
    lang_switch_aria: "Change language",
    lang_fr: "Français",
    lang_en: "English",
    // Refonte 05/10 — header + drawer
    nav_aria: "Main navigation",
    nav_home: "Home",
    nav_catalog: "Catalog",
    nav_feed: "Feed",
    menu_title: "Menu",
    menu_open_aria: "Open menu",
    menu_close_aria: "Close menu",
    drawer_account: "Account",
    drawer_community: "Community",
    drawer_appearance: "Appearance",
    drawer_language: "Language",
    drawer_info: "Information",
    drawer_login: "Sign in",
    drawer_register: "Create an account",
    drawer_account_page: "My account",
    drawer_cart: "My cart",
    drawer_wallet: "Wallet",
    drawer_mine: "My products",
    drawer_affiliate: "Affiliate space",
    drawer_become_affiliate: "Affiliate program",
    drawer_telegram: "Join Telegram",
    theme_system: "System",
    theme_light: "Light",
    theme_dark: "Dark",
    // Home + catalog + feed
    home_hero_eyebrow: "Arsenal Tools",
    home_hero_title: "Make your ideas profitable.",
    home_promise_fast: "Faster",
    home_promise_cheap: "Cheaper",
    home_hero_sub:
      "SaaS, apps, automations and digital resources to turn your ideas into something concrete.",
    home_cta_explore: "Explore the arsenal",
    home_doors_title: "Two doors, two intents",
    home_door_catalog_title: "I'm looking for a tool",
    home_door_catalog_text: "Filter the catalog by category, badge, language and popularity.",
    home_door_feed_title: "I want to discover",
    home_door_feed_text: "Analysis, guides and behind the scenes — the editorial layer of Arsenal Tools.",
    home_top_products: "Most popular",
    home_latest_posts: "Latest articles",
    home_see_all_catalog: "Full catalog",
    home_see_all_feed: "Full feed",
    catalog_title: "Catalog",
    catalog_sub: "Every Arsenal tool — search, filters and sorting.",
    feed_title: "Feed",
    feed_sub: "The editorial layer of Arsenal Tools — analysis and discovery.",
    feed_empty: "No article published yet.",
    feed_back: "Back to feed",
    feed_read_more: "Read more",
    feed_collapse: "Show less",
    feed_published_on: "Published on",
    feed_related_product: "Featured product",
    feed_share: "Share",
    feed_share_copied: "Link copied.",
    // Vague 2 — traductions EN des cles de contenu (suite de l'agent interrompu)
    auth_err_email: "Enter a valid email.",
    aff_cta_space: "Go to my affiliate space",
    aff_faq1_a: "Your earnings depend on the number of sales actually generated by your links, product prices and the applicable commission rate. No amount is guaranteed.",
    aff_commissions_rate: "30%",
    aff_who_intro: "The program can be a good fit especially for:",
    aff_commissions_text_1: "The commission rate is shown on each product page. The program default is",
    aff_faq8_a: "No. Joining the program is completely free.",
    aff_stats_intro: "Your affiliate space shows the real numbers of your activity:",
    auth_login_sub: "Welcome back — sign in to access your account.",
    aff_stat_clicks: "clicks on your links",
    auth_register_error_generic: "Unable to create the account. Check the fields and try again.",
    auth_placeholder_identifier: "you@example.com",
    catalog_empty_title: "No tool matches",
    r_go_catalog: "Go to the catalog",
    aff_aud4: "community managers",
    r_too_many_attempts: "Too many attempts — try again in a minute.",
    r_error_title: "Link unavailable",
    aff_faq8_q: "Is becoming an affiliate paid?",
    aff_benefit2_text: "Share tracking links that credit sales to your account.",
    catalog_lang_label: "Language",
    aff_real_title: "Your sales generate real commissions",
    aff_faq_title: "Frequently asked questions",
    aff_faq2_a: "Each affiliate gets personal tracking links. When a visitor arrives through your link, an anonymous tracking identifier ties the purchase to your account. The applied rule is the last affiliate link clicked (within a 30-day window).",
    catalog_filter_all: "All",
    prod_unavailable_buy: "Purchasing is temporarily closed for this product. Follow its return from the catalog.",
    auth_register_title: "Create an account",
    aff_step3_text: "When someone buys through your link, the sale is credited to your account.",
    aff_cat_prompts: "Prompts & Automations",
    aff_cycle_confirmed: "Sale confirmed",
    aff_cta_final_title: "Ready to start?",
    aff_benefit5_text: "You don\'t build the product yourself: you recommend existing ones.",
    aff_products_text: "Choose the products that best match your audience and recommend them with your affiliate link. The catalog is organized in categories:",
    aff_step3_title: "Generate a sale",
    aff_stats_title: "Track your performance",
    aff_benefit1_text: "Every sale credited to your link can generate a commission.",
    catalog_count_plural: "tools shown of",
    aff_step1_title: "Choose",
    aff_aud3: "developers",
    aff_chain_link: "Link",
    aff_cat_desktop: "Desktop apps",
    prod_discover_others: "Discover other products",
    aff_step1_text: "Find an Arsenal Tools product you want to recommend.",
    aff_cta_free: "Joining is free. Detailed rules in the",
    aff_how_title: "How it works",
    r_no_code: "Missing link code.",
    aff_aud1: "content creators",
    catalog_aria_badge: "Filter by badge",
    prod_description: "Description",
    prod_clicks: "clicks",
    aff_chain_commission: "Commission",
    auth_field_identifier: "Email or pseudo",
    catalog_sort_recent: "Most recent",
    aff_faq4_a: "Not necessarily. The relevance of your recommendations matters more than audience size: one accurate recommendation to the right person can generate a sale.",
    aff_commissions_title: "Commissions",
    aff_super_text_2: ", the Super Affiliate status unlocks:",
    aff_faq3_q: "When do I get paid?",
    aff_example_meta: "{price} product · {rate} commission",
    catalog_loading: "Loading the catalog…",
    aff_faq7_a: "It\'s a status rewarding proven performance: from 10 credited sales and 100 clicks, your links are no longer capped and you get access to campaigns and to product-availability requests.",
    aff_faq9_a: "No. Commissions depend solely on the sales actually generated through your links.",
    aff_faq10_q: "Can I share my links on social media?",
    prod_media_demo: "Media · demo",
    aff_aud5: "people with an audience",
    auth_login_error_generic: "Unable to sign in. Check your details and try again.",
    aff_who_title: "Who is it for?",
    aff_faq6_a: "Create your Arsenal Tools account, then apply from the affiliate space. Your application is reviewed and validated by Arsenal Tools — you are notified in your space.",
    aff_faq2_q: "How is a sale credited to my account?",
    aff_faq5_q: "Can I promote several products?",
    aff_benefit4_text: "Pick the Arsenal Tools products that fit your audience.",
    prod_unavailable_banner: "This product is temporarily unavailable. Come back later — the links on this page remain valid.",
    aff_stat_conversion: "conversion rate",
    catalog_aria_filters: "Product filters and sorting",
    auth_register_sub: "One account to buy, recommend and follow your activity.",
    aff_cta_how: "How does it work?",
    aff_products_limit: "You can promote up to 3 products at a time (20 sales per link, renewable), and more by joining campaigns.",
    catalog_empty_text: "Try another keyword or change the active filters.",
    prod_back_catalog: "Back to catalog",
    aff_eyebrow: "Affiliate program",
    aff_faq10_a: "Yes, on the channels you control and within the program rules: no spam (daily share limits apply), no false promises, no tracking manipulation. Buying through your own link is forbidden.",
    catalog_aria_category: "Filter by category",
    catalog_aria_clear: "Clear search",
    catalog_demo_source: " — demo catalog loaded",
    catalog_reset: "Reset filters",
    aff_browse_catalog: "Browse the catalog",
    auth_field_pseudo: "Pseudo",
    aff_real_note: "No income is guaranteed: your earnings depend solely on the sales generated by your recommendations.",
    aff_step2_title: "Share",
    auth_field_email: "Email",
    aff_chain_sale: "Sale",
    aff_hero_title: "Earn money recommending Arsenal Tools products.",
    aff_faq9_q: "Are earnings guaranteed?",
    auth_placeholder_pseudo: "3–24 characters",
    auth_field_password: "Password",
    prod_access: "Access",
    auth_field_confirm: "Confirm password",
    auth_err_confirm: "Passwords don\'t match.",
    prod_deleted_title: "This product is no longer available",
    aff_step4_text: "You receive a real-money commission on the sale.",
    auth_placeholder_email: "you@example.com",
    aff_cta_terms: "affiliate program terms",
    aff_commissions_text_2: "of the sale price; some products use a specific rate, and temporary campaigns can boost it.",
    aff_cta_become: "Become an affiliate",
    aff_benefit2_title: "Your personal links",
    aff_benefit1_title: "Earn on your sales",
    aff_cat_ebook: "E-books",
    aff_super_b2: "access to campaigns and their boosted terms;",
    catalog_sort_label: "Sort",
    prod_deleted_text: "has been removed from the catalog. If you bought it, your access remains available from your account.",
    aff_faq3_a: "A commission follows a cycle: recorded, then validated after the sale is confirmed, then payable. Arsenal Tools pays commissions manually, after sales verification.",
    aff_cycle_payable: "Payable",
    aff_chain_product: "Product",
    r_link_inactive: "This affiliate link is no longer active.",
    aff_faq4_q: "Do I need a large audience?",
    aff_super_text_1: "A progression based on your real performance: from",
    auth_no_account: "No account yet?",
    prod_cover_alt: "Cover of",
    auth_already_account: "Already have an account?",
    aff_step4_title: "Receive your commission",
    auth_login_submit: "Sign in",
    aff_benefit3_title: "Track your performance",
    catalog_aria_language: "Filter by language",
    catalog_count_one: "tool shown of",
    prod_loading: "Loading…",
    r_loading: "Redirecting…",
    aff_super_threshold: "10 credited sales and 100 clicks",
    aff_cycle_validated: "Commission validated",
    aff_cat_saas: "SaaS",
    auth_show_password_aria: "Show password",
    catalog_search_placeholder: "Search a tool, an e-book, a prompt…",
    auth_register_submit: "Create my account",
    aff_benefit3_text: "Follow your clicks, sales and commissions from your affiliate space.",
    aff_faq7_q: "What is a Super Affiliate?",
    prod_available_in: "Available in:",
    aff_cycle_title: "The life of a commission",
    auth_confirm_show_aria: "Show password confirmation",
    aff_cycle_text: "Validated commissions are paid by Arsenal Tools after sales verification. A cancelled or refunded sale cancels the associated commission.",
    aff_real_text: "When a sale goes through your affiliate link, you receive a commission in real money. What you earn reflects actual sales, not internal mechanisms.",
    aff_benefits_title: "Why join",
    aff_aud2: "entrepreneurs",
    prod_not_found_text: "This tool doesn\'t exist (or anymore). It may have been removed from the catalog.",
    aff_benefit5_title: "Focus on recommending",
    prod_aria_back: "Back",
    prod_not_found_title: "Product not found",
    aff_faq1_q: "How much can I earn?",
    auth_login_title: "Sign in",
    aff_super_b3: "the ability to request a product be opened to affiliation.",
    aff_example_earn: "You earn {earn}",
    aff_faq6_q: "How do I become an affiliate?",
    catalog_aria_search: "Instant global search",
    auth_placeholder_password_min: "Your password",
    aff_cta_final_text: "Recommend Arsenal Tools products and turn your recommendations into commissions.",
    aff_faq5_a: "Yes. You can have 3 active links at a time (links tied to a campaign you joined don\'t count against this cap), and each link is limited to 20 credited sales — beyond that it is automatically disabled and replaceable.",
    aff_super_title: "The Super Affiliate status",
    aff_hero_sub: "Share the products you love with your audience. When someone buys through your affiliate link, you earn a commission.",
    aff_benefit4_title: "A catalog to recommend",
    aff_super_b1: "your active links are no longer capped;",
    auth_err_pseudo: "Enter your pseudo.",
    aff_step2_text: "Use your personal affiliate link and share it with your audience.",
    aff_cta_login: "Sign in",
    aff_stat_history: "commissions and history",
    catalog_count_none: "No result",
    auth_create_account_link: "Create one",
    catalog_badges_label: "Badges",
    auth_err_password: "Password: at least 8 characters.",
    aff_cycle_paid: "Paid",
    aff_examples_note: "Examples computed on products actually in the catalog, at the rate shown on their page. Your real earnings depend on the sales you actually generate.",
    aff_products_title: "Products to recommend",
    aff_aud6: "anyone able to make relevant recommendations",
    catalog_sort_popular: "Most popular",
    aff_cat_mobile: "Mobile apps / PWA",
    aff_stat_sales: "credited sales",
  },
};

function isLang(value: string | null): value is Lang {
  return value === "fr" || value === "en";
}

/**
 * Préférence stockée si présente, sinon langue du navigateur :
 * préfixe « en » → EN, tout le reste → FR (langue de base).
 */
function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* stockage indisponible (mode privé strict…) — repli sur le navigateur */
  }
  const navLang = typeof navigator !== "undefined" ? navigator.language : "";
  return navLang.toLowerCase().startsWith("en") ? "en" : DEFAULT_LANG;
}

/** Remplace les jetons `{nom}` par les valeurs fournies. */
function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : token,
  );
}

type I18nValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Rendu initial déterministe : toujours FR (identique au HTML pré-rendu).
  // La préférence n'est appliquée qu'après montage, juste en dessous.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  /** Change la langue et la persiste. */
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* stockage indisponible : le choix reste valable pour la session */
    }
  }, []);

  // Anti-hydratation : lecture de localStorage / navigator.language UNIQUEMENT
  // après montage. Si la préférence détectée diffère de la langue rendue,
  // on l'applique (et on la persiste, y compris la détection du navigateur).
  useEffect(() => {
    const detected = detectLang();
    if (detected !== DEFAULT_LANG) setLang(detected);
  }, [setLang]);

  /** Traduit une clé (repli : FR, puis la clé brute) et interpole `{vars}`. */
  const t = useCallback(
    (key: string, vars?: Record<string, string>) =>
      interpolate(DICT[lang][key] ?? DICT[DEFAULT_LANG][key] ?? key, vars),
    [lang],
  );

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Contexte i18n — lève une erreur si le provider est absent (bug de montage). */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n doit être utilisé sous <LanguageProvider>.");
  return ctx;
}
