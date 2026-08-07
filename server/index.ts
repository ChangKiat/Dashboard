import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

import cors from 'cors';
import express from 'express';
import { loadExpenseCategories } from '../../AI Agent/src/config/expenseCategories';
import { loadPaymentAccounts } from '../../AI Agent/src/config/paymentMethods';
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

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
    const hasDb = Boolean(process.env.DATABASE_URL);
    const hasUser = Boolean(process.env.TELEGRAM_USER_ID);
    res.json({
        ok: hasDb,
        database: hasDb ? 'configured' : 'missing DATABASE_URL',
        telegramUser: hasUser ? 'configured' : 'missing TELEGRAM_USER_ID',
    });
});

app.use('/api/expenses', expensesRouter);
app.use('/api/incomes', incomesRouter);
app.use('/api/payment-accounts', paymentAccountsRouter);
app.use('/api/investments', investmentsRouter);
app.use('/api/workouts', workoutsRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/sync-status', syncRouter);
app.use('/api/trips', tripsRouter);

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
