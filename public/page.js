/* ============================================================================
   ARSENAL v3.0 - JavaScript pour la page publique
   Gestion des événements, filtres, modales, etc.
   ========================================================================== */

(function() {
  'use strict';

  console.log('🚀 Arsenal v3.0 JavaScript chargé');

  // === VARIABLES ===
  let currentCategory = 'all';
  let currentBadges = [];
  let currentSort = 'popular';
  let products = [];
  let filteredProducts = [];

  // === ÉLÉMENTS DOM ===
  const elements = {
    filters: {
      all: document.querySelector('[data-category="all"]'),
      saas: document.querySelector('[data-category="saas"]'),
      desktop: document.querySelector('[data-category="desktop"]'),
      mobile: document.querySelector('[data-category="mobile"]'),
      ebook: document.querySelector('[data-category="ebook"]'),
      prompts: document.querySelector('[data-category="prompts"]'),
    },
    badges: {
      gratuit: document.querySelector('[data-badge="gratuit"]'),
      premium: document.querySelector('[data-badge="premium"]'),
      beta: document.querySelector('[data-badge="beta"]'),
      nouveau: document.querySelector('[data-badge="nouveau"]'),
    },
    sort: document.getElementById('sort-select'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    resultsCount: document.getElementById('results-count'),
    resetFilters: document.getElementById('reset-filters'),
    productGrid: document.getElementById('product-grid'),
    emptyState: document.getElementById('empty-state'),
    brandHome: document.getElementById('brand-home'),
    adminLink: document.querySelector('[href="#admin"]'),
  };

  // === DONNÉES PRODUITS (exemple) ===
  const sampleProducts = [
    {
      id: 'neuroform-ai',
      title: 'NeuroForm AI',
      shortDescription: 'Le générateur de formulaires intelligents qui crée, teste et optimise vos formulaires en 30 secondes.',
      description: 'NeuroForm IA génère des formulaires complets à partir d\'une simple description textuelle, puis les optimise en continu grâce au machine learning.',
      category: 'saas',
      actionType: 'chariow',
      badges: ['premium', 'nouveau'],
      price: '14,90 €/mois',
      actionUrl: 'https://checkout.chariow.com/neuroform-pro',
      imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/54ae361e5a6f.webp',
      clicks: 0,
    },
    {
      id: 'pixelpeek',
      title: 'PixelPeek API',
      shortDescription: 'API de captures d\'écran pixel-perfect de n\'importe quelle page web, en 200 ms.',
      description: 'PixelPeek transforme n\'importe quelle URL en capture d\'écran haute définition via une simple requête REST.',
      category: 'saas',
      actionType: 'chariow',
      badges: ['gratuit', 'beta'],
      price: 'Gratuit',
      actionUrl: 'https://checkout.chariow.com/pixelpeek-free',
      imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/e5d6942c6b49.png',
      clicks: 0,
    },
    {
      id: 'clipforge',
      title: 'ClipForge',
      shortDescription: 'Gestionnaire de presse-papiers pour développeurs : historique infini, snippets et recherche instantanée.',
      description: 'ClipForge garde en mémoire chaque élément copié avec un historique illimité et une recherche instantanée.',
      category: 'desktop',
      actionType: 'terminal',
      badges: ['nouveau', 'gratuit'],
      price: 'Gratuit',
      actionUrl: 'https://github.com/beta-arsenal/clipforge',
      imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/49eb45023c1e.jpg',
      clicks: 0,
    },
    {
      id: 'termvault',
      title: 'TermVault',
      shortDescription: 'Coffre-fort de mots de passe en ligne de commande, chiffré localement, compatible teams.',
      description: 'TermVault ramène la sécurité au terminal : vos secrets sont chiffrés localement puis synchronisés de bout en bout.',
      category: 'desktop',
      actionType: 'terminal',
      badges: ['premium'],
      price: '9,90 € — licence',
      actionUrl: 'https://github.com/beta-arsenal/termvault',
      imageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/164df61d5fa8.jpg',
      clicks: 0,
    },
  ];

  // === INITIALISATION ===
  function init() {
    console.log('🔧 Initialisation Arsenal v3.0');
    products = sampleProducts;
    renderProducts();
    attachEventListeners();
  }

  // === RENDU DES PRODUITS ===
  function renderProducts() {
    filteredProducts = [...products];

    // Filtrer par catégorie
    if (currentCategory !== 'all') {
      filteredProducts = filteredProducts.filter(p => p.category === currentCategory);
    }

    // Filtrer par badges
    if (currentBadges.length > 0) {
      filteredProducts = filteredProducts.filter(p =>
        currentBadges.some(badge => p.badges.includes(badge))
      );
    }

    // Trier
    if (currentSort === 'recent') {
      filteredProducts.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      filteredProducts.sort((a, b) => b.clicks - a.clicks);
    }

    // Mettre à jour le compteur de résultats
    elements.resultsCount.textContent = `${filteredProducts.length} résultat${filteredProducts.length > 1 ? 's' : ''}`;

    // Afficher ou masquer le état vide
    if (filteredProducts.length === 0) {
      elements.productGrid.classList.add('hidden');
      elements.emptyState.classList.remove('hidden');
      elements.emptyState.classList.add('flex');
    } else {
      elements.productGrid.classList.remove('hidden');
      elements.emptyState.classList.add('hidden');
      elements.emptyState.classList.remove('flex');

      // Générer le HTML des cartes
      elements.productGrid.innerHTML = filteredProducts.map(product => `
        <div class="product-card flex flex-col rounded-[16px] border border-[#333] bg-[#141414] overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5 hover:border-[#444444]" data-product-id="${product.id}">
          <div class="relative aspect-[16/10] overflow-hidden bg-[#1a1a1a]">
            <img src="${product.imageUrl}" alt="${product.title}" class="w-full h-full object-cover">
          </div>
          <div class="flex flex-col gap-2 p-4 flex-1">
            <h3 class="font-display font-semibold text-[1.1rem] leading-tight tracking-tight mb-0 line-clamp-2">
              ${product.title}
            </h3>
            <p class="text-sm text-[#a0a0a0] line-clamp-3 leading-relaxed">
              ${product.shortDescription}
            </p>
            <div class="mt-auto pt-4 border-t border-[#333] flex items-center justify-between gap-2">
              <span class="font-mono text-sm font-semibold text-[#f0f0f0]">${product.price}</span>
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-[#e63946] transition-all hover:gap-2">
                Voir
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      `).join('');

    }
  }

  // === ATTACHER LES ÉVÉNEMENTS ===
  function attachEventListeners() {
    // Filtres catégories
    Object.entries(elements.filters).forEach(([key, element]) => {
      if (element) {
        element.addEventListener('click', () => {
          currentCategory = key;
          updateFilterButtons();
          renderProducts();
        });
      }
    });

    // Filtres badges
    Object.entries(elements.badges).forEach(([key, element]) => {
      if (element) {
        element.addEventListener('click', () => {
          toggleBadge(key);
          updateBadgeButtons();
          renderProducts();
        });
      }
    });

    // Tri
    if (elements.sort) {
      elements.sort.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderProducts();
      });
    }

    // Recherche
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length > 0) {
          filteredProducts = filteredProducts.filter(p =>
            p.title.toLowerCase().includes(query) ||
            p.shortDescription.toLowerCase().includes(query)
          );
        } else {
          renderProducts();
        }
      });
    }

    // Effacer la recherche
    if (elements.searchClear) {
      elements.searchClear.addEventListener('click', () => {
        if (elements.searchInput) {
          elements.searchInput.value = '';
          renderProducts();
        }
      });
    }

    // Reset filtres
    if (elements.resetFilters) {
      elements.resetFilters.addEventListener('click', () => {
        currentCategory = 'all';
        currentBadges = [];
        currentSort = 'popular';
        updateFilterButtons();
        updateBadgeButtons();
        if (elements.sort) {
          elements.sort.value = 'popular';
        }
        renderProducts();
      });
    }

    // Navigation vers admin
    if (elements.adminLink) {
      elements.adminLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = 'admin';
      });
    }

    // Navigation vers l'accueil
    if (elements.brandHome) {
      elements.brandHome.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '';
      });
    }

    // Clic sur les cartes produits
    elements.productGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.product-card');
      if (card) {
        const productId = card.dataset.productId;
        const product = products.find(p => p.id === productId);
        if (product) {
          openProductModal(product);
        }
      }
    });
  }

  // === GESTION DES FILTRES ===
  function updateFilterButtons() {
    Object.entries(elements.filters).forEach(([key, element]) => {
      if (element) {
        element.setAttribute('aria-pressed', key === currentCategory);
      }
    });
  }

  function toggleBadge(badge) {
    const index = currentBadges.indexOf(badge);
    if (index > -1) {
      currentBadges.splice(index, 1);
    } else {
      currentBadges.push(badge);
    }
  }

  function updateBadgeButtons() {
    Object.entries(elements.badges).forEach(([key, element]) => {
      if (element) {
        const isActive = currentBadges.includes(key);
        element.setAttribute('aria-pressed', isActive);
      }
    });
  }

  // === MODALE PRODUIT ===
  function openProductModal(product) {
    console.log('📱 Ouverture de la modale pour:', product.title);

    // Créer la modale
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-panel">
        <button class="modal-close" aria-label="Fermer">
          <svg viewBox="0 0 24 24" width="36" height="36">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        <div class="modal-body">
          <div class="pm-head">
            <div class="pm-cover">
              <img src="${product.imageUrl}" alt="${product.title}">
            </div>
            <div class="pm-titles">
              <div class="pm-badges">
                ${product.badges.map(badge => `
                  <span class="b b-${badge}">${badge}</span>
                `).join('')}
              </div>
              <h2 class="pm-title">${product.title}</h2>
              <div class="pm-meta">
                <span>
                  <svg viewBox="0 0 24 24" width="13" height="13">
                    <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  ${product.category}
                </span>
                <span>
                  <svg viewBox="0 0 24 24" width="13" height="13">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4"/>
                  </svg>
                  ${product.price}
                </span>
              </div>
            </div>
          </div>
          <div class="pm-section">
            <h3 class="pm-section-title">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path d="M14 3v7h-2V5h-2v5h-2V3h6zm0 9v8h-2v-6h-2v6h-2v-8h6z"/>
              </svg>
              Description
            </h3>
            <p class="pm-description">${product.description}</p>
          </div>
          <div class="pm-section">
            <h3 class="pm-section-title">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path d="M5 12h14"/>
              </svg>
              Action
            </h3>
            <a href="${product.actionUrl}" target="_blank" rel="noopener" class="btn btn-primary">
              ${product.actionType === 'terminal' ? 'Copier la commande' : 'Accéder au produit'}
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M5 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Fermer la modale au clic sur le bouton
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
      modal.remove();
    });

    // Fermer au clic en dehors
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        modal.remove();
      }
    });

    console.log('✅ Modale ouverte avec succès');
  }

  // === INITIALISATION AU CHARGEMENT ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
