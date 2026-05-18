/**
 * Forecast Generator Worker
 * Fetches historical tag data from TimescaleDB, calls the Python TimesFM service,
 * and returns timestamped forecast series for each requested tag.
 */

export default async function forecastGenerator({ job, updateProgress, complete, fail, app }) {
  const { tag_ids, from, to, horizon, quantiles } = job.params;

  try {
    await updateProgress(job.id, { message: 'Fetching historical data...', pct: 10 });

    // Determine which TSDB table to use — same logic as chartComposer.js points route
    const { rows: tagRows } = await app.db.query(
      `SELECT DISTINCT tm.tag_id, tm.driver_type, c.is_system_connection
       FROM tag_metadata tm
       JOIN connections c ON tm.connection_id = c.id
       WHERE tm.tag_id = ANY($1::int[])
         AND coalesce(tm.status, 'active') <> 'deleted'`,
      [tag_ids]
    );

    if (!tagRows.length) {
      return await fail(job.id, new Error('No valid tags found'));
    }

    const useSystemMetrics = tagRows.every(
      r => r.is_system_connection === true && r.driver_type !== 'INTERNAL'
    );
    const tableName = useSystemMetrics ? 'system_metrics' : 'tag_values';
    const db = app.tsdb || app.db;

    // ── Fetch data per tag ──────────────────────────────────────────────────
    const tagDataMap = [];

    for (let i = 0; i < tag_ids.length; i++) {
      const tagId = tag_ids[i];
      await updateProgress(job.id, {
        message: `Fetching data for tag ${tagId}...`,
        pct: 10 + Math.floor((i / tag_ids.length) * 35)
      });

      const { rows } = await db.query(
        `SELECT ts, v_num FROM ${tableName}
         WHERE tag_id = $1 AND ts >= $2 AND ts <= $3
         ORDER BY ts ASC
         LIMIT 2000`,
        [tagId, from, to]
      );

      if (rows.length < 4) {
        tagDataMap.push({ tag_id: tagId, error: 'insufficient_data', pointCount: rows.length });
        continue;
      }

      const values = rows
        .map(r => (r.v_num !== null ? parseFloat(r.v_num) : null))
        .filter(v => v !== null && Number.isFinite(v));

      if (values.length < 4) {
        tagDataMap.push({ tag_id: tagId, error: 'insufficient_numeric_data', pointCount: rows.length });
        continue;
      }

      // Infer step_ms from median interval between consecutive timestamps
      const timestamps = rows.map(r => new Date(r.ts).getTime());
      const intervals = [];
      for (let j = 1; j < timestamps.length; j++) {
        intervals.push(timestamps[j] - timestamps[j - 1]);
      }
      intervals.sort((a, b) => a - b);
      const step_ms = intervals[Math.floor(intervals.length / 2)];
      const last_ts = timestamps[timestamps.length - 1];

      tagDataMap.push({ tag_id: tagId, values, step_ms, last_ts, pointCount: values.length });
    }

    await updateProgress(job.id, { message: 'Running forecast model...', pct: 50 });

    // ── Call Python TimesFM service per tag ─────────────────────────────────
    const forecastUrl = process.env.FORECAST_SERVICE_URL || 'http://forecast:8100';
    const forecastResults = [];

    for (let i = 0; i < tagDataMap.length; i++) {
      const tagData = tagDataMap[i];

      if (tagData.error) {
        forecastResults.push(tagData);
        continue;
      }

      await updateProgress(job.id, {
        message: `Forecasting tag ${tagData.tag_id}...`,
        pct: 50 + Math.floor((i / tagDataMap.length) * 40)
      });

      let response;
      try {
        response = await fetch(`${forecastUrl}/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            values: tagData.values,
            horizon,
            quantiles: quantiles || false
          })
        });
      } catch (networkErr) {
        forecastResults.push({ tag_id: tagData.tag_id, error: 'forecast_service_unavailable' });
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        if (response.status === 503) {
          return await fail(job.id, new Error('model_loading'));
        }
        forecastResults.push({
          tag_id: tagData.tag_id,
          error: errorBody.detail || 'forecast_failed'
        });
        continue;
      }

      const forecast = await response.json();

      // Build forecast timestamps: last data point + step * (i+1)
      const forecastTimestamps = forecast.point_forecast.map((_, idx) =>
        new Date(tagData.last_ts + (idx + 1) * tagData.step_ms).toISOString()
      );

      forecastResults.push({
        tag_id: tagData.tag_id,
        timestamps: forecastTimestamps,
        point_forecast: forecast.point_forecast,
        lower_band: forecast.lower_band || null,
        upper_band: forecast.upper_band || null,
        step_ms: tagData.step_ms,
        pointCount: tagData.pointCount
      });
    }

    await complete(job.id, { tags: forecastResults });
  } catch (error) {
    await fail(job.id, error);
  }
}
