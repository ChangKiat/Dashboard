export function getTelegramUserId(): number {
    const id = process.env.TELEGRAM_USER_ID;
    if (!id) {
        throw new Error('TELEGRAM_USER_ID is not set in environment');
    }
    return Number(id);
}
