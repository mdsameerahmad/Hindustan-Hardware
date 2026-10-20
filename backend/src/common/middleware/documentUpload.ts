import multer from 'multer';
import { BadRequestError } from '../errors';

// Max file size: 15 Megabytes
const MAX_DOCUMENT_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Validates document/PDF magic bytes.
 */
export function validateInvoiceMagicBytes(buffer: Buffer): { isValid: boolean; extension: string; mimeType: string } {
  if (buffer.length < 4) {
    return { isValid: false, extension: '', mimeType: '' };
  }

  // PDF: %PDF (hex 25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { isValid: true, extension: 'pdf', mimeType: 'application/pdf' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, extension: 'jpg', mimeType: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, extension: 'png', mimeType: 'image/png' };
  }

  // WebP: RIFF ... WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { isValid: true, extension: 'webp', mimeType: 'image/webp' };
  }

  return { isValid: false, extension: '', mimeType: '' };
}

const storage = multer.memoryStorage();

export const uploadInvoiceMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_DOCUMENT_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const isAllowedMime =
      ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype) ||
      file.originalname.toLowerCase().endsWith('.pdf') ||
      file.originalname.toLowerCase().endsWith('.png') ||
      file.originalname.toLowerCase().endsWith('.jpg') ||
      file.originalname.toLowerCase().endsWith('.jpeg');

    if (!isAllowedMime) {
      return cb(new BadRequestError('Unsupported document format. Allowed formats: PDF, JPEG, PNG, WebP'));
    }
    cb(null, true);
  },
}).single('invoice');
