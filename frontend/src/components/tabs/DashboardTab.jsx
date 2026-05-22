import { useState, useEffect } from 'react';
import { getPartyColor } from '../../config/partyColors';
import { Activity, TrendingUp, X, ExternalLink, Loader2, AlertTriangle, ShieldAlert, ChevronDown } from 'lucide-react';
import WinProbabilityNeedle from '../WinProbabilityNeedle';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const API = import.meta.env.VITE_API_URL || '';

const ABBREV = {
  'Rafael López Aliaga': 'RLA', 'Keiko Fujimori': 'KF',
  'Carlos Álvarez': 'CA', 'López Chau': 'ALC',
  'Roberto Sánchez Palomino': 'RSP', 'Jorge Nieto': 'JN',
  'Wolfgang Grozo': 'WG', 'César Acuña': 'CAc',
  'Ricardo Belmont': 'RB', 'Marisol Pérez Tello': 'MPT',
  'Carlos Espá': 'CE', 'Yonhy Lescano': 'YL', 'Mario Vizcarra': 'MV', 'George Forsyth': 'GF',
  'Fernando Olivera': 'FO', 'Charlie Carrasco': 'CC', 'José Luna': 'JL', 'Herbert Caller': 'HC',
};
function abbrev(name) { return ABBREV[name] || name.split(' ').map(w => w[0]).join(''); }

// ─── Compact Candidate Row (R1 only) ────────────────────────
function CompactRow({ c, maxMean }) {
  const party = getPartyColor(c.candidate);
  const barW = Math.min(100, (c.mean / (maxMean || 30)) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #E5E0D8' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, background: party.bg, color: party.text,
        border: `2px solid ${party.primary}`, fontWeight: 600, fontSize: 11
      }}>
        {c.candidate.split(' ').map(w => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#1C1917', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.candidate}</div>
        <div style={{ color: '#78716C', fontSize: 11 }}>{party.party}</div>
        <div style={{ marginTop: 4, height: 8, borderRadius: 4, background: '#F0EDE8' }}>
          <div style={{ width: `${barW}%`, height: '100%', background: party.primary, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ color: party.primary, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{c.mean.toFixed(1)}%</div>
        <div style={{ color: '#A8A29E', fontSize: 11 }}>% v.v.</div>
        <div style={{ color: '#8C877F', fontSize: 11, marginTop: 2 }}>P(Ganar)</div>
        <div style={{ color: party.primary, fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{c.prob_win.toFixed(1)}%</div>
      </div>
    </div>
  );
}

// ─── R2 Candidates Head-to-Head ─────────────────────────────
function CandidatesHeadToHead({ keiko, sanchez }) {
  if (!keiko || !sanchez) return null;
  const kParty = getPartyColor('Keiko Fujimori');
  const rParty = getPartyColor('Roberto Sánchez Palomino');
  const total = keiko.mean + sanchez.mean;
  const sides = [
    { c: keiko,  party: kParty, align: 'left'  },
    { c: sanchez, party: rParty, align: 'right' },
  ];
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 20 }}>
      <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 20px' }}>Candidatos</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {sides.map(({ c, party, align }) => (
          <div key={c.candidate} style={{ textAlign: align }}>
            <div style={{ color: party.primary, fontSize: 12, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>
              {c.candidate}
            </div>
            <div style={{ color: party.primary, fontSize: 38, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {c.mean.toFixed(1)}%
            </div>
            <div style={{ color: '#A8A29E', fontSize: 10, margin: '3px 0 16px' }}>% votos válidos</div>
            <div style={{ color: party.primary, fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {c.prob_win.toFixed(1)}%
            </div>
            <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 2 }}>P(Ganar)</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${(keiko.mean / total) * 100}%`, background: kParty.primary, transition: 'width 0.8s ease' }} />
        <div style={{ flex: 1, background: rParty.primary }} />
      </div>
    </div>
  );
}

// ─── Model Trend Chart ───────────────────────────────────────
function ModelTrendChart({ isR2 }) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    const load = () =>
      fetch(`${API}/api/model-history`).then(r => r.json()).then(setHistory).catch(() => {});
    load();
    const iv = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  if (!history?.history?.length) return null;

  const runs = [...history.history].reverse().slice(-24);
  const labels = runs.map(r => {
    const d = new Date(r.generated_at_lima);
    return d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
  });

  let datasets;
  if (isR2) {
    const kColor = getPartyColor('Keiko Fujimori').primary;
    const rColor = getPartyColor('Roberto Sánchez Palomino').primary;
    datasets = [
      {
        label: 'Keiko Fujimori',
        data: runs.map(r => r.top3.find(c => c.candidate.includes('Keiko') || c.candidate.includes('Fujimori'))?.pct_mean ?? null),
        borderColor: kColor, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, spanGaps: true,
      },
      {
        label: 'Roberto Sánchez',
        data: runs.map(r => r.top3.find(c => c.candidate.includes('Sánchez') || c.candidate.includes('Roberto'))?.pct_mean ?? null),
        borderColor: rColor, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, spanGaps: true,
      },
    ];
  } else {
    const candNames = [...new Set(runs.flatMap(r => r.top3.map(c => c.candidate)))];
    datasets = candNames.slice(0, 5).map(name => {
      const color = getPartyColor(name);
      return {
        label: abbrev(name),
        data: runs.map(r => r.top3.find(c => c.candidate === name)?.pct_mean ?? null),
        borderColor: color.primary, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, spanGaps: true,
      };
    });
  }

  // 50% reference dashed line
  datasets.push({
    label: '_ref50',
    data: runs.map(() => 50),
    borderColor: '#C9C4BB',
    borderWidth: 1,
    borderDash: [4, 4],
    pointRadius: 0,
    tension: 0,
  });

  const allVals = datasets.filter(d => d.label !== '_ref50').flatMap(d => d.data).filter(v => v != null);
  const yMin = allVals.length ? Math.max(0,   Math.floor(Math.min(...allVals)) - 3) : 35;
  const yMax = allVals.length ? Math.min(100, Math.ceil(Math.max(...allVals))  + 3) : 65;

  const chartData = { labels, datasets };
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#78716C', usePointStyle: true, font: { size: 11 },
          filter: item => !item.text.startsWith('_'),
        },
      },
      tooltip: {
        backgroundColor: '#FFFFFF', titleColor: '#1C1917', bodyColor: '#78716C',
        borderColor: '#E5E0D8', borderWidth: 1,
        filter: item => !item.dataset.label.startsWith('_'),
        callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%` },
      },
    },
    scales: {
      x: {
        grid: { color: '#E5E0D854' },
        ticks: { color: '#8C877F', font: { size: 11 }, maxRotation: 0, maxTicksLimit: 8 },
      },
      y: {
        min: yMin, max: yMax,
        grid: { color: '#E5E0D854' },
        ticks: { color: '#8C877F', callback: v => v + '%', font: { size: 11 } },
      },
    },
    animation: { duration: 400 },
  };

  const latest = history.history[0];
  const minsAgo = Math.floor((Date.now() - new Date(latest.generated_at_lima)) / 60000);
  const dotColor = minsAgo < 35 ? '#059669' : minsAgo < 90 ? '#D97706' : '#DC2626';

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} style={{ color: '#8C877F' }} />
          <span style={{ color: '#1C1917', fontSize: 14, fontWeight: 600 }}>Evolución del pronóstico</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#8C877F', fontSize: 11 }}>
            {minsAgo < 60 ? `hace ${minsAgo} min` : `hace ${Math.round(minsAgo / 60)}h`}
          </span>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: dotColor,
            display: 'inline-block', boxShadow: minsAgo < 35 ? `0 0 6px ${dotColor}` : 'none',
          }} />
        </div>
      </div>
      <div style={{ height: 160 }}>
        <Line data={chartData} options={chartOpts} />
      </div>
    </div>
  );
}

// ─── Polymarket Card ─────────────────────────────────────────
function PolymarketCard({ polymarket, predictions, onOpenSignals }) {
  const modelMap = {};
  for (const c of (predictions?.candidates || [])) modelMap[c.candidate] = c.prob_win;
  const pmTop = (polymarket?.candidates || []).slice(0, 5);

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TrendingUp size={14} style={{ color: '#1D4ED8' }} />
        <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: 0 }}>Monitor Polymarket</h3>
      </div>
      <div style={{ color: '#78716C', fontSize: 12, marginBottom: 12 }}>
        Volumen: ${polymarket?.volume_usd ? (polymarket.volume_usd / 1e6).toFixed(1) + 'M' : '--'}
      </div>
      <div style={{ flex: 1 }}>
        {pmTop.map(c => {
          const party = getPartyColor(c.candidate);
          const modelProb = modelMap[c.candidate];
          const delta = modelProb != null ? c.probability - modelProb : null;
          return (
            <div key={c.candidate} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid #E5E0D8',
            }}>
              <span style={{ color: party.primary, fontWeight: 500, fontSize: 13 }}>{c.candidate}</span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ color: '#1C1917', fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{c.probability.toFixed(1)}%</span>
                {delta !== null && (
                  <span style={{
                    color: delta > 0 ? '#059669' : delta < 0 ? '#DC2626' : '#A8A29E',
                    fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 50, textAlign: 'right',
                  }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ color: '#8C877F', fontSize: 11, marginTop: 8, marginBottom: 12 }}>
        PM = P(ganar) en mercado · Δ vs P(ganar) del modelo
      </div>
      <button
        onClick={onOpenSignals}
        style={{
          background: 'transparent', border: '1px solid #E5E0D8', borderRadius: 8,
          color: '#1D4ED8', fontSize: 12, padding: '10px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontWeight: 500, transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#C9C4BB'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E0D8'}
      >
        Ver señales en Polymarket <ExternalLink size={11} />
      </button>
    </div>
  );
}

// ─── Polymarket Modal ────────────────────────────────────────
function PolymarketModal({ polymarket, onClose }) {
  const [history, setHistory] = useState(null);
  const candidates = polymarket?.candidates || [];

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    fetch(`${API}/api/polymarket/history`).then(r => r.json()).then(setHistory).catch(() => {});
  }, []);

  const TOP_CANDIDATES = (polymarket?.candidates || [])
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5)
    .map(c => c.candidate);

  let chartData = { labels: [], datasets: [] };
  if (history?.snapshots?.length > 1) {
    const snapshots = history.snapshots;
    const labels = snapshots.map(s => {
      const d = new Date(s.time);
      return d.toLocaleString('es-PE', { timeZone: 'America/Lima', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    });
    chartData = {
      labels,
      datasets: TOP_CANDIDATES.map(name => {
        const color = getPartyColor(name);
        return {
          label: abbrev(name),
          data: snapshots.map(s => s.candidates[name] ?? null),
          borderColor: color.primary,
          backgroundColor: 'transparent',
          borderWidth: 2, pointRadius: 2, tension: 0.4, spanGaps: true,
        };
      }),
    };
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#78716C', usePointStyle: true, font: { size: 11 } } },
      tooltip: {
        backgroundColor: '#FFFFFF', titleColor: '#1C1917', bodyColor: '#78716C',
        borderColor: '#E5E0D8', borderWidth: 1,
        callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%` },
      },
    },
    scales: {
      x: { grid: { color: '#E5E0D8' }, ticks: { color: '#8C877F', font: { size: 11 }, maxRotation: 45, maxTicksLimit: 10 } },
      y: { min: 0, grid: { color: '#E5E0D8' }, ticks: { color: '#8C877F', callback: v => v + '%', font: { size: 11 } } },
    },
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pm-modal-title" style={{
        width: 'min(640px, 92vw)', maxHeight: '85vh', overflowY: 'auto',
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 16, padding: 24, position: 'relative',
      }}>
        <button onClick={onClose} aria-label="Cerrar modal" style={{
          position: 'absolute', top: 12, right: 12, background: 'transparent',
          border: 'none', color: '#8C877F', cursor: 'pointer',
        }}><X size={20} /></button>

        <h3 id="pm-modal-title" style={{ color: '#1C1917', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Señales de Polymarket</h3>
        <p style={{ color: '#78716C', fontSize: 13, margin: '0 0 16px' }}>
          Mercado de predicciones · ${polymarket?.volume_usd ? (polymarket.volume_usd / 1e6).toFixed(1) + 'M en apuestas reales' : ''}
          {history?.snapshots && <span> · {history.snapshots.length} snapshots</span>}
        </p>

        <div style={{ height: 200, marginBottom: 20 }}>
          {history?.snapshots?.length > 1
            ? <Line data={chartData} options={chartOpts} />
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8C877F', fontSize: 13 }}>
                {history === null ? 'Cargando historial...' : 'Se necesitan más snapshots para el gráfico (próximas horas)'}
              </div>
          }
        </div>

        <div style={{ fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 4, padding: '6px 0', borderBottom: '1px solid #E5E0D8' }}>
            <span style={{ color: '#78716C', fontWeight: 500 }}>Candidato</span>
            <span style={{ color: '#78716C', fontWeight: 500, textAlign: 'right' }}>Prob</span>
          </div>
          {candidates.slice(0, 15).map((c, i) => {
            const party = getPartyColor(c.candidate);
            return (
              <div key={c.candidate} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px', gap: 4, padding: '5px 0',
                borderBottom: '1px solid #E5E0D8', background: i % 2 ? '#F7F4EF' : 'transparent',
              }}>
                <span style={{ color: party.primary, fontWeight: 500 }}>{c.candidate}</span>
                <span style={{ color: '#1C1917', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.probability.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Risk Scenarios ──────────────────────────────────────────
function RiskScenarios({ risk, candidates }) {
  if (!risk) return null;
  const isR2 = (candidates?.length ?? 0) <= 2;

  const blankPct = risk.expected_blank_null;
  const r2Cards = isR2 ? [
    {
      question: '¿Puede haber un empate técnico?',
      value: risk.p_close_race,
      context: 'En 2016 y 2021, Keiko perdió por menos de 45,000 votos. Un margen menor a 5pp entra en zona de alta incertidumbre donde el voto blanco y la movilización pueden decidir el resultado.',
      color: risk.p_close_race > 40 ? '#D97706' : '#059669',
      bg: risk.p_close_race > 40 ? '#FFFBEB' : '#F0FDF4',
    },
    {
      question: '¿Cuántos votos podrían anularse?',
      value: blankPct,
      context: `Estimado a partir del rechazo a ambos candidatos. El histórico de segunda vuelta 2016 y 2021 fue de 2–4%. Valores por encima de eso indicarían un rechazo activo inusualmente alto.`,
      color: blankPct > 6 ? '#D97706' : '#78716C',
      bg: blankPct > 6 ? '#FFFBEB' : '#FAFAF9',
    },
    {
      question: '¿Y si las encuestas subestiman a Sánchez?',
      value: risk.bias_5pts_sanchez_win,
      context: 'En 2021, las encuestas subestimaron a Castillo en aproximadamente 6pp. Si ese patrón se repitiera, la probabilidad de Sánchez cambiaría significativamente.',
      color: risk.bias_5pts_sanchez_win > 70 ? '#D97706' : '#78716C',
      bg: '#FAFAF9',
    },
  ] : [];

  const r1Cards = !isR2 ? [
    {
      label: '¿Y si el top-2 no es el esperado?',
      value: risk.top2_not_expected,
      desc: 'Probabilidad de que los dos candidatos que pasen a segunda vuelta no sean los dos favoritos actuales.',
      color: risk.top2_not_expected > 30 ? '#D97706' : '#1D4ED8',
      bg: risk.top2_not_expected > 30 ? '#FFFBEB' : '#EFF6FF',
    },
    {
      label: '¿Puede haber un ganador sorpresa?',
      value: risk.surprise_winner,
      desc: 'Probabilidad de que el ganador de la primera vuelta no sea ninguno de los tres favoritos.',
      color: risk.surprise_winner > 10 ? '#DC2626' : '#78716C',
      bg: risk.surprise_winner > 10 ? '#FEF2F2' : '#FFFFFF',
    },
    {
      label: '¿Resultado muy reñido?',
      value: risk.p_close_race,
      desc: 'Probabilidad de que la diferencia entre ambos finalistas sea menor a 5 puntos en segunda vuelta.',
      color: '#78716C',
      bg: '#FFFFFF',
    },
  ] : [];

  const activeCards = isR2 ? r2Cards : r1Cards;

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ShieldAlert size={16} style={{ color: '#D97706' }} />
        <h3 style={{ color: '#1C1917', fontSize: 16, fontWeight: 600, margin: 0 }}>Escenarios de riesgo</h3>
      </div>
      <p style={{ color: '#78716C', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
        {isR2
          ? '¿Qué tan probable es que el modelo se equivoque? Escenarios calculados en 10,000 simulaciones + análisis estadístico.'
          : '¿Qué tan probable es que el modelo se equivoque? Calculado en cada corrida de 10,000 simulaciones.'}
      </p>
      <div className="risk-cards" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {activeCards.map((r, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 220, background: r.bg, border: `1px solid ${r.color}33`,
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ color: '#78716C', fontSize: 12, fontWeight: 500, marginBottom: 8, lineHeight: 1.4 }}>
              {r.question || r.label}
            </div>
            <div style={{ color: r.color, fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {r.value != null ? `${r.value}%` : '—'}
            </div>
            <div style={{ color: '#8C877F', fontSize: 12, marginTop: 10, lineHeight: 1.6, borderTop: `1px solid ${r.color}22`, paddingTop: 10 }}>
              {r.context || r.desc}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 16, padding: '10px 12px', background: '#FFFBEB', borderRadius: 8,
        border: '1px solid #FDE68A', display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={14} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
        <span style={{ color: '#78716C', fontSize: 12, lineHeight: 1.5 }}>
          {isR2
            ? 'Estos porcentajes se actualizan cada 30 minutos. En 2016 y 2021, Keiko perdió la segunda vuelta por menos de 45 mil votos. El antivoto y el voto rural son los factores con mayor incertidumbre en el modelo.'
            : 'Estos porcentajes se actualizan cada 30 minutos. En Perú, 3 de las últimas 4 elecciones tuvieron sorpresas significativas en las últimas semanas. La incertidumbre es parte del proceso.'}
        </span>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────
export default function DashboardTab({ predictions, polymarket, polls, status }) {
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  if (!predictions?.candidates?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={24} style={{ color: '#1D4ED8', animation: 'spin 1s linear infinite', marginBottom: 12 }} />
        <div style={{ color: '#78716C', fontSize: 14 }}>
          El modelo está inicializando. Los datos estarán disponibles en los próximos minutos.
        </div>
      </div>
    );
  }

  const sorted = [...predictions.candidates].sort((a, b) => b.mean - a.mean);
  const maxMean = sorted[0]?.mean || 30;
  const top    = sorted[0];
  const second = sorted[1];
  const topParty    = getPartyColor(top.candidate);
  const secondParty = getPartyColor(second.candidate);

  const isR2 = (predictions.candidates?.length ?? 0) <= 2;
  const keiko      = isR2 ? predictions.candidates.find(c => c.candidate?.includes('Keiko') || c.candidate?.includes('Fujimori')) : null;
  const sanchezCand = isR2 ? predictions.candidates.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto')) : null;

  const runoff = predictions.runoff_scenarios?.[0];
  const blankPct = predictions.risk_scenarios?.expected_blank_null ?? runoff?.avg_blank_pct;
  let runoffC1 = null, runoffC2 = null, runoffC1Party = null, runoffC2Party = null;
  if (runoff) {
    const winKeys = Object.keys(runoff.wins);
    runoffC1 = winKeys[0]; runoffC2 = winKeys[1];
    runoffC1Party = getPartyColor(runoffC1); runoffC2Party = getPartyColor(runoffC2);
  }

  // Dynamic headline
  let headlineText = '';
  if (isR2 && keiko && sanchezCand) {
    const margin = Math.abs(keiko.prob_win - sanchezCand.prob_win);
    const leader = keiko.prob_win >= sanchezCand.prob_win ? keiko : sanchezCand;
    const leaderName = leader.candidate.split(' ').pop();
    if (margin < 15) {
      headlineText = `Carrera reñida: diferencia de ${margin.toFixed(0)}pp entre ambos candidatos`;
    } else if (leader.prob_win >= 60) {
      headlineText = `${leaderName} lidera con ${leader.prob_win.toFixed(0)}% de probabilidad de ganar`;
    } else {
      headlineText = `${leaderName} proyecta ventaja — ${leader.prob_win.toFixed(0)}% de P(Ganar) según el modelo`;
    }
  } else if (!isR2 && top) {
    headlineText = `${top.candidate.split(' ').pop()} favorito con ${top.prob_win.toFixed(0)}% de P(Ganar)`;
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {headlineText && (
          <h2 style={{ color: '#1C1917', fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {headlineText}
          </h2>
        )}

        {/* Hero: Needle (R2) o KPI cards (R1) */}
        {isR2 ? (
          <WinProbabilityNeedle keiko={keiko} sanchez={sanchezCand} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
              <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>Favorito · P(Ganar)</div>
              <div style={{ color: topParty.primary, fontSize: 32, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{top.prob_win.toFixed(1)}%</div>
              <div style={{ color: '#1C1917', fontSize: 13, marginTop: 2 }}>{top.candidate}</div>
              <div style={{ color: '#78716C', fontSize: 11 }}>{topParty.party}</div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
              <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>Segundo · P(Ganar)</div>
              <div style={{ color: secondParty.primary, fontSize: 32, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{second.prob_win.toFixed(1)}%</div>
              <div style={{ color: '#1C1917', fontSize: 13, marginTop: 2 }}>{second.candidate}</div>
              <div style={{ color: '#78716C', fontSize: 11 }}>{secondParty.party}</div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
              <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>2da vuelta más probable</div>
              {runoff && runoffC1 && runoffC2 ? (
                <>
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8, marginBottom: 6 }}>
                    <div style={{ width: `${runoff.wins[runoffC1]}%`, background: runoffC1Party.primary, height: '100%' }} />
                    <div style={{ width: `${runoff.wins[runoffC2]}%`, background: runoffC2Party.primary, height: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: '#1C1917' }}>{abbrev(runoffC1)} {runoff.wins[runoffC1].toFixed(0)}%</span>
                    <span style={{ color: '#1C1917' }}>{abbrev(runoffC2)} {runoff.wins[runoffC2].toFixed(0)}%</span>
                  </div>
                  <div style={{ color: '#78716C', fontSize: 11, marginTop: 4 }}>{runoff.frequency}% de simulaciones</div>
                </>
              ) : (
                <div style={{ color: '#1C1917', fontSize: 16, fontWeight: 600, marginTop: 4 }}>---</div>
              )}
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
              <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>Voto blanco esperado</div>
              <div style={{ color: '#1C1917', fontSize: 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{blankPct ? `~${blankPct.toFixed(0)}%` : '---'}</div>
              {runoff && <div style={{ color: '#78716C', fontSize: 11, marginTop: 2 }}>En {runoff.pair.split(' vs ').map(n => n.split(' ').pop()).join(' vs ')}</div>}
            </div>
          </div>
        )}

        {/* Trend chart — full width */}
        <ModelTrendChart isR2={isR2} />

        {/* Separator */}
        <div style={{ borderTop: '1px solid #E5E0D8', marginTop: 4 }} />

        {/* 2-col: Candidatos | Polymarket */}
        <div className="dashboard-2col" style={{
          display: 'grid',
          gridTemplateColumns: isR2 ? '1fr 1.4fr' : '1.2fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}>
          {isR2 ? (
            <CandidatesHeadToHead keiko={keiko} sanchez={sanchezCand} />
          ) : (
            <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
              <h3 style={{ color: '#1C1917', fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>Candidatos</h3>
              {sorted.slice(0, 10).map(c => <CompactRow key={c.candidate} c={c} maxMean={maxMean} />)}
              {sorted.length > 10 && (
                <>
                  {showAllCandidates && sorted.slice(10).map(c => <CompactRow key={c.candidate} c={c} maxMean={maxMean} />)}
                  <button
                    onClick={() => setShowAllCandidates(!showAllCandidates)}
                    style={{
                      width: '100%', padding: '10px 0', marginTop: 4,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      color: '#78716C', fontSize: 12, minHeight: 44,
                    }}
                  >
                    <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: showAllCandidates ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    {showAllCandidates ? 'Ver menos' : `Ver ${sorted.length - 10} candidatos más`}
                  </button>
                </>
              )}
            </div>
          )}
          <PolymarketCard
            polymarket={polymarket}
            predictions={predictions}
            onOpenSignals={() => setPmModalOpen(true)}
          />
        </div>

        {/* Risk Scenarios */}
        <RiskScenarios risk={predictions.risk_scenarios} candidates={predictions.candidates} />
      </div>

      <style>{`
        @media (max-width: 768px) {
          .dashboard-2col { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .risk-cards { flex-direction: column !important; }
          .risk-cards > div { min-width: unset !important; }
        }
      `}</style>

      {pmModalOpen && <PolymarketModal polymarket={polymarket} onClose={() => setPmModalOpen(false)} />}
    </>
  );
}
