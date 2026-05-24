import { useState } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { SourceFile } from '@/features/creator/types/creator.types';
import { toast } from 'sonner';

export function useAtlasFiles(slug: string | null) {
  const { invokeAtlas } = useAtlasApi();
  const [uploading, setUploading] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<SourceFile[]>([]);

  const addLink = async (url: string) => {
    if (!slug || !url) return;
    try {
      await invokeAtlas('add_link', { slug, url });
      setLinks(prev => [...prev, url]);
      toast.success('Link został dodany.');
    } catch (err) {
      toast.error('Błąd podczas dodawania linku.');
    }
  };

  const uploadFiles = async (files: FileList) => {
    if (!slug) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lowerName = file.name.toLowerCase();
        const isBinary = lowerName.endsWith('.pdf') ||
                         lowerName.endsWith('.doc') ||
                         lowerName.endsWith('.docx');

        let content: string;
        if (isBinary) {
          content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } else {
          content = await file.text();
        }

        const action = lowerName.endsWith('.gpx') ? 'add_gpx' : 'add_notes';

        await invokeAtlas(action, {
          slug,
          fileName: file.name,
          content
        });

        setUploadedFiles(prev => [...prev, { name: file.name, size: file.size }]);
      }
      toast.success('Pliki zostały przesłane.');
    } catch (err) {
      toast.error('Błąd podczas przesyłania plików: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const saveNamedNote = async (fileName: string, content: string) => {
    if (!slug) return;
    try {
      await invokeAtlas('add_notes', {
        slug,
        fileName,
        content
      });
      toast.success('Notatki zostały zapisane.');
    } catch (err) {
      toast.error('Błąd podczas zapisywania notatek: ' + (err as Error).message);
      throw err;
    }
  };

  const saveNotes = async (content: string) => saveNamedNote('notes.md', content);

  const saveProjectFile = async (path: string, content: string) => {
    if (!slug) return;
    try {
      await invokeAtlas('put_file', { slug, path, content });
      toast.success('Plik projektu został zapisany.');
    } catch (err) {
      toast.error('Błąd podczas zapisywania pliku: ' + (err as Error).message);
      throw err;
    }
  };

  return {
    uploading,
    links,
    setLinks,
    uploadedFiles,
    setUploadedFiles,
    addLink,
    uploadFiles,
    saveNotes,
    saveNamedNote,
    saveProjectFile
  };
}
