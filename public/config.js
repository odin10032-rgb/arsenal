/* ============================== CONFIG ============================== */
/* Exposé sur window pour qu'app.js (window.CONFIG = window.CONFIG || {...})
   conserve cette configuration, y compris API_URL. */
window.CONFIG = {
  APP_NAME: "Arsenal Tools",
  VERSION: "3.0.0",
  API_URL: "https://arsenal-api.aimane-project-api.workers.dev",
  API_TIMEOUT: 2500,
  MAX_UPLOAD: 5 * 1024 * 1024,
  LS: {
    CATALOG: "ba_catalog_cache_v2",
    PRODUCTS: "ba_products_v2",
    ANALYTICS: "ba_analytics_v2",
    UPLOADS: "ba_uploads_v2",
    GITHUB: "ba_github_config",
    ADMIN_HASH: "ba_admin_hash",
  },
  SS: { TOKEN: "ba_admin_token" },
};
