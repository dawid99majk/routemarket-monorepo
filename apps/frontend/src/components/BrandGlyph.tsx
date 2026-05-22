import compass from '@/assets/glyphs/compass.svg';
import elevation from '@/assets/glyphs/elevation.svg';
import routeMark from '@/assets/glyphs/route-mark.svg';

const GLYPHS = {
  compass,
  elevation,
  'route-mark': routeMark,
} as const;

export type GlyphName = keyof typeof GLYPHS;

interface BrandGlyphProps {
  name: GlyphName;
  className?: string;
  size?: number;
  alt?: string;
}

/**
 * Routemarket brand glyphs (Soft-Tech Outdoor).
 * SVGs are loaded as static assets — they keep their own stroke colors
 * (designed in ink/sage). Wrap with opacity / sizing via className.
 */
export default function BrandGlyph({ name, className = '', size = 24, alt = '' }: BrandGlyphProps) {
  return (
    <img
      src={GLYPHS[name]}
      alt={alt}
      width={size}
      height={size}
      className={className}
      aria-hidden={alt ? undefined : true}
      loading="lazy"
    />
  );
}