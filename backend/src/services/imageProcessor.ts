import sharp, { Metadata } from 'sharp';
import { BadRequestError, InternalServerError } from '../common/errors';
import { logger } from '../common/utils/logger';

const MAX_COMPRESSED_SIZE = 70 * 1024;
const MAX_DIMENSION = 1600;
const MIN_DIMENSION = 64;

export async function compressImageToWebp(input: Buffer): Promise<Buffer> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { failOn: 'error' }).metadata();
  } catch (error) {
    logger.warn('Unable to decode uploaded image', {
      error: error instanceof Error ? error.message : 'Unknown image processing error',
    });
    throw new BadRequestError('Uploaded file could not be decoded as an image.');
  }

  if (!metadata.width || !metadata.height) {
    throw new BadRequestError('Uploaded image has invalid dimensions.');
  }

  let dimension = Math.min(MAX_DIMENSION, Math.max(metadata.width, metadata.height));
  let quality = 75;
  while (true) {
    let output: Buffer;
    try {
      output = await sharp(input, { failOn: 'error' })
        .rotate()
        .resize({
          width: dimension,
          height: dimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality, effort: 3 })
        .toBuffer();
    } catch (error) {
      logger.warn('Unable to compress uploaded image', {
        error: error instanceof Error ? error.message : 'Unknown image processing error',
      });
      throw new BadRequestError('Uploaded image could not be compressed.');
    }

    if (output.length <= MAX_COMPRESSED_SIZE) return output;

    if (dimension > MIN_DIMENSION) {
      dimension = Math.max(MIN_DIMENSION, Math.floor(dimension * 0.75));
    } else if (quality > 15) {
      quality -= 10;
    } else {
      throw new InternalServerError('Unable to compress uploaded image below 70 KB.');
    }
  }
}
