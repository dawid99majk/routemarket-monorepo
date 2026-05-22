import { useState } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { SourceFile } from '@/types/atlas-types';
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
        const content = await file.text();
        const action = file.name.endsWith('.gpx') ? 'add_gpx' : 'add_note';
        
        await invokeAtlas(action, { 
          slug, 
          fileName: file.name, 
          content 
        });
        
        setUploadedFiles(prev => [...prev, { name: file.name, size: file.size }]);
      }
      toast.success('Pliki zostały przesłane.');
    } catch (err) {
      toast.error('Błąd podczas przesyłania plików.');
    } finally {
      setUploading(false);
    }
  };

  const saveNotes = async (content: string) => {
    if (!slug) return;
    try {
      await invokeAtlas('write_file', { 
        slug, 
        path: 'notes.md', 
        content 
      });
      toast.success('Notatki zostały zapisane.');
    } catch (err) {
      toast.error('Błąd podczas zapisywania notatek.');
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
    saveNotes
  };
}
