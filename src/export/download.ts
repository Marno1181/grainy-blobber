export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function triggerTextDownload(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  triggerBlobDownload(blob, filename);
}
