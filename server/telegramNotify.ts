import { getTelegramUserId } from './telegramUser';

/**
 * Daily job reports go out through the AI Agent's bot (sendMessage works alongside the bot's own
 * polling) to the owner's private chat, whose chat id is the owner's user id, TELEGRAM_USER_ID.
 */
export function isTelegramConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_USER_ID);
}

async function sendMessage(text: string, parseMode?: 'Markdown'): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: getTelegramUserId(), text, parse_mode: parseMode }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Telegram sendMessage failed (${res.status}): ${body.slice(0, 200)}`);
    }
}

/**
 * Sends a report to the owner; never throws. A Markdown report that Telegram rejects is retried
 * as plain text. Resolves false when nothing was sent.
 */
export async function sendTelegramReport(
    message: string,
    options: { markdown?: boolean } = { markdown: true }
): Promise<boolean> {
    if (!isTelegramConfigured()) {
        console.warn(`TELEGRAM_BOT_TOKEN or TELEGRAM_USER_ID is not set; report not sent:\n${message}`);
        return false;
    }
    if (options.markdown) {
        try {
            await sendMessage(message, 'Markdown');
            return true;
        } catch (markdownError) {
            console.error('Telegram Markdown report failed, retrying as plain text:', markdownError);
        }
    }
    try {
        await sendMessage(message);
        return true;
    } catch (plainError) {
        console.error('Telegram report failed:', plainError);
        return false;
    }
}
