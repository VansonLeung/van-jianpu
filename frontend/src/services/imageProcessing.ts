import type { BoundingBox, ImageSource } from '../types/scanner';

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be opened. Use PNG, JPEG, or WebP.'));
    image.src = dataUrl;
  });
}

export async function readImageFile(file: File): Promise<ImageSource> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use a PNG, JPEG, or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read this file.'));
    reader.readAsDataURL(file);
  });
  const image = await loadImage(dataUrl);
  if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Choose an image with fewer than 40 megapixels.');
  // Keep JPEG bytes losslessly. The same browser decoder applies EXIF orientation here,
  // on reopening, and when cropImage draws the image; converting photos to PNG bloats projects.
  if (file.type === 'image/jpeg') return { name: file.name, width: image.naturalWidth, height: image.naturalHeight, dataUrl };
  // Normalize EXIF orientation by drawing the decoded image. Crop coordinates use these pixels.
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return { name: file.name, width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL('image/png') };
}

export function clampBoundingBox(box: BoundingBox, width: number, height: number): BoundingBox {
  const x = Math.max(0, Math.min(width - 1, Math.round(box.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(box.y)));
  return { x, y, width: Math.max(1, Math.min(width - x, Math.round(box.width))), height: Math.max(1, Math.min(height - y, Math.round(box.height))) };
}

export function cropImage(image: HTMLImageElement, box: BoundingBox): string {
  const crop = clampBoundingBox(box, image.naturalWidth, image.naturalHeight);
  if (crop.width * crop.height > 24_000_000) throw new Error('This rectangle is too large. Select a single note line.');
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  canvas.getContext('2d')!.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas.toDataURL('image/png');
}
