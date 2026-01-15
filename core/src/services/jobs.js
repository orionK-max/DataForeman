import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

function summarizeKeysForLog(value, { maxKeys = 30 } = {}) {
	if (!value || typeof value !== 'object') return { keyCount: 0, keys: [] };
	const keys = Object.keys(value);
	return { keyCount: keys.length, keys: keys.slice(0, maxKeys) };
}

function summarizeJobResultForLog(result) {
	if (!result || typeof result !== 'object') return { type: typeof result };
	const outputs = (result.outputs && typeof result.outputs === 'object') ? result.outputs : null;
	return {
		success: result.success === true,
		executionId: typeof result.executionId === 'string' ? result.executionId : undefined,
		outputNodeCount: outputs ? Object.keys(outputs).length : 0,
		outputs: outputs ? summarizeKeysForLog(outputs) : undefined,
		hasError: result.error != null,
	};
}

// Utility to shallow merge progress and auto compute pct clamp
function mergeProgress(oldP, next) {
	const base = typeof oldP === 'object' && oldP ? oldP : {};
	const merged = { ...base, ...next };
	if (merged.pct != null) {
		const v = Number(merged.pct);
		if (Number.isFinite(v)) merged.pct = Math.max(0, Math.min(100, v));
		else delete merged.pct;
	}
	return merged;
}

export const jobsPlugin = fp(async (app) => {
	const log = app.log.child({ mod: 'jobs' });
	const registry = new Map(); // type -> meta
	const handlers = new Map();
	function register(type, handler, opts = {}) {
		const meta = {
			handler,
			maxAttempts: Math.min(50, Math.max(1, Number(opts.maxAttempts || opts.max_attempts || 1))),
			description: opts.description || ''
		};
	registry.set(type, meta);
	handlers.set(type, handler);
	}
	function _meta(type) { return registry.get(type) || null; }

	async function enqueue(type, params = {}, opts = {}) {
		const id = randomUUID();
		const meta = _meta(type);
		if (!meta) throw new Error(`Unknown job type: ${type}`);
		const maxAttempts = meta.maxAttempts;
		const runAt = opts.runAt || opts.run_at || null; // allow scheduled jobs
		const { rows } = await app.db.query(
			`insert into jobs(id,type,status,params,progress,max_attempts,attempt,run_at) values ($1,$2,'queued',$3,$4,$5,0,$6) returning *`,
			[id, type, params || {}, { pct: 0 }, maxAttempts, runAt]
		).catch(async (e) => {
			// Fallback for legacy schema (without new columns) – insert minimal
			if (/column .* does not exist/i.test(e.message)) {
				const legacy = await app.db.query(`insert into jobs(id,type,status,params,progress) values ($1,$2,'queued',$3,$4) returning *`, [id, type, params || {}, { pct: 0 }]);
				return legacy;
			}
			throw e;
		});
		const job = rows[0];
		log.info({ job: job.id, type: job.type, params: summarizeKeysForLog(job.params) }, 'job enqueued');
		return job;
	}

	async function list(opts = {}) {
		const limit = Math.min(500, Math.max(1, Number(opts.limit || 100)));
		const decisions = [];
		const { rows } = await app.db.query(
			`select * from jobs order by created_at desc limit $1`,
			[limit]
		);
		return rows;
	}

	async function get(id) {
		const { rows } = await app.db.query('select * from jobs where id=$1', [id]);
		return rows[0] || null;
	}

	async function requestCancel(id) {
		const { rowCount, rows } = await app.db.query(
			`update jobs set cancellation_requested=true, updated_at=now() where id=$1 and status in ('queued','running') returning *`,
			[id]
		);
		if (rowCount) log.info({ job: rows[0].id }, 'job cancellation requested');
		return rowCount ? rows[0] : null;
	}

	async function _claimNext(workerId) {
		const client = await app.db.connect();
		try {
			await client.query('begin');
			// Select eligible queued job: run_at is null or in the past
			const { rows } = await client.query(
				`select * from jobs 
				 where status='queued'
				   and coalesce(cancellation_requested,false) = false
				   and (run_at is null or run_at <= now())
				 order by created_at asc 
				 for update skip locked limit 1`
			);
			if (!rows.length) { await client.query('commit'); return null; }
			const job = rows[0];
			const upd = await client.query(
				`update jobs set status='running', started_at=coalesce(started_at, now()), updated_at=now(), last_heartbeat_at=now(), attempt=attempt+1 where id=$1 returning *`,
				[job.id]
			);
			await client.query('commit');
			return upd.rows[0];
		} catch (e) {
			try { await client.query('rollback'); } catch {}
			throw e;
		} finally {
			client.release();
		}
	}

	async function updateProgress(id, patch) {
		const job = await get(id);
		if (!job) return null;
		if (job.status !== 'running') return job; // Don't mutate non-running (e.g., cancelled mid-loop)
		const progress = mergeProgress(job.progress, patch);
		const { rows } = await app.db.query(
			`update jobs set progress=$2, updated_at=now() where id=$1 returning *`,
			[id, progress]
		);
		log.debug({ job: id, progress: rows[0].progress }, 'job progress updated');
		return rows[0];
	}

	async function complete(id, result = {}) {
		// Re-check status before overwriting (forced cancellation may have happened)
		const cur = await get(id);
		if (!cur) return null;
		if (cur.status !== 'running') return cur; // do not overwrite cancelled/failed statuses
		// Write both completed_at and finished_at for compatibility (older schema had finished_at)
		const { rows } = await app.db.query(
			`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 returning *`
			,[id, result || {}]
		).catch(async (e) => {
			// Fallback: if completed_at missing try updating only finished_at
			if (/column .*completed_at.* does not exist/i.test(e.message)) {
				const legacy = await app.db.query(`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), finished_at=now(), updated_at=now() where id=$1 returning *`, [id, result || {}]);
				return legacy;
			}
			throw e;
		});
		log.info({ job: id, result: summarizeJobResultForLog(result) }, 'job completed');
		return rows[0];
	}

	async function fail(id, err) {
		const msg = (err && err.message) ? err.message.slice(0, 800) : String(err).slice(0, 800);
		// Read current to decide retry
		const job = await get(id);
		if (!job) return null;
		if (job.status !== 'running' && job.status !== 'queued') return job; // if forced cancelled or already final, no change
		const attempts = Number(job.attempt || 0);
		const maxAttempts = Number(job.max_attempts || 1);
		if (attempts < maxAttempts) {
			// schedule retry with exponential backoff: base 2s * attempts (capped)
			const delayMs = Math.min(60_000, 2000 * Math.max(1, attempts));
			const { rows } = await app.db.query(
				`update jobs set status='queued', error=$2, updated_at=now(), run_at=now()+ ($3 || ' milliseconds')::interval where id=$1 returning *`,
				[id, msg, delayMs]
			);
			log.warn({ job: id, error: msg, attempts: attempts, maxAttempts }, 'job scheduled for retry');
			return rows[0];
		}
		const { rows } = await app.db.query(
			`update jobs set status='failed', error=$2, completed_at=now(), finished_at=now(), updated_at=now() where id=$1 returning *`,
			[id, msg]
		).catch(async (e) => {
			if (/column .*completed_at.* does not exist/i.test(e.message)) {
				const legacy = await app.db.query(`update jobs set status='failed', error=$2, finished_at=now(), updated_at=now() where id=$1 returning *`, [id, msg]);
				return legacy;
			}
			throw e;
		});
		log.error({ job: id, error: msg, attempts, maxAttempts }, 'job failed (final)');
		return rows[0];
	}

	// Concurrent dispatcher loop with configurable concurrency
	const workerId = `core-${process.pid}`;
	const MAX_CONCURRENT_JOBS = Math.max(1, Math.min(100, parseInt(process.env.MAX_CONCURRENT_JOBS || '20')));
	
	async function dispatchOnce() {
		const job = await _claimNext(workerId);
		if (!job) return false;
		const handler = handlers.get(job.type);
		if (!handler) {
			await fail(job.id, new Error(`No handler for job type ${job.type}`));
			return true;
		}
		try {
			await handler({ job, updateProgress, complete, fail, requestCancel, app });
		} catch (e) {
			app.log.error({ err: e, job: job.id }, 'job handler error');
			try { await fail(job.id, e); } catch {}
		}
		return true;
	}

	async function _heartbeat(jobId) {
		try { await app.db.query(`update jobs set last_heartbeat_at=now(), updated_at=now() where id=$1 and status='running'`, [jobId]); } catch {}
	}	async function _recoverStale() {
		// Jobs running without heartbeat for > 2 minutes -> requeue (unless max attempts exceeded)
		try {
			const { rows } = await app.db.query(`select * from jobs where status='running' and (last_heartbeat_at is null or last_heartbeat_at < now() - interval '120 seconds') limit 20`);
			for (const j of rows) {
				const attempts = Number(j.attempt || 0);
				const maxAttempts = Number(j.max_attempts || 1);
				if (attempts >= maxAttempts) {
					try {
						await app.db.query(`update jobs set status='failed', error=coalesce(error,'stale without heartbeat'), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id]);
					} catch (e) {
						if (/column .*completed_at.* does not exist/i.test(e.message)) {
							await app.db.query(`update jobs set status='failed', error=coalesce(error,'stale without heartbeat'), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id]);
						} else throw e;
					}
					log.error({ job: j.id }, 'stale job marked failed');
				} else {
					await app.db.query(`update jobs set status='queued', updated_at=now(), run_at=now()+ interval '5 seconds' where id=$1 and status='running'`, [j.id]);
					log.warn({ job: j.id }, 'stale job requeued');
				}
			}
		} catch (e) {
			log.error({ err: e }, 'stale recovery failed');
		}
	}

	// Helper: restore tag after cancellation of deletion
	async function _restoreTagAfterCancellation({ connectionId, tagId, jobId, source }) {
		if (!connectionId || !tagId) return;
		try {
			// Check original_subscribed flag
			const { rows: tmRows } = await app.db.query(`select original_subscribed from tag_metadata where connection_id=$1 and tag_id=$2`, [connectionId, tagId]);
			const orig = !!tmRows?.[0]?.original_subscribed;
			await app.db.query(`update tag_metadata set status='active', delete_job_id=null where connection_id=$1 and tag_id=$2 and coalesce(status,'active') in ('pending_delete','deleting')`, [connectionId, tagId]);
			if (orig) {
				try {
					const { rows: cfgRows } = await app.db.query(
						`select config_data from connections where id=$1`, 
						[connectionId]
					);
					if (cfgRows.length) {
						const conn = cfgRows[0].config_data || {};
						let subscribe = Array.isArray(conn.subscribe) ? conn.subscribe.slice() : [];
						const tidNum = Number(tagId);
						if (!subscribe.some(x => Number(x) === tidNum)) subscribe.push(tidNum);
						conn.subscribe = subscribe;
						await app.db.query(
							`update connections set config_data=$1, updated_at=now() where id=$2`, 
							[conn, connectionId]
						);
						try { if (app.nats?.healthy()) app.nats.publish('df.connectivity.tags.changed.v1', { schema: 'connectivity.tags.changed@v1', ts: new Date().toISOString(), connection_id: connectionId, op: 'tag_restored', restored_tag_id: tagId, source }); } catch {}
					}
				} catch (e) {
					log.warn({ job: jobId, err: e, connectionId, tagId }, 'restoreTag: failed subscription restore');
				}
			}
			log.info({ job: jobId, connectionId, tagId, source }, 'tag restored after cancellation');
		} catch (e) {
			log.warn({ job: jobId, err: e, connectionId, tagId }, 'restoreTag failed');
		}
	}

	// Force-cancel enforcement: if a job is still marked running while cancellation_requested=true, finalize it as cancelled.
	async function _enforceCancellationRequests() {
		try {
			const { rows } = await app.db.query(`select id, type, params from jobs where status='running' and cancellation_requested=true limit 25`);
			for (const j of rows) {
				if (j.type === 'tag_delete') {
					const connectionId = j.params?.connection_id || j.params?.connectionId || j.params?.conn_id;
					const tagId = j.params?.tag_id || j.params?.tagId;
					await _restoreTagAfterCancellation({ connectionId, tagId, jobId: j.id, source: 'enforce' });
				}
				try {
					await app.db.query(`update jobs set status='cancelled', completed_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id]);
				} catch (e) {
					log.error({ job: j.id, err: e }, 'failed to mark job cancelled');
				}
			}
			if (rows.length) log.info({ count: rows.length }, 'enforced cancellation on running jobs');
		} catch (e) {
			log.error({ err: e }, 'cancellation enforcement failed');
		}
	}

	// Universal runtime timeout (no per-job deadline column). Hard-fail jobs exceeding wall clock runtime.
	async function _enforceRuntimeTimeout() {
		const maxMs = Math.max(60_000, Number(process.env.JOB_MAX_RUNTIME_MS || 15 * 60_000)); // default 15m
		try {
			const { rows } = await app.db.query(
				`select id from jobs where status='running' and started_at < now() - ($1::int || ' milliseconds')::interval limit 25`,
				[maxMs]
			);
			for (const r of rows) {
				try {
					await app.db.query(`update jobs set status='failed', error=coalesce(error,'timeout'), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [r.id]);
					log.error({ job: r.id, maxMs }, 'job timed out');
				} catch (e) {
					log.error({ job: r.id, err: e }, 'failed to mark timeout');
				}
			}
		} catch (e) {
			log.error({ err: e }, 'runtime timeout enforcement failed');
		}
	}

	// Reconcile orphaned tag deletion jobs that finished work (tags deleted) but never marked completed (e.g. crash after loop)
	async function _reconcileOrphanedTagDeleteJobs() {
		try {
			const { rows: jobs } = await app.db.query(`
				select id, type, params, created_at, started_at, last_heartbeat_at
				from jobs
				where status='running'
				  and type in ('tags_delete','tag_delete')
				limit 50`);
			if (jobs.length) log.debug({ count: jobs.length }, 'periodic reconcile: scanning running tag delete jobs');
			let forced = 0; let completed = 0;
			for (const j of jobs) {
				const p = j.params || {};
				const connectionId = p.connection_id || p.connectionId || p.conn_id;
				let tagIds = p.tag_ids || (p.tag_id != null ? [p.tag_id] : null);
				if (!connectionId || !Array.isArray(tagIds) || !tagIds.length) { log.debug({ job: j.id }, 'reconcile: missing connection/tagIds'); continue; }
				tagIds = [...new Set(tagIds.map(Number).filter(n => Number.isFinite(n)))];
				if (!tagIds.length) { log.debug({ job: j.id }, 'reconcile: no numeric tagIds'); continue; }
				try {
					const { rows: tm } = await app.db.query(`select tag_id,status from tag_metadata where connection_id=$1 and tag_id = any($2)`, [connectionId, tagIds]);
					const statusMap = new Map(tm.map(r => [Number(r.tag_id), r.status]));
					const allDeleted = tagIds.every(tid => statusMap.get(tid) === 'deleted');
					const anyPending = tagIds.some(tid => ['pending_delete','deleting'].includes(statusMap.get(tid)));
					log.debug({ job: j.id, connectionId, tagIds, allDeleted, anyPending, last_heartbeat_at: j.last_heartbeat_at }, 'reconcile: evaluation');
					if (allDeleted) {
						const perTag = tagIds.map(tid => ({ tag_id: tid, status: 'deleted' }));
						try {
							await app.db.query(`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id, { connectionId, tags_total: tagIds.length, tags_completed: tagIds.length, per_tag: perTag, reconciled: true, via: 'periodic' }]);
							await app.db.query(`update tag_metadata set delete_job_id=null where connection_id=$1 and tag_id = any($2) and status='deleted' and delete_job_id=$3`, [connectionId, tagIds, j.id]);
							log.warn({ job: j.id, connectionId, tagCount: tagIds.length }, 'periodic reconcile: marked job completed');
							completed++;
						} catch (e) {
							log.error({ job: j.id, err: e }, 'periodic reconcile: failed to mark completed');
						}
					} else if (anyPending) {
						try {
							const { rows: counts } = await (app.tsdb || app.db).query(`select tag_id, count(*)::bigint as c from tag_values where connection_id=$1 and tag_id = any($2) group by tag_id`, [connectionId, tagIds]);
							const countMap = new Map(counts.map(r => [Number(r.tag_id), Number(r.c)]));
							const allZero = tagIds.every(tid => (countMap.get(tid) || 0) === 0);
							if (allZero) {
								await app.db.query(`update tag_metadata set status='deleted', is_subscribed=false, deleted_at=coalesce(deleted_at, now()), delete_job_id=null where connection_id=$1 and tag_id = any($2)`, [connectionId, tagIds]);
								try { if (app.nats?.healthy()) { for (const tid of tagIds) { app.nats.publish('df.connectivity.tags.changed.v1', { schema: 'connectivity.tags.changed@v1', ts: new Date().toISOString(), connection_id: connectionId, op: 'tag_removed', removed_tag_id: tid, via: 'periodic_reconcile' }); } } } catch {}
								const perTag = tagIds.map(tid => ({ tag_id: tid, status: 'deleted', forced: true }));
								try {
									await app.db.query(`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id, { connectionId, tags_total: tagIds.length, tags_completed: tagIds.length, per_tag: perTag, reconciled: true, via: 'periodic-forced' }]);
									log.warn({ job: j.id, connectionId, tagCount: tagIds.length }, 'periodic reconcile: force-completed orphan tag delete job');
									forced++;
								} catch (e3) { log.error({ job: j.id, err: e3 }, 'periodic reconcile: force-complete update failed'); }
							}
						} catch (e2) { log.error({ job: j.id, err: e2 }, 'reconcile: orphan pending evaluation failed'); }
					} else {
						log.debug({ job: j.id, connectionId }, 'reconcile: partial with no active deleting states');
					}
				} catch (e) {
					log.error({ job: j.id, err: e }, 'reconcile: tag status query failed');
				}
			}
			if (forced || completed) {
				log.info({ forced, completed }, 'periodic reconcile: adjustments applied');
			}
		} catch (e) {
			log.error({ err: e }, 'periodic reconcile pass failed');
		}
	}

	// Detect stalled tag delete jobs showing pct=100 (or >99) but still running; verify and finalize.
	async function _reconcileStalledTagDeleteJobs() {
		try {
			log.debug('stalled reconcile: pass begin');
			const { rows } = await app.db.query(`select id,type,params,progress,started_at,last_heartbeat_at from jobs where status='running' and type in ('tag_delete','tags_delete') and (progress->>'pct')::float >= 99.5 limit 50`);
			if (!rows.length) { log.debug('stalled reconcile: no candidates'); return; }
			for (const j of rows) {
				const p = j.params || {};
				const connectionId = p.connection_id || p.connectionId || p.conn_id;
				let tagIds = p.tag_ids || (p.tag_id != null ? [p.tag_id] : null);
				if (!connectionId || !Array.isArray(tagIds) || !tagIds.length) continue;
				tagIds = [...new Set(tagIds.map(Number).filter(n => Number.isFinite(n)))];
				if (!tagIds.length) continue;
				// Count remaining rows
				let remaining = 0;
				try {
					const { rows: cr } = await (app.tsdb || app.db).query(`select sum(c)::bigint as s from (select count(*)::bigint as c from tag_values where connection_id=$1 and tag_id = any($2)) q`, [connectionId, tagIds]);
					remaining = Number(cr?.[0]?.s || 0);
				} catch (e) { log.warn({ job: j.id, err: e }, 'stalled_reconcile: count failed'); }
				if (remaining === 0) {
					// Safe finalize
					try {
						await app.db.query(`update tag_metadata set status='deleted', is_subscribed=false, deleted_at=coalesce(deleted_at, now()), delete_job_id=null where connection_id=$1 and tag_id = any($2)`, [connectionId, tagIds]);
						// Emit removal events (best-effort)
						try {
							if (app.nats?.healthy()) {
								for (const tid of tagIds) {
									app.nats.publish('df.connectivity.tags.changed.v1', { schema: 'connectivity.tags.changed@v1', ts: new Date().toISOString(), connection_id: connectionId, op: 'tag_removed', removed_tag_id: tid, via: 'stalled_finalize' });
								}
							}
						} catch {}
						const perTag = tagIds.map(tid => ({ tag_id: tid, status: 'deleted', stalled_finalize: true }));
						try {
							await app.db.query(`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id, { connectionId, tags_total: tagIds.length, tags_completed: tagIds.length, per_tag: perTag, reconciled_stalled: true }]);
						} catch (eCol) {
							if (/column \"finished_at\" .* does not exist/i.test(eCol.message) || /column "finished_at" of relation "jobs" does not exist/i.test(eCol.message)) {
								await app.db.query(`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), completed_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id, { connectionId, tags_total: tagIds.length, tags_completed: tagIds.length, per_tag: perTag, reconciled_stalled: true, legacy_no_finished_at: true }]);
							} else { throw eCol; }
						}
						log.warn({ job: j.id, connectionId, tagCount: tagIds.length }, 'stalled reconcile: finalized 100% job');
					} catch (e2) { log.error({ job: j.id, err: e2 }, 'stalled_reconcile: finalize failed'); }
				} else {
					// Attempt an auto-resume mini-delete cycle (limited) to drain residual rows gradually.
					// Strategy: For each tag, delete a small batch; update progress with residual info; refresh heartbeat.
					try {
						for (const tid of tagIds) {
							const { rows: r1 } = await (app.tsdb || app.db).query(`select ts from tag_values where connection_id=$1 and tag_id=$2 order by ts asc limit 500`, [connectionId, tid]);
							if (!r1.length) continue;
							const minTs = r1[0].ts; const maxTs = r1[r1.length - 1].ts;
							await (app.tsdb || app.db).query(`delete from tag_values where connection_id=$1 and tag_id=$2 and ts between $3 and $4`, [connectionId, tid, minTs, maxTs]);
						}
					} catch (eDel) { log.warn({ job: j.id, err: eDel }, 'stalled_reconcile: residual batch delete failed'); }
					// Recount after attempt (cheap aggregate)
					let remaining2 = remaining;
					try { const { rows: cr2 } = await (app.tsdb || app.db).query(`select sum(c)::bigint as s from (select count(*)::bigint as c from tag_values where connection_id=$1 and tag_id = any($2)) q`, [connectionId, tagIds]); remaining2 = Number(cr2?.[0]?.s || 0); } catch {}
					await app.db.query(`update jobs set progress = jsonb_set(coalesce(progress,'{}'::jsonb),'{"residual_rows"}', to_jsonb($2::bigint), true), last_heartbeat_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id, remaining2]);
					log.debug({ job: j.id, connectionId, remaining_before: remaining, remaining_after: remaining2 }, 'stalled reconcile: residual rows pass');
				}
			}
		} catch (e) {
			log.error({ err: e }, 'stalled reconcile pass failed');
		}
	}

	async function dispatcherLoop() {
		const activeJobs = new Map(); // jobId -> Promise
		let lastRecover = 0;
		let lastCancelEnforce = 0;
		let lastReconcile = 0;
		let lastHealthCheck = 0;
		let iter = 0;
		
		log.info({ maxConcurrent: MAX_CONCURRENT_JOBS }, 'dispatcher: starting with concurrency limit');
		
		while (true) { // eslint-disable-line no-constant-condition
			const now = Date.now();
			iter++;
			
			// Periodic health check (every 30s)
			if (now - lastHealthCheck > 30000) {
				const memUsage = process.memoryUsage();
				const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
				const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
				log.info({ 
					activeJobs: activeJobs.size, 
					maxConcurrent: MAX_CONCURRENT_JOBS,
					heapUsedMB,
					heapTotalMB,
					heapPercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)
				}, 'dispatcher: health check');
				lastHealthCheck = now;
			}
			
			if (iter % 200 === 1) {
				log.info({ iter, activeJobs: activeJobs.size, maxConcurrent: MAX_CONCURRENT_JOBS }, 'dispatcher: heartbeat');
			}
			
			// Periodic maintenance tasks
			if (now - lastRecover > 30_000) { await _recoverStale(); lastRecover = now; }
			if (now - lastCancelEnforce > 5_000) { await _enforceCancellationRequests(); lastCancelEnforce = now; }
			if (now % 10_000 < 50) { await _enforceRuntimeTimeout(); }
			if (now - lastReconcile > 20_000) { await _reconcileOrphanedTagDeleteJobs(); lastReconcile = now; }
			
			// Lightweight stalled check
			try {
				log.debug('dispatcher: stalled reconcile invoke');
				await _reconcileStalledTagDeleteJobs();
				log.debug('dispatcher: stalled reconcile complete');
			} catch (e) {
				log.error({ err: e }, 'dispatcher: stalled reconcile invocation failed');
			}
			
			// Claim and dispatch jobs up to concurrency limit
			while (activeJobs.size < MAX_CONCURRENT_JOBS) {
				const job = await _claimNext(workerId);
				if (!job) break; // No more jobs available
				
				const handler = handlers.get(job.type);
				if (!handler) {
					await fail(job.id, new Error(`No handler for job type ${job.type}`));
					continue;
			}
			
			// Launch job asynchronously (don't await - allows concurrent execution)
			const jobPromise = (async () => {
				const startTime = Date.now();
				const startMemory = process.memoryUsage().heapUsed;
				try {
					log.info({ jobId: job.id, jobType: job.type }, 'job: starting execution');
					await handler({ job, updateProgress, complete, fail, requestCancel, app });
					const endMemory = process.memoryUsage().heapUsed;
					const memoryDelta = endMemory - startMemory;
					const durationMs = Date.now() - startTime;
					log.info({ jobId: job.id, jobType: job.type, durationMs, memoryDeltaMB: (memoryDelta / 1024 / 1024).toFixed(2) }, 'job: completed successfully');
				} catch (e) {
					log.error({ err: e, jobId: job.id, jobType: job.type, durationMs: Date.now() - startTime }, 'job: handler error');
					try { await fail(job.id, e); } catch {}
				} finally {
					activeJobs.delete(job.id);
					log.debug({ jobId: job.id, activeCount: activeJobs.size }, 'job: removed from active set');
				}
			})();
			
			activeJobs.set(job.id, jobPromise);
			log.debug({ jobId: job.id, activeCount: activeJobs.size, maxConcurrent: MAX_CONCURRENT_JOBS }, 'job: added to active set');
		}			// Wait before next claim attempt (shorter idle when jobs are active)
			const idleMs = activeJobs.size === 0 ? 1000 : 250;
			await new Promise(r => setTimeout(r, idleMs));
		}
	}

	// Demo sleep handler (also template): params: { steps, delay_ms }
	register('demo_sleep', async ({ job, updateProgress, complete }) => {
		const steps = Math.max(1, Math.min(500, Number(job.params?.steps || 10)));
		const delay = Math.max(10, Math.min(10_000, Number(job.params?.delay_ms || 200))); // allow larger but cap
		log.info({ job: job.id, steps, delay }, 'demo_sleep started');
		for (let i = 0; i < steps; i++) {
			// Cooperatively sleep in short slices so cancellation can be honored quickly
			const targetMs = Date.now() + delay;
			while (Date.now() < targetMs) {
				// Poll cancellation every ~100ms (or remainder)
				const slice = Math.min(100, targetMs - Date.now());
				if (slice > 0) await new Promise(r => setTimeout(r, slice));
				const fresh = await get(job.id);
				if (!fresh) return; // job gone
				if (fresh.cancellation_requested) {
					log.info({ job: job.id, atStep: i }, 'job cancellation honored');
					await app.db.query(`update jobs set status='cancelled', completed_at=now(), updated_at=now() where id=$1 and status='running'`, [job.id]);
					return;
				}
				await _heartbeat(job.id); // keep heartbeat fresh even during long waits
			}
			await updateProgress(job.id, { pct: ((i + 1) / steps) * 100, step: i + 1, steps });
		}
		await complete(job.id, { message: 'demo sleep done', steps });
	});

	// Failing / flaky demo handler: params { fail_until_attempt, message }
	register('demo_flaky', async ({ job, complete, fail }) => {
		const until = Math.max(0, Number(job.params?.fail_until_attempt || 2));
		const attempts = Number(job.attempt || 1); // attempt incremented when claimed
		if (attempts <= until) {
			log.warn({ job: job.id, attempts, until }, 'demo_flaky deliberate failure');
			throw new Error(`Deliberate failure attempt ${attempts} of ${until}`);
		}
		await complete(job.id, { message: job.params?.message || 'flaky job eventually succeeded', attempts, until });
	});


	// Unified tags deletion engine (single or multiple)
	async function _runTagsDelete({ job, complete, fail, updateProgress }) {
		const connectionId = job.params?.connection_id;
		let tagIds = job.params?.tag_ids;
		if (!tagIds && job.params?.tag_id != null) tagIds = [job.params.tag_id];
		if (!connectionId || !Array.isArray(tagIds) || !tagIds.length) return fail(job.id, new Error('Missing connection_id or tag_ids'));
		// Normalize & unique
		tagIds = [...new Set(tagIds.map(Number).filter(n => Number.isFinite(n)))];
		const single = tagIds.length === 1;
		const batchSize = Math.max(100, Math.min(5000, Number(job.params?.batch_size || 1000)));
		const tsdb = app.tsdb || app.db;
		// Mark deleting for all
		try {
			await app.db.query(`update tag_metadata set status='deleting' where connection_id=$1 and tag_id = any($2) and coalesce(status,'active') in ('pending_delete','deleting','active')`, [connectionId, tagIds]);
		} catch (e) { log.warn({ job: job.id, err: e }, 'unified_delete: bulk mark deleting failed'); }
		// Pre-count per-tag totals so we can compute accurate global total and avoid deleted>total drift
		let totalRows = 0;
		const perTagTotals = new Map();
		try {
			const { rows } = await tsdb.query(`select tag_id, count(*)::bigint as c from tag_values where connection_id=$1 and tag_id = any($2) group by tag_id`, [connectionId, tagIds]);
			for (const r of rows) { const c = Number(r.c||0); perTagTotals.set(Number(r.tag_id), c); totalRows += c; }
		} catch (e) { log.warn({ job: job.id, err: e }, 'unified_delete: pre-count failed'); }
		let deletedRows = 0;
		let tagsCompleted = 0;
		const tagsTotal = tagIds.length;
		const perTagResults = [];
		await updateProgress(job.id, single ? { pct: 0, deleted: 0, total: totalRows } : { pct: 0, deleted_rows: 0, total_rows: totalRows, tags_completed: 0, tags_total: tagsTotal });
		for (const tagId of tagIds) {
			// Cancellation?
			const fresh = await get(job.id);
			if (fresh?.cancellation_requested) {
				const remaining = tagIds.slice(tagIds.indexOf(tagId));
				for (const r of remaining) await _restoreTagAfterCancellation({ connectionId, tagId: r, jobId: job.id, source: 'unified-cancel' });
				await app.db.query(`update jobs set status='cancelled', completed_at=now(), updated_at=now() where id=$1 and status='running'`, [job.id]);
				return;
			}
			// Use pre-count if we have it; fallback to live count for safety
			let tagTotal = perTagTotals.get(tagId) || 0;
			if (!tagTotal) { try { const { rows } = await tsdb.query(`select count(*)::bigint as c from tag_values where connection_id=$1 and tag_id=$2`, [connectionId, tagId]); tagTotal = Number(rows?.[0]?.c || 0); } catch {} }
			let tagDeleted = 0; let batches = 0;
			while (true) {
				const fresh2 = await get(job.id); if (fresh2?.cancellation_requested) break;
				const { rows: batchRows } = await tsdb.query(`select ts from tag_values where connection_id=$1 and tag_id=$2 order by ts asc limit $3`, [connectionId, tagId, batchSize]);
				if (!batchRows.length) break;
				const minTs = batchRows[0].ts; const maxTs = batchRows[batchRows.length - 1].ts;
				const { rowCount } = await tsdb.query(`delete from tag_values where connection_id=$1 and tag_id=$2 and ts between $3 and $4`, [connectionId, tagId, minTs, maxTs]);
				if (!rowCount) break;
				deletedRows += rowCount; tagDeleted += rowCount;
				// Avoid division by zero and clamp computed pct using actual totals.
				const tagPortion = tagTotal ? (tagDeleted / tagTotal) : 1;
				const pct = totalRows ? (deletedRows / Math.max(1, totalRows)) * 100 : ((tagsCompleted + tagPortion) / tagsTotal) * 100;
				await updateProgress(job.id, single ? { deleted: deletedRows, total: totalRows, pct } : { current_tag_id: tagId, deleted_rows: deletedRows, total_rows: totalRows, tags_completed: tagsCompleted, tags_total: tagsTotal, pct });
				await _heartbeat(job.id);
				await new Promise(r => setTimeout(r, 20));
				batches++; if (batches > 200000) { log.warn({ job: job.id, tagId }, 'unified_delete excessive batches'); break; }
			}
			// Verification
			let residual = 0; let verifyAttempts = 0;
			while (verifyAttempts < 3) {
				const { rows: vr } = await tsdb.query(`select 1 from tag_values where connection_id=$1 and tag_id=$2 limit 1`, [connectionId, tagId]);
				if (!vr.length) { residual = 0; break; }
				residual = 1; verifyAttempts++;
				const { rows: batchRows2 } = await tsdb.query(`select ts from tag_values where connection_id=$1 and tag_id=$2 order by ts asc limit $3`, [connectionId, tagId, batchSize]);
				if (!batchRows2.length) continue; await tsdb.query(`delete from tag_values where connection_id=$1 and tag_id=$2 and ts between $3 and $4`, [connectionId, tagId, batchRows2[0].ts, batchRows2[batchRows2.length - 1].ts]);
				await new Promise(r => setTimeout(r, 40));
			}
			if (residual) {
				try { await app.db.query(`update tag_metadata set status='active' where connection_id=$1 and tag_id=$2`, [connectionId, tagId]); } catch {}
				perTagResults.push({ tag_id: tagId, status: 'failed_residual', deleted_rows: tagDeleted });
				return fail(job.id, new Error(`residual_rows_tag_${tagId}`));
			}
			// Success cleanup
			try {
				await app.db.query(`update tag_metadata set status='deleted', is_subscribed=false, deleted_at=now(), delete_job_id=null where connection_id=$1 and tag_id=$2`, [connectionId, tagId]);
				const { rows: cfgRows } = await app.db.query(
					`select config_data from connections where id=$1`, 
					[connectionId]
				);
				if (cfgRows.length) {
					const conn = cfgRows[0].config_data || {}; conn.driver_opts = conn.driver_opts || {};
					const tag_map = conn.driver_opts.tag_map || {}; const tag_meta_map = conn.driver_opts.tag_meta || {};
					if (tag_map[tagId] != null) delete tag_map[tagId]; if (tag_meta_map[tagId] != null) delete tag_meta_map[tagId];
					await app.db.query(
						`update connections set config_data=$1, updated_at=now() where id=$2`, 
						[conn, connectionId]
					);
				}
				// Emit removal event (best-effort)
				try { if (app.nats?.healthy()) app.nats.publish('df.connectivity.tags.changed.v1', { schema: 'connectivity.tags.changed@v1', ts: new Date().toISOString(), connection_id: connectionId, op: 'tag_removed', removed_tag_id: tagId, via: 'delete_finalize' }); } catch {}
			} catch (e) { log.warn({ job: job.id, err: e, tagId }, 'unified_delete cleanup failed'); }
			perTagResults.push({ tag_id: tagId, status: 'deleted', deleted_rows: tagDeleted });
			tagsCompleted++;
			const pct = totalRows ? (deletedRows / Math.max(1, totalRows)) * 100 : (tagsCompleted / tagsTotal) * 100;
			await updateProgress(job.id, single ? { deleted: deletedRows, total: totalRows, pct } : { current_tag_id: null, deleted_rows: deletedRows, total_rows: totalRows, tags_completed: tagsCompleted, tags_total: tagsTotal, pct });
		}
		return complete(job.id, single ? { connectionId, tag_id: tagIds[0], deleted_rows: deletedRows, total_rows: totalRows, per_tag: perTagResults } : { connectionId, tags_total: tagsTotal, tags_completed: tagsCompleted, deleted_rows: deletedRows, total_rows: totalRows, per_tag: perTagResults });
	}

	// Primary multi/single capable handler
	register('tags_delete', async (ctx) => _runTagsDelete(ctx));
	// Backward-compatible alias for single tag operations
	register('tag_delete', async (ctx) => {
		ctx.job.params = { ...ctx.job.params, tag_ids: ctx.job.params?.tag_ids || (ctx.job.params?.tag_id != null ? [ctx.job.params.tag_id] : undefined) };
		await _runTagsDelete(ctx);
	});

	// Capacity calculator - calculates disk capacity estimation and stores in system_settings
	register('capacity_calculation', async (ctx) => {
		const capacityCalculator = (await import('../workers/capacity-calculator.js')).default;
		await capacityCalculator(ctx);
	});

	// Flow metrics cleanup - deletes all time-series data for a deleted flow
	register('flow_metrics_cleanup', async (ctx) => {
		const { job, updateProgress, complete, fail } = ctx;
		const { flowId } = job.params;
		
		try {
			await updateProgress(job.id, { message: 'Finding flow metric tags...', pct: 10 });
			
			// Get System connection
			const { rows: connRows } = await app.db.query(
				`SELECT id FROM connections WHERE name = 'System' AND is_system_connection = true LIMIT 1`
			);
			
			if (!connRows.length) {
				return await complete(job.id, { message: 'System connection not found', tagsDeleted: 0, dataPointsDeleted: 0 });
			}
			
			const systemConnId = connRows[0].id;
			
			// Get all tag IDs for this flow (by UUID)
			const { rows: tags } = await app.db.query(
				`SELECT tag_id FROM tag_metadata 
				 WHERE connection_id = $1 
				   AND driver_type = 'SYSTEM'
				   AND tag_path LIKE $2`,
				[systemConnId, `flow.${flowId}.%`]
			);
			
			if (tags.length === 0) {
				return await complete(job.id, { message: 'No tags found for flow', tagsDeleted: 0, dataPointsDeleted: 0 });
			}
			
			const tagIds = tags.map(t => t.tag_id);
			await updateProgress(job.id, { message: `Found ${tagIds.length} metric tags`, pct: 30 });
			
			// Delete time-series data from TimescaleDB
			await updateProgress(job.id, { message: 'Deleting time-series data from TimescaleDB...', pct: 50 });
			const { rowCount: dataPoints } = await app.tsdb.query(
				`DELETE FROM system_metrics WHERE tag_id = ANY($1)`,
				[tagIds]
			);
			
			await updateProgress(job.id, { message: 'Deleting tag metadata...', pct: 80 });
			
			// Hard delete tags from tag_metadata
			const { rowCount: tagsDeleted } = await app.db.query(
				`DELETE FROM tag_metadata 
				 WHERE connection_id = $1 
				   AND driver_type = 'SYSTEM'
				   AND tag_path LIKE $2`,
				[systemConnId, `flow.${flowId}.%`]
			);
			
			await complete(job.id, { 
				message: `Cleaned up ${tagsDeleted} tags and ${dataPoints} data points`,
				tagsDeleted,
				dataPointsDeleted: dataPoints
			});
		} catch (error) {
			await fail(job.id, error);
		}
	}, { maxAttempts: 3, description: 'Delete all metric data for a deleted flow' });

	// Flow executor - executes deployed flows with node-by-node processing
	register('flow_execution', async (ctx) => {
		const { executeFlow } = await import('./flow-executor.js');
		await executeFlow(ctx);
	}, { maxAttempts: 1, description: 'Execute a flow with all its nodes' });


	// Graceful shutdown hook
	app.addHook('onClose', async () => {
		try {
			// Stop all active flow sessions
			const { FlowSession } = await import('./flow-session.js');
			const stoppedCount = await FlowSession.stopAllActiveSessions(app);
			if (stoppedCount > 0) {
				log.info({ stoppedCount }, 'stopped active flow sessions on shutdown');
			}
			
			// Requeue running jobs
			await app.db.query(`update jobs set status='queued', updated_at=now(), run_at=now()+ interval '5 seconds' where status='running'`);
			log.info('requeued running jobs on shutdown');
		} catch (e) { log.error({ err: e }, 'failed to cleanup on shutdown'); }
	});

	async function metrics() {
		const { rows } = await app.db.query(`
			with base as (
				select
					count(*) filter (where status='queued') as queued,
					count(*) filter (where status='running') as running,
					count(*) filter (where status='failed') as failed,
					count(*) filter (where status='completed') as completed,
					count(*) filter (where status='cancelled') as cancelled,
					avg(extract(epoch from (completed_at - started_at))) filter (where completed_at is not null and started_at is not null) as avg_run_s,
					avg(extract(epoch from (started_at - created_at))) filter (where started_at is not null) as avg_wait_s,
					count(*) filter (where completed_at > now() - interval '5 minutes') as completed_5m
				from jobs
			)
			select * from base;`);
		return rows[0] || {};
	}

	// One-time reconciliation at startup to immediately clean up prior crash leftovers
	async function _startupReconcile() {
		const stats = { tag_completed: 0, tag_requeued: 0, tag_force_completed: 0, generic_requeued: 0, generic_failed: 0 };
		try {
			const { rows: running } = await app.db.query(`select id,type,params,attempt,max_attempts,last_heartbeat_at,started_at from jobs where status='running' limit 200`);
			if (running.length) log.info({ count: running.length }, 'startup reconcile: scanning running jobs');
			const kv = app.tsdb || app.db; // prefer tsdb for tag_values if present
			for (const j of running) {
				if (['tag_delete','tags_delete'].includes(j.type)) {
					const p = j.params || {};
					const connectionId = p.connection_id || p.connectionId || p.conn_id;
					let tagIds = p.tag_ids || (p.tag_id != null ? [p.tag_id] : null);
					if (!connectionId || !Array.isArray(tagIds) || !tagIds.length) continue;
					tagIds = [...new Set(tagIds.map(Number).filter(n => Number.isFinite(n)))];
					if (!tagIds.length) continue;
					try {
						const { rows: tm } = await app.db.query(`select tag_id,status from tag_metadata where connection_id=$1 and tag_id = any($2)`, [connectionId, tagIds]);
						const statuses = new Map(tm.map(r => [Number(r.tag_id), r.status]));
						const allDeleted = tagIds.every(tid => statuses.get(tid) === 'deleted');
						const anyDeleting = tagIds.some(tid => ['deleting','pending_delete'].includes(statuses.get(tid)));
						if (allDeleted) {
							const perTag = tagIds.map(tid => ({ tag_id: tid, status: 'deleted' }));
							await app.db.query(`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id, { connectionId, tags_total: tagIds.length, tags_completed: tagIds.length, per_tag: perTag, reconciled_startup: true }]);
							await app.db.query(`update tag_metadata set is_subscribed=false, delete_job_id=null where connection_id=$1 and tag_id = any($2) and status='deleted' and delete_job_id=$3`, [connectionId, tagIds, j.id]);
							try { if (app.nats?.healthy()) { for (const tid of tagIds) { app.nats.publish('df.connectivity.tags.changed.v1', { schema: 'connectivity.tags.changed@v1', ts: new Date().toISOString(), connection_id: connectionId, op: 'tag_removed', removed_tag_id: tid, via: 'startup_reconcile' }); } } } catch {}
							stats.tag_completed++;
						} else if (anyDeleting) {
							// Potential orphan: tags still deleting/pending; if all values gone we can force-complete.
							try {
								const { rows: counts } = await kv.query(`select tag_id, count(*)::bigint as c from tag_values where connection_id=$1 and tag_id = any($2) group by tag_id`, [connectionId, tagIds]);
								const countMap = new Map(counts.map(r => [Number(r.tag_id), Number(r.c)]));
								const allZero = tagIds.every(tid => (countMap.get(tid) || 0) === 0);
								if (allZero) {
									await app.db.query(`update tag_metadata set status='deleted', is_subscribed=false, deleted_at=coalesce(deleted_at, now()), delete_job_id=null where connection_id=$1 and tag_id = any($2)`, [connectionId, tagIds]);
									try { if (app.nats?.healthy()) { for (const tid of tagIds) { app.nats.publish('df.connectivity.tags.changed.v1', { schema: 'connectivity.tags.changed@v1', ts: new Date().toISOString(), connection_id: connectionId, op: 'tag_removed', removed_tag_id: tid, via: 'periodic_forced' }); } } } catch {}
									const perTag = tagIds.map(tid => ({ tag_id: tid, status: 'deleted', forced: true }));
									await app.db.query(`update jobs set status='completed', result=$2, progress=jsonb_set(coalesce(progress,'{}'::jsonb),'{"pct"}','100'::jsonb,true), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id, { connectionId, tags_total: tagIds.length, tags_completed: tagIds.length, per_tag: perTag, reconciled_startup_forced: true }]);
									stats.tag_force_completed++;
									log.warn({ job: j.id, connectionId, tagCount: tagIds.length }, 'startup reconcile: force-completed orphan tag delete job');
								}
							} catch (e2) { log.error({ job: j.id, err: e2 }, 'startup reconcile: orphan evaluation failed'); }
						} else {
							// No tags actively deleting/pending but not all deleted -> requeue quickly
							await app.db.query(`update jobs set status='queued', updated_at=now(), run_at=now()+ interval '3 seconds' where id=$1 and status='running'`, [j.id]);
							stats.tag_requeued++;
						}
					} catch (e) { log.error({ job: j.id, err: e }, 'startup reconcile tag_delete failed'); }
				} else {
					const hbFresh = j.last_heartbeat_at && (Date.now() - new Date(j.last_heartbeat_at).getTime()) < 10_000;
					if (hbFresh) continue;
					const attempts = Number(j.attempt || 0);
					const maxAttempts = Number(j.max_attempts || 1);
					if (attempts >= maxAttempts) {
						await app.db.query(`update jobs set status='failed', error=coalesce(error,'startup stale'), completed_at=now(), finished_at=now(), updated_at=now() where id=$1 and status='running'`, [j.id]);
						stats.generic_failed++;
					} else {
						await app.db.query(`update jobs set status='queued', updated_at=now(), run_at=now()+ interval '5 seconds' where id=$1 and status='running'`, [j.id]);
						stats.generic_requeued++;
					}
				}
			}
			if (stats.tag_completed || stats.tag_requeued || stats.tag_force_completed || stats.generic_requeued || stats.generic_failed) {
				log.warn({ stats }, 'startup job reconciliation adjustments applied');
			} else {
				log.info('startup reconcile: no adjustments needed');
			}
		} catch (e) {
			log.error({ err: e }, 'startup reconciliation fatal');
		}
	}

	async function remove(id) {
		// Prevent deletion of running jobs for consistency / audit; allow others
		const { rows } = await app.db.query(`delete from jobs where id=$1 and status <> 'running' returning *`, [id]);
		if (rows.length) log.info({ job: id }, 'job deleted');
		return rows[0] || null;
	}

	// Public API
	app.decorate('jobs', {
		enqueue,
		list,
		get,
		requestCancel,
		updateProgress,
		complete,
		fail,
		remove,
		register,
		metrics,
		start: async () => { 
			await _startupReconcile(); 
			dispatcherLoop();
			
			// Schedule periodic capacity calculation job
			async function _schedulePeriodicJobs() {
				try {
					// Check if capacity calculation job already scheduled for next 15 minutes
					const { rows } = await app.db.query(`
						SELECT id FROM jobs 
						WHERE type = 'capacity_calculation' 
						  AND status IN ('queued', 'running')
						  AND created_at > NOW() - INTERVAL '15 minutes'
						LIMIT 1
					`);
					
					if (rows.length === 0) {
						// No recent job, schedule one
						await enqueue('capacity_calculation', {}, {});
						log.info('Scheduled capacity_calculation job');
					}
				} catch (e) {
					log.warn({ err: e }, 'Failed to schedule capacity_calculation job');
				}
			}
			
			// Run every 15 minutes
			setInterval(_schedulePeriodicJobs, 15 * 60 * 1000);
			// First run after 10 seconds
			setTimeout(_schedulePeriodicJobs, 10_000);
		},
	});
});

