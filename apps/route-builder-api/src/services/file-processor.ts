import { repo } from '../db/repository.js';

export class FileProcessorService {
  async processFile(projectId: string, fileName: string, fileContent: Buffer, contentType: string) {
    // 1. Save file to artifacts (raw_data or file_path if we had storage)
    // For now, we save it as a 'source_materials' update or a new artifact type 'project_file'
    
    const fileId = `file_${Date.now()}`;
    const artifact = await repo.createArtifact(projectId, 'source_materials', {
      content: {
        id: fileId,
        name: fileName,
        type: contentType,
        size: fileContent.length,
        // In a real app, we'd upload to Supabase Storage and store path here
        processed: false
      }
    });

    let extractedText = '';

    if (contentType === 'application/pdf' || contentType.startsWith('image/')) {
      extractedText = await this.extractMultimodalContent(fileContent, contentType, fileName);
    } else if (contentType.startsWith('text/') || fileName.endsWith('.md')) {
      extractedText = fileContent.toString('utf-8');
    }

    if (extractedText) {
      // Append to project notes
      const project = await repo.getProject(projectId);
      if (project) {
        const currentNotes = project.requirements.input_notes || '';
        const newNotes = `${currentNotes}\n\n--- Treść z pliku: ${fileName} ---\n${extractedText}`;
        await repo.updateProject(projectId, {
          ...project.requirements,
          input_notes: newNotes
        });
      }
    }

    return { fileId, extractedText };
  }

  private async extractMultimodalContent(content: Buffer, contentType: string, fileName: string): Promise<string> {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return `[Błąd: Brak GEMINI_API_KEY do ekstrakcji z ${fileName}]`;
    }

    try {
      const base64Content = content.toString('base64');
      const prompt = contentType === 'application/pdf' 
        ? "Jesteś ekspertem GIS. Wyodrębnij z tego pliku PDF wszystkie nazwy miejscowości, szczytów, schronisk, szlaków oraz opis przebiegu trasy. Zwróć tylko czysty tekst notatek."
        : "Jesteś ekspertem GIS. Zrób OCR tego zdjęcia. Wyodrębnij nazwy geograficzne, drogowskazy, opisy szlaków lub mapy. Zwróć tylko wyodrębniony tekst.";

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: contentType,
                  data: base64Content
                }
              }
            ]
          }]
        })
      });

      if (!response.ok) throw new Error(`Gemini Multimodal Error: ${response.status}`);
      const data = await response.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err: any) {
      console.error('Multimodal extraction failed:', err);
      return `[Błąd ekstrakcji z ${fileName}: ${err.message}]`;
    }
  }
}

export const fileProcessorService = new FileProcessorService();
