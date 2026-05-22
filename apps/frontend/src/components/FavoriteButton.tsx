import { Heart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToggleFavorite } from '@/hooks/use-favorites';
import { toast } from 'sonner';

interface FavoriteButtonProps {
  routeId: number;
  isFavorited: boolean;
  count?: number;
  showCount?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export default function FavoriteButton({ routeId, isFavorited, count = 0, showCount = false, size = 'sm', className = '' }: FavoriteButtonProps) {
  const { user, login } = useAuth();
  const toggleFavorite = useToggleFavorite();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      login();
      return;
    }
    toggleFavorite.mutate(
      { userId: user.id, routeId, isFavorited },
      {
        onSuccess: () => {
          toast.success(isFavorited ? 'Usunięto z ulubionych' : 'Dodano do ulubionych');
        },
        onError: () => {
          toast.error('Nie udało się zaktualizować ulubionych');
        },
      }
    );
  };

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      onClick={handleClick}
      disabled={toggleFavorite.isPending}
      className={`flex items-center gap-0.5 transition-colors ${isFavorited ? 'text-red-500' : 'text-muted-foreground hover:text-red-400'} ${className}`}
      title={isFavorited ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
    >
      <Heart className={`${iconSize} ${isFavorited ? 'fill-red-500' : ''} transition-all`} />
      {showCount && <span className="text-[10px]">{count}</span>}
    </button>
  );
}
