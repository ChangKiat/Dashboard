import { Router } from 'express';
import { loadPaymentAccounts } from '../../../AI Agent/src/config/paymentMethods';
import {
    createPaymentAccount,
    deactivatePaymentAccount,
    isValidPaymentAccountType,
    listActivePaymentAccounts,
    normalizePaymentAccountName,
    updatePaymentAccount,
} from '../../../AI Agent/src/services/paymentAccountService';
import { isNonEmptyString, parseIdParam } from '../validation';

const router = Router();

async function refreshPaymentAccountsCache() {
    await loadPaymentAccounts();
}

router.get('/', async (_req, res) => {
    try {
        const entries = await listActivePaymentAccounts();
        res.json({ entries });
    } catch (err) {
        console.error('GET /api/payment-accounts', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isNonEmptyString(body.name)) {
            return res.status(400).json({ error: 'Invalid account name' });
        }
        const accountType =
            body.accountType != null && isValidPaymentAccountType(body.accountType)
                ? body.accountType
                : 'account';

        const id = await createPaymentAccount(body.name, accountType);
        await refreshPaymentAccountsCache();
        res.json({ ok: true, id });
    } catch (err) {
        console.error('POST /api/payment-accounts', err);
        const message = err instanceof Error ? err.message : 'Server error';
        if (message.includes('unique') || message.includes('duplicate')) {
            return res.status(400).json({ error: 'An account with this name already exists' });
        }
        res.status(500).json({ error: message });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            name?: string;
            accountType?: 'account' | 'credit';
            active?: boolean;
        } = {};

        if (body.name != null) {
            if (!isNonEmptyString(body.name)) {
                return res.status(400).json({ error: 'Invalid account name' });
            }
            fields.name = normalizePaymentAccountName(body.name);
        }
        if (body.accountType != null) {
            if (!isValidPaymentAccountType(body.accountType)) {
                return res.status(400).json({ error: 'accountType must be "account" or "credit"' });
            }
            fields.accountType = body.accountType;
        }
        if (body.active != null) {
            if (typeof body.active !== 'boolean') {
                return res.status(400).json({ error: 'active must be a boolean' });
            }
            fields.active = body.active;
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const ok = await updatePaymentAccount(id, fields);
        if (!ok) return res.status(404).json({ error: 'Payment account not found' });
        await refreshPaymentAccountsCache();
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/payment-accounts/:id', err);
        const message = err instanceof Error ? err.message : 'Server error';
        if (message.includes('unique') || message.includes('duplicate')) {
            return res.status(400).json({ error: 'An account with this name already exists' });
        }
        res.status(500).json({ error: message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const ok = await deactivatePaymentAccount(id);
        if (!ok) return res.status(404).json({ error: 'Payment account not found' });
        await refreshPaymentAccountsCache();
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/payment-accounts/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
