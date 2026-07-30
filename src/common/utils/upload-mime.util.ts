const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/heic': 'image/jpeg',
  'image/heif': 'image/jpeg',
};

export function normalizeUploadMimeType(
  mimetype: string,
  originalname: string,
): string {
  const trimmed = mimetype.trim().toLowerCase();
  if (trimmed && trimmed !== 'application/octet-stream') {
    return MIME_ALIASES[trimmed] ?? trimmed;
  }

  const extension = originalname.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/jpeg';
    case 'pdf':
      return 'application/pdf';
    default:
      return trimmed || 'application/octet-stream';
  }
}
