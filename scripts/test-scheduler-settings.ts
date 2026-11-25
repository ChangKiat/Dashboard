// Synthetic data only, in a disposable schema on the local development database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

async function main() {
    // e.g. postgresql://postgres:<password>@localhost:5433/tracking_dev (no query string)
    const url = process.env.DEV_DATABASE_URL;
    if (!url) throw new Error('Set DEV_DATABASE_URL to the local development database URL.');
    const host = new URL(url).hostname;
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
        throw new Error(`Refusing to run against ${host}: this test creates and drops schemas, so it only runs on a local database.`);
    }
    const admin = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
    const schema = `scheduler_test_${process.pid}_${Date.now()}`;
    let close: (() => Promise<void>) | undefined;
    try {
        await admin.unsafe(`CREATE SCHEMA ${schema}`);
        process.env.DATABASE_URL = `${url}?options=${encodeURIComponent('-c search_path=' + schema)}`;
        const { closeDb } = await import('../agent/db/client');
        close = closeDb;
        const { DEFAULT_JOBS, loadJobSettings, parseJobSettings, saveJobSettings } = await import('../server/schedulerSettings');
        assert.equal((await loadJobSettings()).ready, false);
        await admin.unsafe(`SET search_path TO ${schema}`);
        const migration = await readFile('scripts/migrate-scheduler-settings.sql', 'utf8');
        await admin.unsafe(migration);
        await admin.unsafe(migration);
        assert.deepEqual((await loadJobSettings()).jobs, DEFAULT_JOBS);
        const settings = DEFAULT_JOBS.map(j => ({ ...j, time: '00:00', enabled: false }));
        settings[1].time = '23:59';
        await saveJobSettings(parseJobSettings(settings));
        assert.deepEqual((await loadJobSettings()).jobs, settings);
        for (const time of ['24:00', '12:60', '9:00', '', '12:00:00']) {
            assert.throws(() => parseJobSettings(settings.map((j, i) => i === 0 ? { ...j, time } : j)));
        }
        assert.throws(() => parseJobSettings([settings[0], settings[0], settings[2]]));
        assert.throws(() => parseJobSettings([]));
        assert.throws(() => parseJobSettings(settings.map(j => ({ ...j, enabled: 'false' }))));
        await assert.rejects(saveJobSettings([{ name: 'fixed-bills', time: '12:00', enabled: true }, { name: 'invalid', time: '10:00', enabled: true }]));
        assert.deepEqual((await loadJobSettings()).jobs, settings, 'failed saves roll back all jobs');
        console.log('PASS: migration, defaults, persistence, midnight boundaries, validation and atomic rollback');
    } finally {
        await close?.();
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
