import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';

interface BentoCard {
  title: string;
  blurb: string;
  icon: string;
  prompt: string;
  tone: 'tertiary' | 'secondary' | 'primary';
  cta: string;
}

const CARDS: BentoCard[] = [
  {
    title: 'Analyze data',
    blurb: 'Upload spreadsheets or JSON for deep insights and visualization.',
    icon: 'analytics',
    prompt: "I have a dataset I'd like to analyze. Walk me through what you'd need from me.",
    tone: 'tertiary',
    cta: 'Start exploration',
  },
  {
    title: 'Write copy',
    blurb: 'Generate marketing headlines, blog posts, or professional emails.',
    icon: 'auto_fix_high',
    prompt: 'Draft a launch announcement for a SaaS product. I will share the audience and tone.',
    tone: 'secondary',
    cta: 'Draft content',
  },
  {
    title: 'Code help',
    blurb: 'Explain a snippet, refactor a function, or pair on a feature.',
    icon: 'terminal',
    prompt: 'Help me understand a piece of code and how to test it.',
    tone: 'primary',
    cta: 'Pair up',
  },
];

const TONE_STYLES: Record<BentoCard['tone'], { wash: string; iconBox: string; cta: string }> = {
  tertiary: {
    wash: 'bg-tertiary/20 group-hover:bg-tertiary/40',
    iconBox:
      'bg-tertiary/15 border-tertiary/30 text-tertiary shadow-[0_0_24px_hsl(var(--tertiary)/0.25)]',
    cta: 'text-tertiary',
  },
  secondary: {
    wash: 'bg-secondary/20 group-hover:bg-secondary/40',
    iconBox:
      'bg-secondary/15 border-secondary/30 text-secondary shadow-[0_0_24px_hsl(var(--secondary)/0.25)]',
    cta: 'text-secondary',
  },
  primary: {
    wash: 'bg-primary-container/25 group-hover:bg-primary-container/45',
    iconBox:
      'bg-primary-container/20 border-primary-container/40 text-primary shadow-[0_0_24px_hsl(var(--primary-container)/0.35)]',
    cta: 'text-primary',
  },
};

interface Props {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const WelcomeBento = ({ onSelect, disabled }: Props): React.JSX.Element => (
  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
    {CARDS.map((card) => {
      const style = TONE_STYLES[card.tone];
      return (
        <button
          key={card.title}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(card.prompt)}
          className="group relative overflow-hidden rounded-3xl border border-white/10 bg-surface-container/30 p-8 text-left backdrop-blur-xl transition-all duration-500 hover:bg-surface-container/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div
            className={cn(
              'absolute -right-8 -top-8 h-48 w-48 rounded-full blur-3xl transition-all duration-500',
              style.wash,
            )}
            aria-hidden
          />
          <div
            className={cn(
              'mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border',
              style.iconBox,
            )}
          >
            <MaterialIcon name={card.icon} className="text-3xl" />
          </div>
          <h3 className="mb-2 text-headline-md text-on-surface">{card.title}</h3>
          <p className="text-sm text-on-surface-variant">{card.blurb}</p>
          <div className={cn('mt-8 flex items-center gap-2 text-sm font-bold', style.cta)}>
            {card.cta}
            <MaterialIcon name="arrow_forward" className="text-base" />
          </div>
        </button>
      );
    })}
  </div>
);
