// Simple periodic purge for old session rows.
// Retention window controlled by env SESS_RETENTION_DAYS (default 60).
// Purges rows where (revoked OR expired) AND older than retention cutoff.

export function registerSessionRetention(app) {
  const days = Math.max(1, Number(process.env.SESS_RETENTION_DAYS || 60));
  const intervalMinutes = Math.max(5, Number(process.env.SESS_RETENTION_CHECK_MINS || 60)); // run hourly by default

  async function purge() {
    const start = Date.now();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const q = `delete from sessions
                 where (revoked_at is not null or expires_at < now())
                   and greatest(coalesce(expires_at, to_timestamp(0)), coalesce(revoked_at, to_timestamp(0))) < $1`;
      const { rowCount } = await app.db.query(q, [cutoff]);
      app.log.info({ purged: rowCount, cutoff: cutoff.toISOString() }, 'session retention purge');
    } catch (e) {
      app.log.error({ err: e }, 'session retention purge failed');
    } finally {
      app.log.debug({ ms: Date.now() - start }, 'session retention purge complete');
    }
  }

  // Kick once after server ready with slight delay so migrations/other plugins settle
  setTimeout(purge, 15_000).unref();
  // Schedule periodic
  setInterval(purge, intervalMinutes * 60 * 1000).unref();

  app.log.info({ days, intervalMinutes }, 'session retention scheduler active');
}
