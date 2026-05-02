import { cn } from '@/lib/utils';

interface PercentageSliderProps {
  value: number | undefined;
  onChange: (v: number) => void;
}

const SLIDER_MIN = 0;
const SLIDER_MAX = 100;

/**
 * Custom-styled range slider. The native `<input type="range">` thumb visually
 * lags by half-its-width at the extremes (browser quirk), so the user reads
 * "100%" as label but sees the thumb sitting one tick short of the right edge.
 * We fix that by pinning the thumb to the track and rendering the fill via a
 * gradient — at 100 the fill covers the full track and the thumb sits flush.
 */
export const PercentageSlider = ({ value, onChange }: PercentageSliderProps): React.JSX.Element => {
  const v = value ?? 0;
  const fillPct = `${v}%`;
  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: fillPct }}
        />
        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Rollout percentage"
          className={cn(
            'absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent',
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary',
            '[&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-md',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
            '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2',
            '[&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background',
            '[&::-moz-range-track]:bg-transparent',
          )}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
};
