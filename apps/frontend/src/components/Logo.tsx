import { Link } from 'react-router-dom';

interface LogoProps {
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm:  { text: 'text-base',   sub: 'text-[9px]',  mark: 22 },
  md:  { text: 'text-lg',     sub: 'text-[10px]', mark: 26 },
  lg:  { text: 'text-xl',     sub: 'text-[10px]', mark: 30 },
  xl:  { text: 'text-[26px]', sub: 'text-[11px]', mark: 36 },
} as const;

/**
 * RM Monogram — bold geometric mark.
 * A stacked "R/M" in a rotated square / diamond frame, with an
 * accent route-line slicing diagonally. Reads as: pin-drop, badge,
 * and route waypoint at once. Universal across moto / city / water / outdoor.
 */
function RMMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Rotated square badge — solid ink */}
      <g transform="rotate(45 20 20)">
        <rect
          x="4" y="4" width="32" height="32"
          rx="6"
          fill="hsl(var(--foreground))"
        />
      </g>
      {/* Diagonal route line — burnt accent */}
      <path
        d="M6 30 Q 14 22, 20 20 T 34 10"
        stroke="hsl(var(--accent))"
        strokeWidth="2.25"
        strokeLinecap="round"
        fill="none"
      />
      {/* Two waypoint dots */}
      <circle cx="6" cy="30" r="2" fill="hsl(var(--accent))" />
      <circle cx="34" cy="10" r="2.4" fill="hsl(var(--background))" stroke="hsl(var(--accent))" strokeWidth="1.5" />
      {/* Tiny RM monogram — quietly embossed */}
      <text
        x="20" y="24"
        textAnchor="middle"
        fontFamily="'Archivo Narrow', system-ui, sans-serif"
        fontWeight="700"
        fontSize="11"
        letterSpacing="0.05em"
        fill="hsl(var(--background))"
        opacity="0.92"
      >RM</text>
    </svg>
  );
}

export default function Logo({ showName = true, size = 'md', className = '' }: LogoProps) {
  const s = SIZES[size];

  return (
    <Link to="/" className={`group flex items-center gap-2.5 ${className}`} aria-label="RouteMarket — home">
      <RMMark size={s.mark} />
      {showName && (
        <span className="flex flex-col leading-none">
          <span
            className={`font-narrow ${s.text} text-foreground uppercase`}
            style={{ fontWeight: 700, letterSpacing: '0.04em' }}
          >
            Route<span className="text-accent">/</span>Market
          </span>
          <span
            className={`font-mono ${s.sub} text-muted-foreground/80 mt-1 uppercase`}
            style={{ letterSpacing: '0.32em' }}
          >
            find · ride · explore
          </span>
        </span>
      )}
    </Link>
  );
}