export interface Product {
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

export interface Analytics {
  visits: number;
  actionsTotal: number;
  clicksByProduct: Record<string, number>;
  visitsByDay: Record<string, number>;
  recentVisits: number[];
  updatedAt: number;
}

export interface MediaItem {
  name: string;
  url: string;
  kind: "image";
  size: number;
  uploadedAt: number;
}

export interface AppConfig {
  adminToken?: string;
}
