import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { loadExpenseCategories } from '../agent/config/expenseCategories';
import { loadPaymentAccounts } from '../agent/config/paymentMethods';
import {
    clearSessionCookieOptions,
    createSessionToken,
    getSetupPayload,
    isAuthenticated,
    isSetupEnabled,
    requireAuth,
    SESSION_COOKIE,
    sessionCookieOptions,
    verifyTotp,
} from './auth';
import expensesRouter from './routes/expenses';
import incomesRouter from './routes/incomes';
import paymentAccountsRouter from './routes/paymentAccounts';
import workoutsRouter from './routes/workouts';
import nutritionRouter from './routes/nutrition';
import syncRouter from './routes/sync';
import tripsRouter from './routes/trips';
import investmentsRouter from './routes/investments';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(
    cors({
        origin: true,
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
    const hasDb = Boolean(process.env.DATABASE_URL);
    const hasUser = Boolean(process.env.TELEGRAM_USER_ID);
    res.json({
        ok: hasDb,
        database: hasDb ? 'configured' : 'missing DATABASE_URL',
        telegramUser: hasUser ? 'configured' : 'missing TELEGRAM_USER_ID',
    });
});

app.get('/api/auth/me', (req, res) => {
    res.json({ authenticated: isAuthenticated(req) });
});

app.post('/api/auth/verify', (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    try {
        if (!verifyTotp(code)) {
            res.status(401).json({ error: 'Invalid code' });
            return;
        }
        res.cookie(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
        res.json({ ok: true });
    } catch (err) {
        console.error('Auth verify failed:', err);
        res.status(500).json({ error: 'Auth not configured' });
    }
});

app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
    res.json({ ok: true });
});

app.get('/api/auth/setup', async (_req, res) => {
    if (!isSetupEnabled()) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    try {
        const payload = await getSetupPayload();
        res.json(payload);
    } catch (err) {
        console.error('Auth setup failed:', err);
        res.status(500).json({ error: 'Auth not configured' });
    }
});

app.use('/api/expenses', requireAuth, expensesRouter);
app.use('/api/incomes', requireAuth, incomesRouter);
app.use('/api/payment-accounts', requireAuth, paymentAccountsRouter);
app.use('/api/investments', requireAuth, investmentsRouter);
app.use('/api/workouts', requireAuth, workoutsRouter);
app.use('/api/nutrition', requireAuth, nutritionRouter);
app.use('/api/sync-status', requireAuth, syncRouter);
app.use('/api/trips', requireAuth, tripsRouter);

const clientDist = resolve(__dirname, '../dist-client');
if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
        res.sendFile(join(clientDist, 'index.html'));
    });
}

Promise.all([loadExpenseCategories(), loadPaymentAccounts()])
    .then(() => {
        const server = app.listen(PORT, () => {
            console.log(`Dashboard API running at http://localhost:${PORT}`);
        });

        server.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                console.error(
                    `Port ${PORT} is already in use by another process. Stop the old Dashboard API (e.g. prior npm run dev) and restart.`
                );
                process.exit(1);
            }
            throw err;
        });
    })
    .catch((err) => {
        console.error('Failed to load startup config:', err);
        process.exit(1);
    });
