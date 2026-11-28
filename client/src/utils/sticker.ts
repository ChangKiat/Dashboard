/** Turns a photo into a sticker: the item cut out of its background, with a white outline. */

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

const MAX_PHOTO_SIDE = 1600;
const MAX_STICKER_SIDE = 800;
/** Alpha above which a pixel counts as part of the item. */
const VISIBLE_ALPHA = 20;

function canvasOf(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function context(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw images.');
    return ctx;
}

function scaled(source: CanvasImageSource, width: number, height: number, maxSide: number) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = canvasOf(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    context(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the picture.'))), type, 0.9));
}

export async function readPhoto(file: Blob, maxSide = MAX_PHOTO_SIDE) {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error('This browser cannot read that image. Try a JPG or PNG.');
    }
    const canvas = scaled(bitmap, bitmap.width, bitmap.height, maxSide);
    bitmap.close();
    return canvas;
}

export function cropPhoto(photo: HTMLCanvasElement, box: Box | null) {
    if (!box) return photo;
    const canvas = canvasOf(box.w, box.h);
    context(canvas).drawImage(photo, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return canvas;
}

/** Crops away the see-through border; null when nothing was kept. */
function trim(canvas: HTMLCanvasElement) {
    const { width, height } = canvas;
    const { data } = context(canvas).getImageData(0, 0, width, height);
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] <= VISIBLE_ALPHA) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }
    if (right < 0) return null;
    return cropPhoto(canvas, { x: left, y: top, w: right - left + 1, h: bottom - top + 1 });
}

/**
 * Removes the background in the browser, so the photo is not uploaded for processing.
 * The library and its model are loaded only when first used.
 */
export async function removePhotoBackground(photo: HTMLCanvasElement, onProgress: (message: string) => void) {
    onProgress('Loading the cut-out tool…');
    const { removeBackground } = await import('@imgly/background-removal');
    const output = await removeBackground(await toBlob(photo, 'image/png'), {
        progress: (key, current, total) => onProgress(key.startsWith('fetch')
            ? `Downloading cut-out files (first time only)… ${Math.round((current / total) * 100)}%`
            : 'Removing the background…'),
    });
    const cutout = trim(await readPhoto(output));
    if (!cutout) throw new Error('No item found. Try drawing a tighter box around it.');
    return cutout;
}

/** Draws the item over a white copy of its own shape, grown by the outline width. */
export function drawSticker(cutout: HTMLCanvasElement, outline: number) {
    const item = scaled(cutout, cutout.width, cutout.height, MAX_STICKER_SIDE - 100);
    const size = Math.round((outline * Math.max(item.width, item.height)) / 700);
    const pad = size + 4;

    const shape = canvasOf(item.width, item.height);
    const shapeContext = context(shape);
    shapeContext.drawImage(item, 0, 0);
    const pixels = shapeContext.getImageData(0, 0, shape.width, shape.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data.fill(255, i, i + 3);
        pixels.data[i + 3] = pixels.data[i + 3] > 128 ? 255 : 0;
    }
    shapeContext.putImageData(pixels, 0, 0);

    const sticker = canvasOf(item.width + pad * 2, item.height + pad * 2);
    const ctx = context(sticker);
    if (size > 0) {
        for (let step = 0; step < 48; step++) {
            const angle = (step / 48) * Math.PI * 2;
            ctx.drawImage(shape, pad + Math.cos(angle) * size, pad + Math.sin(angle) * size);
        }
        ctx.drawImage(shape, pad, pad);
    }
    ctx.drawImage(item, pad, pad);
    return sticker;
}

/** WebP keeps transparency in a small file; browsers that cannot write it return PNG instead. */
export function stickerBlob(canvas: HTMLCanvasElement) {
    return toBlob(scaled(canvas, canvas.width, canvas.height, MAX_STICKER_SIDE), 'image/webp');
}
