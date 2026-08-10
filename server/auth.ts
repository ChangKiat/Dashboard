import { createHmac, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

export const SESSION_COOKIE = 'dashboard_session';
const SESSION_DAYS = 14;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
    const secret = process.env.AUTH_SESSION_SECRET;
    if (!secret || secret.length < 16) {
        throw new Error('AUTH_SESSION_SECRET must be set (16+ chars)');
    }
    return secret;
}

function totpSecret(): string {
    const secret = process.env.AUTH_TOTP_SECRET;
    if (!secret) {
        throw new Error('AUTH_TOTP_SECRET must be set');
    }
    return secret.replace(/\s+/g, '').toUpperCase();
}

function getTotp(): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
        issuer: 'Personal Dashboard',
        label: 'Dashboard',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(totpSecret()),
    });
}

export function verifyTotp(code: string): boolean {
    const cleaned = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleaned)) return false;
    const delta = getTotp().validate({ token: cleaned, window: 1 });
    return delta !== null;
}

export function isSetupEnabled(): boolean {
    return process.env.AUTH_TOTP_SETUP === '1';
}

export function getOtpauthUrl(): string {
    return getTotp().toString();
}

export async function getSetupPayload(): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
    const otpauthUrl = getOtpauthUrl();
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 2, width: 256 });
    return { otpauthUrl, qrDataUrl };
}

function sign(payload: string): string {
    return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(): string {
    const exp = String(Date.now() + SESSION_MAX_AGE_MS);
    return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
    if (!token) return false;
    const [exp, sig] = token.split('.');
    if (!exp || !sig || !/^\d+$/.test(exp)) return false;
    if (Date.now() > Number(exp)) return false;
    const expected = sign(exp);
    try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

export function sessionCookieOptions() {
    const secure = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax' as const,
        maxAge: SESSION_MAX_AGE_MS,
        path: '/',
    };
}

export function clearSessionCookieOptions() {
    const secure = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax' as const,
        maxAge: 0,
        path: '/',
    };
}

export function isAuthenticated(req: Request): boolean {
    return verifySessionToken(req.cookies?.[SESSION_COOKIE]);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (isAuthenticated(req)) {
        next();
        return;
    }
    res.status(401).json({ error: 'Unauthorized' });
}
