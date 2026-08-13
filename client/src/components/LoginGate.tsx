import { useState, type SubmitEvent } from 'react';
import { verifyAuth } from '../api';

interface LoginGateProps {
    onAuthenticated: () => void;
}

export default function LoginGate({ onAuthenticated }: LoginGateProps) {
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await verifyAuth(code.trim());
            onAuthenticated();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid code');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="app login-gate">
            <form className="login-card" onSubmit={onSubmit}>
                <h1>Personal Dashboard</h1>
                <p className="subtitle">Enter the 6-digit code from your authenticator app</p>
                <label className="login-label" htmlFor="totp-code">
                    Authenticator code
                </label>
                <input
                    id="totp-code"
                    className="login-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={submitting}
                    autoFocus
                />
                {error && <div className="banner warning login-error">{error}</div>}
                <button type="submit" className="btn-primary" disabled={submitting || code.length !== 6}>
                    {submitting ? 'Checking…' : 'Unlock'}
                </button>
            </form>
        </div>
    );
}
