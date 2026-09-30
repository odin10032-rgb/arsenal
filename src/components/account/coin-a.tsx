/**
 * Pièce A — effigie de la monnaie interne d'Arsenal Tools (modèle : brand-logo.tsx).
 * SVG inline : or mat 2 tons, anneau gravé, un seul highlight en arc, ombre douce.
 * Sobre et premium — aucun effet animé, aucun clin d'œil crypto.
 */

import { useId } from "react";

export function CoinA({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  // Id unique par instance (plusieurs pièces par page), sans caractères spéciaux pour url(#…)
  const gradientId = `coin-a-gold-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{ filter: "drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45))" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d98c" />
          <stop offset="100%" stopColor="#d4af37" />
        </linearGradient>
      </defs>

      {/* Disque de la pièce — or 2 tons (#d4af37 → #f0d98c) */}
      <circle
        cx="32"
        cy="32"
        r="29"
        fill={`url(#${gradientId})`}
        stroke="rgba(0, 0, 0, 0.35)"
        strokeWidth="1.5"
      />

      {/* Anneau intérieur gravé */}
      <circle cx="32" cy="32" r="24.5" fill="none" stroke="rgba(97, 74, 17, 0.55)" strokeWidth="1.5" />

      {/* Effigie : grand A (Space Grotesk, gras) */}
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="29"
        fontWeight="700"
        className="font-display"
        fill="#6b5410"
      >
        A
      </text>

      {/* Unique highlight en arc — lumière haut-gauche */}
      <path
        d="M11.8 24.6 A21.5 21.5 0 0 1 24.6 11.8"
        fill="none"
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
