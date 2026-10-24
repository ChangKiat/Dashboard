import { DEFAULT_INTERVAL_MS } from '../hooks/useSmartRefresh';
import { InfoIcon } from './icons';

const TIMEZONE = 'Asia/Kuala_Lumpur';

function dayKey(date: Date) {
    return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function formatLastEntry(iso: string): string {
    const at = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const time = at
        .toLocaleTimeString('en-MY', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true })
        .toLowerCase();

    if (dayKey(at) === dayKey(now)) return `today at ${time}`;
    if (dayKey(at) === dayKey(yesterday)) return `yesterday at ${time}`;
    const date = at.toLocaleDateString('en-MY', { timeZone: TIMEZONE, day: 'numeric', month: 'short' });
    return `${date} at ${time}`;
}

interface Props {
    lastEntryAt: string | null;
}

export default function SyncBanner({ lastEntryAt }: Props) {
    const seconds = Math.round(DEFAULT_INTERVAL_MS / 1000);

    return (
        <div className="banner banner--info" role="status">
            <InfoIcon />
            <span>
                Live with the Telegram bot · checks for new entries every {seconds} seconds
                {lastEntryAt && ` · last entry ${formatLastEntry(lastEntryAt)}`}
            </span>
        </div>
    );
}
