import { Project } from '@/features/creator/types/creator.types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock3, Map, RefreshCw } from 'lucide-react';

interface CreatorHeaderProps {
  project: Project;
  onExit: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function CreatorHeader({ 
  project, 
  onExit, 
  onRefresh, 
  isRefreshing 
}: CreatorHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onExit}
          className="rounded-full"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
            <Badge variant="outline" className="capitalize">{project.category}</Badge>
            <Badge variant="secondary">{project.status}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Map className="w-3.5 h-3.5" />
              <span>{project.region}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5" />
              <span>Aktualizacja: {new Date(project.updatedAt as string).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Odśwież
        </Button>
      </div>
    </div>
  );
}
