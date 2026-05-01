import { cn } from '@/lib/utils';

interface MaterialIconProps {
  name: string;
  filled?: boolean;
  weight?: number;
  className?: string;
  'aria-hidden'?: boolean;
}

/**
 * Wrapper around the Material Symbols Outlined font (loaded in index.html).
 * Pass `filled` for solid glyphs, `weight` (100..700) to override stroke weight.
 * Inherit color via Tailwind text-* classes.
 */
export const MaterialIcon = ({
  name,
  filled,
  weight,
  className,
  'aria-hidden': ariaHidden = true,
}: MaterialIconProps): React.JSX.Element => {
  const settings: string[] = [];
  if (filled) settings.push("'FILL' 1");
  if (weight) settings.push(`'wght' ${weight}`);
  const style = settings.length ? { fontVariationSettings: settings.join(', ') } : undefined;
  return (
    <span
      aria-hidden={ariaHidden}
      className={cn('material-symbols-outlined', className)}
      style={style}
    >
      {name}
    </span>
  );
};
