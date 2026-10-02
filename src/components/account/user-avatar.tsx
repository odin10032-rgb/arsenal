/**
 * Avatar utilisateur — identité du compte (ne jamais confondre avec la monnaie A).
 * Aucune photo en base (minimisation des données) : illustration par défaut
 * déterministe — 6 variantes géométriques de la palette Arsenal, choisies par
 * empreinte stable du compte — sur laquelle se superpose l'initiale du pseudo.
 * SVG inline, aucune requête réseau, lisible mobile et desktop.
 * (Modèle : coin-a.tsx / brand-logo.tsx.)
 */

const ACCENTS = ["#d4af37", "#2a9d8f", "#d4af37", "#2a9d8f", "#d4af37", "#2a9d8f"];

/** Empreinte stable et simple — le choix de variante n'a pas besoin de cryptographie. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function Motif({ variant, color }: { variant: number; color: string }) {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity: 0.5,
  };
  switch (variant % 6) {
    case 0: // hexagone
      return <path d="M33 20 26.5 31.3H13.5L7 20l6.5-11.3h13z" {...common} />;
    case 1: // écusson
      return <path d="M20 6l12 5v9c0 8-5.5 12.5-12 15-6.5-2.5-12-7-12-15v-9z" {...common} />;
    case 2: // double chevron
      return (
        <g {...common}>
          <path d="m10 23 10-10 10 10" />
          <path d="m10 30 10-10 10 10" />
        </g>
      );
    case 3: // anneaux concentriques
      return (
        <g {...common}>
          <circle cx="20" cy="20" r="12" />
          <circle cx="20" cy="20" r="6" />
        </g>
      );
    case 4: // visée
      return <path d="M20 7v7M20 26v7M7 20h7M26 20h7" {...common} />;
    default: // bandes diagonales
      return <path d="M8 26 26 8M14 32 32 14" {...common} />;
  }
}

export function UserAvatar({
  pseudo,
  seed,
  size = 24,
  className = "",
}: {
  pseudo: string;
  /** Empreinte stable du compte (id utilisateur) — repli : pseudo. */
  seed?: string;
  size?: number;
  className?: string;
}) {
  const variant = hashSeed(seed || pseudo) % 6;
  const initial = (pseudo.trim()[0] || "?").toUpperCase();

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={`Avatar de ${pseudo}`}
      className={`flex-shrink-0 rounded-full ${className}`}
    >
      <circle cx="20" cy="20" r="19.5" fill="#1a1a1a" stroke="#333" strokeWidth="1.2" />
      <Motif variant={variant} color={ACCENTS[variant]} />
      <text
        x="20"
        y="20.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="23"
        fontWeight="700"
        className="font-display"
        fill="#f0d98c"
      >
        {initial}
      </text>
    </svg>
  );
}
