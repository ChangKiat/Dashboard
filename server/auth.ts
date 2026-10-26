import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE = 'dashboard_session';
export const OAUTH_STATE_COOKIE = 'dashboard_oauth_state';
const SESSION_DAYS = 14;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

function sessionSecret(): string {
    const secret = process.env.AUTH_SESSION_SECRET;
    if (!secret || secret.length < 16) {
        throw new Error('AUTH_SESSION_SECRET must be set (16+ chars)');
    }
    return secret;
}

interface GoogleConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

function googleConfig(): GoogleConfig {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI must be set');
    }
    if (allowedEmails().size === 0) {
        throw new Error('AUTH_ALLOWED_EMAILS must list at least one email');
    }
    return { clientId, clientSecret, redirectUri };
}

/** AUTH_ALLOWED_EMAILS: comma-separated Google accounts that may sign in. Empty means nobody. */
function allowedEmails(): Set<string> {
    return new Set(
        (process.env.AUTH_ALLOWED_EMAILS ?? '')
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean)
    );
}

export function isAllowedEmail(email: string): boolean {
    return allowedEmails().has(email.toLowerCase());
}

export function createOAuthState(): string {
    return randomBytes(16).toString('base64url');
}

export function getGoogleAuthUrl(state: string): string {
    const { clientId, redirectUri } = googleConfig();
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email',
        state,
        prompt: 'select_account',
    });
    return `${GOOGLE_AUTH_URL}?${params}`;
}

/**
 * Trades the callback's code for an ID token and returns its verified email, lowercased.
 * The token comes straight from Google's token endpoint over TLS, so its claims are checked
 * but its signature is not (OpenID Connect Core 3.1.3.7).
 */
export async function exchangeGoogleCode(code: string): Promise<{ email: string; verified: boolean }> {
    const { clientId, clientSecret, redirectUri } = googleConfig();
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!res.ok) {
        throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
    }
    const { id_token: idToken } = (await res.json()) as { id_token?: string };
    const payload = idToken?.split('.')[1];
    if (!payload) {
        throw new Error('Google token response has no ID token');
    }
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        iss?: string;
        aud?: string;
        exp?: number;
        email?: string;
        email_verified?: boolean;
    };
    if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) throw new Error('ID token has the wrong issuer');
    if (claims.aud !== clientId) throw new Error('ID token is for another client');
    if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('ID token has expired');
    if (!claims.email) throw new Error('ID token has no email');
    return { email: claims.email.toLowerCase(), verified: claims.email_verified === true };
}

function sign(payload: string): string {
    return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

/** `<email, base64url>.<expiry ms>.<signature>` */
export function createSessionToken(email: string): string {
    const payload = `${Buffer.from(email).toString('base64url')}.${Date.now() + SESSION_MAX_AGE_MS}`;
    return `${payload}.${sign(payload)}`;
}

/** The signed-in email, or null. A session ends early once its email leaves AUTH_ALLOWED_EMAILS. */
export function getSessionEmail(token: string | undefined): string | null {
    if (!token) return null;
    const [emailPart, exp, sig] = token.split('.');
    if (!emailPart || !exp || !sig || !/^\d+$/.test(exp)) return null;
    if (Date.now() > Number(exp)) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(`${emailPart}.${exp}`));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const email = Buffer.from(emailPart, 'base64url').toString('utf8');
    return isAllowedEmail(email) ? email : null;
}

function cookieOptions(maxAge: number, path = '/') {
    const secure = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax' as const,
        maxAge,
        path,
    };
}

export function sessionCookieOptions() {
    return cookieOptions(SESSION_MAX_AGE_MS);
}

export function clearSessionCookieOptions() {
    return cookieOptions(0);
}

/** Scoped to /api/auth so it only rides along to the Google callback. */
export function oauthStateCookieOptions(maxAge = OAUTH_STATE_MAX_AGE_MS) {
    return cookieOptions(maxAge, '/api/auth');
}

export function isAuthenticated(req: Request): boolean {
    return getSessionEmail(req.cookies?.[SESSION_COOKIE]) !== null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (isAuthenticated(req)) {
        next();
        return;
    }
    res.status(401).json({ error: 'Unauthorized' });
}
