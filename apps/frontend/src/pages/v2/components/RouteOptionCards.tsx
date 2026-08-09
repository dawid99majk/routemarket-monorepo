import { Check, ChevronRight } from 'lucide-react';
import type { RouteOption } from '@routemarket/atlas-workflow/wizard-machine';

interface RouteOptionCardsProps {
  options: RouteOption[];
  /** Karty z odpowiedzi, na którą użytkownik już zareagował, są tylko podglądem historii. */
  disabled?: boolean;
  allowCustom?: boolean;
  onChoose: (option: RouteOption) => void;
}

export default function RouteOptionCards({ options, disabled, allowCustom, onChoose }: RouteOptionCardsProps) {
  if (!options || options.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {options.map((option) => (
        <button
          key={option.id || option.title}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(option)}
          className={`w-full text-left rounded-md border p-3 transition-all ${
            disabled
              ? 'border-border bg-muted/60 opacity-60 cursor-default'
              : 'border-border bg-white hover:border-primary hover:shadow-token-md hover:-translate-y-px cursor-pointer'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground text-sm leading-snug">{option.title}</div>
              {option.subtitle && (
                <div className="text-primary text-xs font-medium mt-0.5">{option.subtitle}</div>
              )}
              {option.description && (
                <p className="text-foreground/80 text-xs mt-1.5 leading-relaxed">{option.description}</p>
              )}
              {option.highlights && option.highlights.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {option.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="text-[11px] bg-muted text-foreground/80 rounded-full px-2 py-0.5"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {!disabled && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
            {disabled && <Check className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
          </div>
        </button>
      ))}
      {allowCustom && !disabled && (
        <p className="text-[11px] text-muted-foreground px-1">
          Możesz też po prostu napisać, czego chcesz — albo „generuj”, żeby pominąć pytania.
        </p>
      )}
    </div>
  );
}
