import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Normaliza candidatos de /api/predictions (DB format) al formato
 * que usan los componentes.
 */
function normalizePredictions(data) {
  if (!data?.candidates) return data;
  return {
    ...data,
    candidates: data.candidates.map(c => ({
      candidate: c.candidate,
      mean: c.mean ?? c.predicted_pct_mean ?? 0,
      p10:  c.p10  ?? c.predicted_pct_p10  ?? 0,
      p25:  c.p25  ?? c.predicted_pct_p25  ?? null,
      p40:  c.p40  ?? c.predicted_pct_p40  ?? null,
      p60:  c.p60  ?? c.predicted_pct_p60  ?? null,
      p75:  c.p75  ?? c.predicted_pct_p75  ?? null,
      p90:  c.p90  ?? c.predicted_pct_p90  ?? 0,
      prob_runoff: c.prob_runoff ?? c.prob_first_round ?? 0,
      prob_win: c.prob_win ?? c.prob_win_overall ?? 0,
      polls_pct: c.polls_pct ?? null,
      polymarket_pct: c.polymarket_pct ?? null,
      posterior_pct: c.posterior_pct ?? null,
    })),
    runoff_scenarios: data.runoff_scenarios || [],
    risk_scenarios: data.risk_scenarios || null,
    is_frozen: data.is_frozen || false,
    frozen_at: data.frozen_at || null,
  };
}

export function useElectionData() {
  const [data, setData] = useState({
    status: null, predictions: null, r1predictions: null,
    polymarket: null, polls: null, r2polls: null, antivoto: null,
    loading: true, error: null, lastUpdated: null
  });
  // Ref so the scheduling closure always reads the latest phase without re-registering the effect
  const latestPhaseRef = useRef(null);
  // Tracks wall-clock time of the last completed refresh (used by visibility handler)
  const lastRefreshAtRef = useRef(0);

  const refresh = useCallback(async () => {
    setData(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [status, predictions, r1predictions, polymarket, polls, r2polls, antivoto] = await Promise.all([
        safeFetch(`${API}/api/status`),
        safeFetch(`${API}/api/predictions`),
        safeFetch(`${API}/api/predictions?round=1`),
        safeFetch(`${API}/api/polymarket`),
        safeFetch(`${API}/api/polls`),
        safeFetch(`${API}/api/polls?round=2`),
        safeFetch(`${API}/api/antivoto?round=all`),
      ]);

      const normalized = normalizePredictions(predictions);
      const normalizedR1 = normalizePredictions(r1predictions);
      const anyFailed = [status, normalized, polymarket, polls].some(d => d === null);

      lastRefreshAtRef.current = Date.now();
      setData({
        status,
        predictions: normalized,
        r1predictions: normalizedR1,
        polymarket,
        polls,
        r2polls,
        antivoto,
        loading: false,
        error: anyFailed ? 'Algunos datos no están disponibles' : null,
        lastUpdated: new Date()
      });
    } catch (err) {
      setData(prev => ({
        ...prev,
        loading: false,
        error: 'Error de conexión: ' + (err.message || 'desconocido')
      }));
    }
  }, []);

  // Sync latestPhaseRef whenever the status changes
  useEffect(() => {
    if (data.status?.electoral_phase) {
      latestPhaseRef.current = data.status.electoral_phase;
    }
  }, [data.status]);

  // Phase-aware scheduled polling (handles tab-in-foreground case)
  useEffect(() => {
    refresh();
    let timerId;
    const scheduleNext = () => {
      const phase = latestPhaseRef.current;
      const ms = phase === 'election_day' ? 15 * 60 * 1000
               : phase === 'veda'         ? 30 * 60 * 1000
               : 60 * 60 * 1000;
      timerId = setTimeout(async () => { await refresh(); scheduleNext(); }, ms);
    };
    scheduleNext();
    return () => clearTimeout(timerId);
  }, [refresh]);

  // Page Visibility API — refresh when user returns to a backgrounded tab,
  // but only if enough time has passed (browsers throttle timers in background).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      const phase = latestPhaseRef.current;
      const intervalMs = phase === 'election_day' ? 15 * 60 * 1000
                       : phase === 'veda'         ? 30 * 60 * 1000
                       : 60 * 60 * 1000;
      if (Date.now() - lastRefreshAtRef.current >= intervalMs) {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refresh]);

  return { ...data, refresh };
}
