import { useEffect, useState } from 'react';

/** Keyed by the `auth_error` the server's Google callback redirects back with (server/routes/auth.ts). */
const AUTH_ERRORS: Record<string, string> = {
    config: 'Google sign-in is not set up on the server yet.',
    expired: 'That sign-in took too long or was opened in another tab. Try again.',
    cancelled: 'Sign-in was cancelled.',
    denied: 'That Google account is not allowed to open this dashboard.',
    failed: 'Google sign-in failed. Try again.',
};

function readAuthError(): string | null {
    const reason = new URLSearchParams(window.location.search).get('auth_error');
    return reason ? (AUTH_ERRORS[reason] ?? AUTH_ERRORS.failed) : null;
}

export default function LoginGate() {
    const [error] = useState(readAuthError);

    // Drop ?auth_error= so a reload doesn't show the message again.
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('auth_error')) return;
        url.searchParams.delete('auth_error');
        window.history.replaceState(null, '', url);
    }, []);

    return (
        <div className="app login-gate">
            <div className="login-card">
                <h1>Personal Dashboard</h1>
                <p className="subtitle">Sign in with your Google account</p>
                {error && <div className="banner warning login-error">{error}</div>}
                <a className="btn-primary login-google" href="/api/auth/google">
                    Sign in with Google
                </a>
            </div>
        </div>
    );
}
