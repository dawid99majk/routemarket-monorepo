import { useCallback, useEffect, useState } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { SourceFile } from '@/features/creator/types/creator.types';
import { toast } from 'sonner';

type InputManifestItem = {
  id?: string;
  type?: string;
  path?: string;
  originalName?: string;
  sizeBytes?: number;
  status?: string;
};

type InputManifest = {
  items?: InputManifestItem[];
};

export function useAtlasFiles(slug: string | null) {
  const { invokeAtlas } = useAtlasApi();
  const [uploading, setUploading] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<SourceFile[]>([]);

  const reloadInputs = useCallback(async () => {
    if (!slug) {
      setLinks([]);
      setUploadedFiles([]);
      return;
    }

    try {
      const data = await invokeAtlas('get_file', { slug, path: 'input_manifest.json' }) as { content?: string };
      const manifest = parseInputManifest(data.content);
      const items = manifest.items ?? [];

      const nextLinks = Array.from(new Set(
        items
          .filter((item) => item.type === 'link' && item.path)
          .map((item) => String(item.path))
      ));

      const nextFiles = items
        .filter((item) => item.type !== 'link')
        .filter((item) => !isSystemInput(item))
        .map((item) => ({
          id: item.id,
          path: item.path,
          type: item.type,
          name: String(item.originalName || item.path || 'plik'),
          size: Number(item.sizeBytes ?? 0)
        }));

      setLinks(nextLinks);
      setUploadedFiles(dedupeFiles(nextFiles));
    } catch (err) {
      console.warn('Failed to load Atlas input manifest:', err);
      setLinks([]);
      setUploadedFiles([]);
    }
  }, [slug, invokeAtlas]);

  useEffect(() => {
    setLinks([]);
    setUploadedFiles([]);
    void reloadInputs();
  }, [reloadInputs]);

  const addLink = async (url: string) => {
    if (!slug || !url) return;
    try {
      await invokeAtlas('add_link', { slug, url });
      await reloadInputs();
      toast.success('Link został dodany.');
    } catch (err) {
      toast.error('Błąd podczas dodawania linku: ' + (err as Error).message);
    }
  };

  const uploadFiles = async (files: FileList) => {
    if (!slug) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lowerName = file.name.toLowerCase();

        if (!isSupportedSourceFile(lowerName)) {
          throw new Error(`Plik ${file.name} ma nieobsługiwany format. Wgraj tekst, PDF, Word, JSON, KML, GeoJSON albo GPX.`);
        }

        if (lowerName.endsWith('.doc')) {
          throw new Error(`Plik ${file.name} jest w starym formacie .doc. Zapisz go jako .docx, .pdf albo .txt i wgraj ponownie.`);
        }

        const isGpx = lowerName.endsWith('.gpx');
        const extracted = isGpx
          ? { fileName: file.name, content: await file.text() }
          : await extractReadableNote(file);

        const action = isGpx ? 'add_gpx' : 'add_notes';

        await invokeAtlas(action, {
          slug,
          fileName: extracted.fileName,
          content: extracted.content
        });
      }
      await reloadInputs();
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

  const removeInput = async (file: SourceFile) => {
    if (!slug) return;
    try {
      await invokeAtlas('remove_input', {
        slug,
        id: file.id,
        path: file.path,
        originalName: file.name
      });
      await reloadInputs();
      toast.success('Plik został usunięty z projektu.');
    } catch (err) {
      toast.error('Nie udało się usunąć pliku: ' + (err as Error).message);
      throw err;
    }
  };

  const removeLink = async (url: string) => {
    if (!slug) return;
    try {
      await invokeAtlas('remove_input', { slug, path: url, originalName: url });
      await reloadInputs();
      toast.success('Link został usunięty z projektu.');
    } catch (err) {
      toast.error('Nie udało się usunąć linku: ' + (err as Error).message);
      throw err;
    }
  };

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
    reloadInputs,
    removeInput,
    removeLink,
    saveNotes,
    saveNamedNote,
    saveProjectFile
  };
}

const MAX_NOTE_CHARS = 60000;

async function extractReadableNote(file: File): Promise<{ fileName: string; content: string }> {
  const lowerName = file.name.toLowerCase();
  let text = '';

  if (lowerName.endsWith('.docx')) {
    text = await extractDocxText(file);
  } else if (lowerName.endsWith('.pdf')) {
    text = await extractPdfText(file);
  } else {
    text = await file.text();
  }

  const content = normalizeExtractedText(text).slice(0, MAX_NOTE_CHARS);
  if (!content.trim()) {
    throw new Error(`Nie udało się odczytać tekstu z pliku ${file.name}.`);
  }

  return {
    fileName: toNoteFileName(file.name),
    content: `# Materiał źródłowy: ${file.name}\n\n${content}`
  };
}

async function extractDocxText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = zip.file('word/document.xml');
  if (!documentXml) throw new Error(`Plik ${file.name} nie zawiera czytelnego dokumentu Word.`);

  const xml = await documentXml.async('string');
  return decodeXmlEntities(
    xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

function toNoteFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const safeBase = withoutExt
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'source';

  return `${safeBase}.txt`;
}

function normalizeExtractedText(text: string): string {
  return decodeXmlEntities(text)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isSupportedSourceFile(lowerName: string): boolean {
  return /\.(md|markdown|txt|csv|json|geojson|kml|gpx|pdf|doc|docx)$/i.test(lowerName);
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseInputManifest(content?: string): InputManifest {
  if (!content) return { items: [] };
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed as InputManifest : { items: [] };
  } catch {
    return { items: [] };
  }
}

function isSystemInput(item: InputManifestItem): boolean {
  const name = String(item.originalName || '').toLowerCase();
  const path = String(item.path || '').toLowerCase();
  return name === 'notes.md'
    || name === 'interview_answers.md'
    || path.endsWith('/notes.md')
    || path.endsWith('/interview_answers.md');
}

function dedupeFiles(files: SourceFile[]): SourceFile[] {
  const seen = new Set<string>();
  const result: SourceFile[] = [];
  for (const file of files) {
    const key = file.id || file.path || file.name;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  return result;
}
