import { X } from 'lucide-react';
import type { ActiveChip } from '@/hooks/use-route-filters';

interface FilterChipsProps {
  chips: ActiveChip[];
  onRemove: (key: ActiveChip['key']) => void;
  onClearAll: () => void;
}

export default function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onRemove(chip.key)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors min-h-[36px]"
        >
          {chip.label}
          <X className="w-3 h-3" />
        </button>
      ))}
      {chips.length > 1 && (
        <button onClick={onClearAll} className="text-xs text-muted-foreground hover:text-foreground underline min-h-[36px]">
          Clear all
        </button>
      )}
    </div>
  );
}
