import { FILTER_PRESETS, type FilterPreset } from '@/hooks/use-route-filters';

interface FilterPresetsProps {
  activePreset: string | null;
  onApply: (preset: FilterPreset) => void;
}

export default function FilterPresets({ activePreset, onApply }: FilterPresetsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      <span className="text-xs text-muted-foreground shrink-0 font-medium">Quick:</span>
      {FILTER_PRESETS.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onApply(preset)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border min-h-[36px] ${
            activePreset === preset.id
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
          }`}
        >
          <span>{preset.icon}</span>
          {preset.label}
        </button>
      ))}
    </div>
  );
}
