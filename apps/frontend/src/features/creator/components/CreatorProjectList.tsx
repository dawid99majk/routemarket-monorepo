import { Project } from '@/features/creator/types/creator.types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock3, Map, Plus, Loader2 } from 'lucide-react';

interface CreatorProjectListProps {
  projects: Project[];
  loading: boolean;
  activeSlug: string | null;
  onSelectProject: (slug: string) => void;
  onCreateNew: () => void;
}

export function CreatorProjectList({ 
  projects, 
  loading, 
  activeSlug, 
  onSelectProject, 
  onCreateNew 
}: CreatorProjectListProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Ładowanie Twoich projektów...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Map className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Brak aktywnych projektów</h3>
        <p className="text-muted-foreground mb-6 max-w-xs">
          Nie masz jeszcze żadnych tras w asyście Magic AI. Zacznij tworzyć swoją pierwszą wielką przygodę!
        </p>
        <Button onClick={onCreateNew} className="gap-2">
          <Plus className="w-4 h-4" />
          Stwórz pierwszy projekt
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => (
        <Card 
          key={project.id}
          className={`cursor-pointer hover:border-primary/50 transition-all duration-300 overflow-hidden group ${
            activeSlug === project.id ? 'border-primary ring-1 ring-primary/20' : ''
          }`}
          onClick={() => onSelectProject(project.id)}
        >
          <CardContent className="p-0">
            <div className="h-32 bg-muted flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/20 group-hover:scale-110 transition-transform duration-500" />
              <Map className="w-12 h-12 text-muted-foreground/30 relative z-10" />
              <Badge className="absolute top-3 right-3 capitalize" variant="secondary">
                {project.category}
              </Badge>
            </div>
            <div className="p-5">
              <h4 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                {project.title}
              </h4>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-1">
                {project.region}
              </p>
              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="w-3 h-3" />
                  <span>{new Date(project.updatedAt as string).toLocaleDateString()}</span>
                </div>
                <Badge variant={project.status === 'completed' ? 'default' : 'outline'} className="text-[10px] px-2 py-0">
                  {project.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      
      <Card 
        className="cursor-pointer border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 flex flex-col items-center justify-center p-8 min-h-[260px]"
        onClick={onCreateNew}
      >
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Plus className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Dodaj nowy projekt</p>
      </Card>
    </div>
  );
}
