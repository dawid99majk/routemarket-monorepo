import { useState, useEffect } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { Project } from '@/features/creator/types/creator.types';
import { toast } from 'sonner';

export function useAtlasProjects() {
  const { invokeAtlas } = useAtlasApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await invokeAtlas('list_projects', { limit: 100 }) as { projects?: Project[] };
      const filteredProjects = (data.projects ?? []).filter(
        (project) => project.id !== '__system__' && project.category !== 'system'
      );
      setProjects(filteredProjects);
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas ładowania projektów: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (params: { topic: string, category: string, region: string, language: string }) => {
    try {
      const data = await invokeAtlas('create_project', params) as { project: Project };
      await fetchProjects();
      return data.project;
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas tworzenia projektu: ' + (err as Error).message);
      throw err;
    }
  };

  const deleteProject = async (slug: string) => {
    try {
      await invokeAtlas('delete_project', { slug });
      await fetchProjects();
      toast.success('Projekt został usunięty.');
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas usuwania projektu: ' + (err as Error).message);
    }
  };

  return {
    projects,
    loading,
    fetchProjects,
    createProject,
    deleteProject
  };
}
