import { Router, type Response } from 'express';
import {
    clearSessionCookieOptions,
    createOAuthState,
    createSessionToken,
    exchangeGoogleCode,
    getGoogleAuthUrl,
    isAllowedEmail,
    isAuthenticated,
    OAUTH_STATE_COOKIE,
    oauthStateCookieOptions,
    SESSION_COOKIE,
    sessionCookieOptions,
} from '../auth';

const router = Router();

/** Back to the login screen, which shows the matching message (LoginGate AUTH_ERRORS). */
function failSignIn(res: Response, reason: 'config' | 'expired' | 'cancelled' | 'denied' | 'failed'): void {
    res.redirect(`/?auth_error=${reason}`);
}

router.get('/me', (req, res) => {
    res.json({ authenticated: isAuthenticated(req) });
});

/** The login button's link: sends the browser to Google's account picker. */
router.get('/google', (_req, res) => {
    try {
        const state = createOAuthState();
        const url = getGoogleAuthUrl(state);
        res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
        res.redirect(url);
    } catch (err) {
        console.error('Google sign-in is not configured:', err);
        failSignIn(res, 'config');
    }
});

/** Google sends the browser back here (GOOGLE_REDIRECT_URI) with a one-time code. */
router.get('/google/callback', async (req, res) => {
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions(0));
    const { state, code, error } = req.query;
    if (!expectedState || state !== expectedState) {
        failSignIn(res, 'expired');
        return;
    }
    if (error || typeof code !== 'string') {
        failSignIn(res, error === 'access_denied' ? 'cancelled' : 'failed');
        return;
    }
    try {
        const { email, verified } = await exchangeGoogleCode(code);
        if (!verified || !isAllowedEmail(email)) {
            console.warn(`Google sign-in refused for ${email}`);
            failSignIn(res, 'denied');
            return;
        }
        res.cookie(SESSION_COOKIE, createSessionToken(email), sessionCookieOptions());
        res.redirect('/');
    } catch (err) {
        console.error('Google sign-in failed:', err);
        failSignIn(res, 'failed');
    }
});

router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
    res.json({ ok: true });
});

export default router;
