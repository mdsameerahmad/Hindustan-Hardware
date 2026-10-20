import multer from 'multer';
import { BadRequestError } from '../errors';

// Max file size: 5 Megabytes
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validates actual binary magic bytes of the image file.
 */
export function validateImageMagicBytes(buffer: Buffer): { isValid: boolean; extension: string; mimeType: string } {
  if (buffer.length < 12) {
    return { isValid: false, extension: '', mimeType: '' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, extension: 'jpg', mimeType: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
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

  // WebP: RIFF ... WEBP (0..3: 'RIFF', 8..11: 'WEBP')
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { isValid: true, extension: 'webp', mimeType: 'image/webp' };
  }

  return { isValid: false, extension: '', mimeType: '' };
}

// Memory storage for processing & validation before upload to Supabase Storage
const storage = multer.memoryStorage();

export const uploadImageMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new BadRequestError(`Unsupported image format. Allowed formats: JPEG, PNG, WebP`));
    }
    cb(null, true);
  },
}).single('image');
