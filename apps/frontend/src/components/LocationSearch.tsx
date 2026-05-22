import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

interface LocationSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: { display_name: string; lat: number; lon: number }) => void;
  placeholder?: string;
  className?: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationSearch({ value, onChange, onSelect, placeholder, className }: LocationSearchProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=0`,
        { headers: { 'Accept-Language': 'pl' } }
      );
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setIsOpen(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (item: NominatimResult) => {
    onChange(item.display_name);
    onSelect({ display_name: item.display_name, lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
    setIsOpen(false);
    setSuggestions([]);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
      <Input
        value={value}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className={`pl-10 ${className ?? ''}`}
        maxLength={200}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {suggestions.map((item) => (
            <li
              key={item.place_id}
              className="px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/10 transition-colors flex items-start gap-2"
              onMouseDown={() => handleSelect(item)}
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="line-clamp-2">{item.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
