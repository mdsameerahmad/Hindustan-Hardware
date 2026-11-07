import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { compressImageToWebp } from '../src/services/imageProcessor';

describe('compressImageToWebp', () => {
  it('converts uploads to WebP and keeps the result below 70 KB', async () => {
    const pixels = Buffer.alloc(1200 * 900 * 3);
    let seed = 123456789;
    for (let index = 0; index < pixels.length; index += 1) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      pixels[index] = seed >>> 24;
    }

    const input = await sharp(pixels, { raw: { width: 1200, height: 900, channels: 3 } }).png().toBuffer();

    const output = await compressImageToWebp(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe('webp');
    expect(output.length).toBeLessThanOrEqual(70 * 1024);
  });

  it('rejects invalid image content', async () => {
    await expect(compressImageToWebp(Buffer.from('not an image'))).rejects.toThrow(
      'Uploaded file could not be decoded as an image.',
    );
  });
});
