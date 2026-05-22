import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid, Bike, Mountain, Car, Footprints, Snowflake, Waves, Building2, Rocket,
} from 'lucide-react';

export interface CategoryChipConfig {
  label: string;
  icon: LucideIcon;
  default: { bg: string; text: string; border: string };
  hover: { bg: string; text: string; border: string; shadow: string };
  active: { bg: string; text: string; border: string; shadow: string };
}

export const CHIP_CONFIG: Record<string, CategoryChipConfig> = {
  All: {
    label: 'Wszystkie',
    icon: LayoutGrid,
    default: { bg: 'rgba(255, 255, 255, 0.05)', text: '#94a3b8', border: 'rgba(255, 255, 255, 0.08)' },
    hover: { bg: 'rgba(255, 255, 255, 0.1)', text: '#f8fafc', border: 'rgba(255, 255, 255, 0.15)', shadow: '0 4px 12px rgba(168, 85, 247, 0.15)' },
    active: { bg: 'rgba(168, 85, 247, 0.15)', text: '#e9d5ff', border: 'rgba(168, 85, 247, 0.4)', shadow: '0 0 15px rgba(168, 85, 247, 0.3)' },
  },
  Motorcycling: {
    label: 'Motocykl',
    icon: Rocket,
    default: { bg: 'rgba(244, 63, 94, 0.06)', text: '#fda4af', border: 'rgba(244, 63, 94, 0.2)' },
    hover: { bg: 'rgba(244, 63, 94, 0.12)', text: '#fecdd3', border: 'rgba(244, 63, 94, 0.35)', shadow: '0 4px 12px rgba(244, 63, 94, 0.2)' },
    active: { bg: 'rgba(244, 63, 94, 0.2)', text: '#ffe4e6', border: 'rgba(244, 63, 94, 0.6)', shadow: '0 0 15px rgba(244, 63, 94, 0.35)' },
  },
  Cycling: {
    label: 'Rower',
    icon: Bike,
    default: { bg: 'rgba(16, 185, 129, 0.06)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.2)' },
    hover: { bg: 'rgba(16, 185, 129, 0.12)', text: '#a7f3d0', border: 'rgba(16, 185, 129, 0.35)', shadow: '0 4px 12px rgba(16, 185, 129, 0.2)' },
    active: { bg: 'rgba(16, 185, 129, 0.2)', text: '#d1fae5', border: 'rgba(16, 185, 129, 0.6)', shadow: '0 0 15px rgba(16, 185, 129, 0.35)' },
  },
  Hiking: {
    label: 'Piesze',
    icon: Mountain,
    default: { bg: 'rgba(245, 158, 11, 0.06)', text: '#fde047', border: 'rgba(245, 158, 11, 0.2)' },
    hover: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fef08a', border: 'rgba(245, 158, 11, 0.35)', shadow: '0 4px 12px rgba(245, 158, 11, 0.2)' },
    active: { bg: 'rgba(245, 158, 11, 0.2)', text: '#fef9c3', border: 'rgba(245, 158, 11, 0.6)', shadow: '0 0 15px rgba(245, 158, 11, 0.35)' },
  },
  Car: {
    label: 'Samochód',
    icon: Car,
    default: { bg: 'rgba(255, 255, 255, 0.05)', text: '#94a3b8', border: 'rgba(255, 255, 255, 0.08)' },
    hover: { bg: 'rgba(255, 255, 255, 0.1)', text: '#f8fafc', border: 'rgba(255, 255, 255, 0.15)', shadow: '0 4px 12px rgba(255, 255, 255, 0.15)' },
    active: { bg: 'rgba(255, 255, 255, 0.15)', text: '#e9d5ff', border: 'rgba(255, 255, 255, 0.4)', shadow: '0 0 15px rgba(255, 255, 255, 0.3)' },
  },
  Running: {
    label: 'Bieganie',
    icon: Footprints,
    default: { bg: 'rgba(255, 255, 255, 0.05)', text: '#94a3b8', border: 'rgba(255, 255, 255, 0.08)' },
    hover: { bg: 'rgba(255, 255, 255, 0.1)', text: '#f8fafc', border: 'rgba(255, 255, 255, 0.15)', shadow: '0 4px 12px rgba(255, 255, 255, 0.15)' },
    active: { bg: 'rgba(255, 255, 255, 0.15)', text: '#e9d5ff', border: 'rgba(255, 255, 255, 0.4)', shadow: '0 0 15px rgba(255, 255, 255, 0.3)' },
  },
  'Winter Sports': {
    label: 'Sporty zimowe',
    icon: Snowflake,
    default: { bg: 'rgba(255, 255, 255, 0.05)', text: '#94a3b8', border: 'rgba(255, 255, 255, 0.08)' },
    hover: { bg: 'rgba(255, 255, 255, 0.1)', text: '#f8fafc', border: 'rgba(255, 255, 255, 0.15)', shadow: '0 4px 12px rgba(255, 255, 255, 0.15)' },
    active: { bg: 'rgba(255, 255, 255, 0.15)', text: '#e9d5ff', border: 'rgba(255, 255, 255, 0.4)', shadow: '0 0 15px rgba(255, 255, 255, 0.3)' },
  },
  'Water Sports': {
    label: 'Sporty wodne',
    icon: Waves,
    default: { bg: 'rgba(255, 255, 255, 0.05)', text: '#94a3b8', border: 'rgba(255, 255, 255, 0.08)' },
    hover: { bg: 'rgba(255, 255, 255, 0.1)', text: '#f8fafc', border: 'rgba(255, 255, 255, 0.15)', shadow: '0 4px 12px rgba(255, 255, 255, 0.15)' },
    active: { bg: 'rgba(255, 255, 255, 0.15)', text: '#e9d5ff', border: 'rgba(255, 255, 255, 0.4)', shadow: '0 0 15px rgba(255, 255, 255, 0.3)' },
  },
  City: {
    label: 'Miasto',
    icon: Building2,
    default: { bg: 'rgba(14, 165, 233, 0.06)', text: '#7dd3fc', border: 'rgba(14, 165, 233, 0.2)' },
    hover: { bg: 'rgba(14, 165, 233, 0.12)', text: '#bae6fd', border: 'rgba(14, 165, 233, 0.35)', shadow: '0 4px 12px rgba(14, 165, 233, 0.2)' },
    active: { bg: 'rgba(14, 165, 233, 0.2)', text: '#e0f2fe', border: 'rgba(14, 165, 233, 0.6)', shadow: '0 0 15px rgba(14, 165, 233, 0.35)' },
  },
};

interface CategoryChipsBarProps {
  categories: { id: number; name: string }[];
  selectedCategory: number | null;
  onSelectCategory: (id: number | null) => void;
  allLabel?: string;
}

export default function CategoryChipsBar({
  categories,
  selectedCategory,
  onSelectCategory,
  allLabel = 'All',
}: CategoryChipsBarProps) {
  const renderChip = (
    key: string,
    config: CategoryChipConfig,
    isActive: boolean,
    onClick: () => void,
  ) => {
    const Icon = config.icon;
    const palette = isActive ? config.active : config.default;

    return (
      <button
        key={key}
        onClick={onClick}
        role="tab"
        aria-selected={isActive}
        className="shrink-0 inline-flex items-center rounded-full whitespace-nowrap transition-all duration-[180ms] ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9]/40 focus-visible:ring-offset-1"
        style={{
          height: 34,
          padding: '0 10px',
          gap: 6,
          fontSize: 13,
          fontWeight: 550,
          backgroundColor: palette.bg,
          color: palette.text,
          border: `1px solid ${palette.border}`,
          boxShadow: isActive ? (config.active.shadow || 'none') : 'none',
          transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.backgroundColor = config.hover.bg;
            e.currentTarget.style.color = config.hover.text;
            e.currentTarget.style.borderColor = config.hover.border;
            e.currentTarget.style.boxShadow = config.hover.shadow;
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.backgroundColor = config.default.bg;
            e.currentTarget.style.color = config.default.text;
            e.currentTarget.style.borderColor = config.default.border;
            e.currentTarget.style.boxShadow = 'none';
          }
        }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
        <span>{config.label}</span>
      </button>
    );
  };

  const allConfig = { ...CHIP_CONFIG['All'], label: allLabel };
  const isAllActive = selectedCategory === null;

  return (
    <div
      role="tablist"
      className="flex items-center gap-1.5 overflow-x-auto overflow-y-visible flex-1 scrollbar-hide py-1.5"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {renderChip('all', allConfig, isAllActive, () => onSelectCategory(null))}
      {categories.map((cat) => {
        const config = CHIP_CONFIG[cat.name] ?? CHIP_CONFIG['All'];
        const chipConfig = { ...config, label: cat.name };
        return renderChip(
          String(cat.id),
          chipConfig,
          selectedCategory === cat.id,
          () => onSelectCategory(selectedCategory === cat.id ? null : cat.id),
        );
      })}
    </div>
  );
}
