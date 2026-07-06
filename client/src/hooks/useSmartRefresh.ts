import { useEffect, useRef, type RefObject } from 'react';
import type { SyncScope } from '../api';
import { fetchSyncStatus } from '../api';

const DEFAULT_INTERVAL_MS = Number(import.meta.env.VITE_SYNC_POLL_MS) || 30_000;

interface Options {
    month: string;
    scope: SyncScope;
    fingerprintRef: RefObject<string | null>;
    onStale: () => Promise<void>;
    intervalMs?: number;
}

export function useSmartRefresh({
    month,
    scope,
    fingerprintRef,
    onStale,
    intervalMs = DEFAULT_INTERVAL_MS,
}: Options) {
    const checkingRef = useRef(false);
    const onStaleRef = useRef(onStale);
    onStaleRef.current = onStale;

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | null = null;

        async function check() {
            if (document.visibilityState !== 'visible') return;
            if (fingerprintRef.current === null) return;
            if (checkingRef.current) return;

            checkingRef.current = true;
            try {
                const { fingerprint } = await fetchSyncStatus(month, scope);
                if (fingerprintRef.current !== null && fingerprint !== fingerprintRef.current) {
                    await onStaleRef.current();
                }
            } catch {
                // Ignore transient sync check failures; next poll will retry.
            } finally {
                checkingRef.current = false;
            }
        }

        function startTimer() {
            if (timer) return;
            timer = setInterval(check, intervalMs);
        }

        function stopTimer() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }

        function onVisibilityChange() {
            if (document.visibilityState === 'visible') {
                void check();
                startTimer();
            } else {
                stopTimer();
            }
        }

        if (document.visibilityState === 'visible') {
            startTimer();
        }

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            stopTimer();
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [month, scope, intervalMs, fingerprintRef]);
}
