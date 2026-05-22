function buildPreviewHtml(blobUrl: string, fileName: string) {
  return `<!DOCTYPE html>
  <html lang="pl">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${fileName}</title>
      <style>
        :root {
          color-scheme: light;
          font-family: system-ui, sans-serif;
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; height: 100%; background: #0f172a; }
        .shell { height: 100%; display: grid; grid-template-rows: auto 1fr; }
        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 16px;
          background: #ffffff;
          border-bottom: 1px solid #dbe4f0;
        }
        .title {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
          border-radius: 999px;
          background: #1d4ed8;
          color: #ffffff;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
        }
        .viewer {
          width: 100%;
          height: 100%;
          border: 0;
          background: #cbd5e1;
        }
        .fallback {
          padding: 24px;
          color: #0f172a;
          background: #ffffff;
        }
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="toolbar">
          <div class="title">${fileName}</div>
          <div class="actions">
            <a class="button" href="${blobUrl}" download="${fileName}">Pobierz PDF</a>
          </div>
        </div>
        <object class="viewer" data="${blobUrl}#toolbar=1&navpanes=0" type="application/pdf">
          <iframe class="viewer" src="${blobUrl}#toolbar=1&navpanes=0" title="Podgląd PDF"></iframe>
          <div class="fallback">
            Ten PDF nie może zostać wyświetlony w tej przeglądarce. <a href="${blobUrl}" download="${fileName}">Pobierz plik</a>.
          </div>
        </object>
      </div>
    </body>
  </html>`;
}

export async function openSignedPdf(signedUrl: string, fileName = 'podglad.pdf') {
  const previewWindow = window.open('', '_blank');

  if (!previewWindow) {
    throw new Error('Przeglądarka zablokowała okno podglądu PDF');
  }

  previewWindow.document.write('<!DOCTYPE html><title>Ładowanie PDF…</title><body style="font-family:system-ui,sans-serif;padding:24px">Ładowanie PDF…</body>');
  previewWindow.document.close();

  try {
    const response = await fetch(signedUrl);

    if (!response.ok) {
      throw new Error('Nie udało się pobrać PDF');
    }

    const pdfBuffer = await response.arrayBuffer();
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(pdfBlob);

    previewWindow.document.open();
    previewWindow.document.write(buildPreviewHtml(blobUrl, fileName));
    previewWindow.document.close();

    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    previewWindow.close();
    throw error;
  }
}