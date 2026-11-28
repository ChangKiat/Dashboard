import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import { cropPhoto, drawSticker, readPhoto, removePhotoBackground, stickerBlob } from '../utils/sticker';
import type { Box } from '../utils/sticker';

/** `pending` means a photo was chosen but no sticker has been made from it yet. */
export type PictureState = { pending: boolean; image: Blob | null };

interface Props {
    currentImageUrl: string | null;
    disabled: boolean;
    onChange: (picture: PictureState) => void;
}

const MIN_BOX = 20;

export default function AssetPhotoPicker({ currentImageUrl, disabled, onChange }: Props) {
    const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
    const [box, setBox] = useState<Box | null>(null);
    /** The cut-out, or the photo itself when used as is. */
    const [item, setItem] = useState<HTMLCanvasElement | null>(null);
    const [isCutout, setIsCutout] = useState(false);
    const [outline, setOutline] = useState(14);
    const [preview, setPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const canvas = useRef<HTMLCanvasElement>(null);
    const dragStart = useRef<{ x: number; y: number } | null>(null);
    /** Bumped when the photo changes or the form closes, so a slow cut-out is ignored. */
    const run = useRef(0);
    const notify = useRef(onChange);
    notify.current = onChange;

    useEffect(() => () => { run.current++; }, []);

    useEffect(() => {
        const target = canvas.current;
        const ctx = target?.getContext('2d');
        if (!target || !ctx || !photo) return;
        target.width = photo.width;
        target.height = photo.height;
        ctx.drawImage(photo, 0, 0);
        if (!box) return;
        ctx.lineWidth = Math.max(2, photo.width / 200);
        ctx.strokeStyle = '#00d6a4';
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        // `item` is listed because going back to the photo mounts a new, blank canvas.
    }, [photo, box, item]);

    useEffect(() => {
        if (!item) return;
        let current = true;
        const sticker = isCutout ? drawSticker(item, outline) : item;
        setPreview(sticker.toDataURL('image/png'));
        notify.current({ pending: true, image: null });
        stickerBlob(sticker)
            .then((image) => { if (current) notify.current({ pending: false, image }); })
            .catch((err) => { if (current) setError(err instanceof Error ? err.message : 'Could not create the picture.'); });
        return () => { current = false; };
    }, [item, isCutout, outline]);

    function reset() {
        setBox(null);
        setItem(null);
        setPreview(null);
        setError('');
        setStatus('');
    }

    async function load(file: File) {
        const token = ++run.current;
        reset();
        try {
            const loaded = await readPhoto(file);
            if (token !== run.current) return;
            setPhoto(loaded);
            notify.current({ pending: true, image: null });
        } catch (err) {
            if (token === run.current) setError(err instanceof Error ? err.message : 'Could not read the photo.');
        }
    }

    function choose(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void load(file);
    }

    function removeChoice() {
        run.current++;
        reset();
        setPhoto(null);
        notify.current({ pending: false, image: null });
    }

    async function cutOut() {
        if (!photo || busy) return;
        const token = ++run.current;
        setBusy(true);
        setError('');
        try {
            const result = await removePhotoBackground(cropPhoto(photo, box), (message) => {
                if (token === run.current) setStatus(message);
            });
            if (token !== run.current) return;
            setIsCutout(true);
            setItem(result);
        } catch (err) {
            console.error('Background removal failed', err);
            if (token === run.current) setError(err instanceof Error ? err.message : 'Could not cut out the item.');
        } finally {
            setBusy(false);
            setStatus('');
        }
    }

    function useAsIs() {
        if (!photo) return;
        setError('');
        setIsCutout(false);
        setItem(cropPhoto(photo, box));
    }

    /** Back from the new picture to the photo, keeping the box. */
    function redo() {
        setItem(null);
        setPreview(null);
        setError('');
        notify.current({ pending: true, image: null });
    }

    function point(event: PointerEvent<HTMLCanvasElement>) {
        const target = event.currentTarget;
        const bounds = target.getBoundingClientRect();
        const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.round(value)));
        return {
            x: clamp(((event.clientX - bounds.left) * target.width) / bounds.width, target.width),
            y: clamp(((event.clientY - bounds.top) * target.height) / bounds.height, target.height),
        };
    }

    function startBox(event: PointerEvent<HTMLCanvasElement>) {
        if (busy || disabled) return;
        dragStart.current = point(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        setBox(null);
    }

    function moveBox(event: PointerEvent<HTMLCanvasElement>) {
        const start = dragStart.current;
        if (!start) return;
        const end = point(event);
        setBox({
            x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
            w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y),
        });
    }

    function endBox() {
        dragStart.current = null;
        setBox((current) => (current && current.w >= MIN_BOX && current.h >= MIN_BOX ? current : null));
    }

    // The new picture takes the photo's place once it is made.
    const editingPhoto = photo && !item;
    const shown = preview ?? (photo ? null : currentImageUrl);
    const locked = busy || disabled;

    return <div className="asset-picker">
        <div className="asset-picker-row">
            <label className="asset-file">
                <input type="file" accept="image/*" aria-label="Choose a photo" disabled={locked} onChange={choose} />
                <span className="btn-secondary">{photo || currentImageUrl ? 'Change photo' : 'Choose photo'}</span>
            </label>
            {photo && <button type="button" className="btn-link" disabled={locked} onClick={removeChoice}>Discard new photo</button>}
        </div>
        {(editingPhoto || shown) && <div className="asset-picker-views">
            {editingPhoto && <figure>
                <canvas ref={canvas} className="asset-picker-photo" aria-label="Chosen photo. Drag to mark the item."
                    onPointerDown={startBox} onPointerMove={moveBox} onPointerUp={endBox} onPointerCancel={endBox} />
                <figcaption>{box ? 'Only the boxed area will be used.' : 'Optional: drag a box around the item.'}</figcaption>
            </figure>}
            {shown && <figure>
                <div className="asset-sticker-frame"><img src={shown} alt="Sticker preview" /></div>
                <figcaption>{preview ? 'New picture' : 'Current picture'}</figcaption>
            </figure>}
        </div>}
        {editingPhoto && <div className="asset-picker-row">
            <button type="button" className="btn-primary" disabled={locked} onClick={() => void cutOut()}>
                {busy ? 'Working…' : 'Cut out item'}
            </button>
            <button type="button" className="btn-secondary" disabled={locked} onClick={useAsIs}>Use photo as is</button>
        </div>}
        {item && <div className="asset-picker-row">
            <button type="button" className="btn-secondary" disabled={locked} onClick={redo}>Back to photo</button>
            {isCutout && <label className="asset-outline">Outline
                <input type="range" min="0" max="40" value={outline} disabled={locked}
                    onChange={(event) => setOutline(Number(event.target.value))} />
            </label>}
        </div>}
        {status && <p className="muted" role="status">{status}</p>}
        {error && <p className="error" role="alert">{error}</p>}
    </div>;
}
