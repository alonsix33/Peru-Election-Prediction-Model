import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const KF_COLOR  = '#F97316';
const RSP_COLOR = '#16A34A';

const TIME_WINDOWS = [
  { label: 'Todo', value: null },
  { label: '10h',  value: 10   },
  { label: '5h',   value: 5    },
  { label: '3h',   value: 3    },
  { label: '1h',   value: 1    },
];

export default function ElectionNightEvolutionChart({ history }) {
  const [timeWindow, setTimeWindow] = useState(null);

  const filtered = useMemo(() => {
    if (!history?.length) return history;
    if (timeWindow == null) return history;
    const times  = history.map(h => h.time ? new Date(h.time).getTime() : 0);
    const latest = Math.max(...times);
    const cutoff = latest - timeWindow * 60 * 60 * 1000;
    return history.filter(h => h.time && new Date(h.time).getTime() >= cutoff);
  }, [history, timeWindow]);

  const { labels, datasets, sorted } = useMemo(() => {
    if (!filtered?.length) return { labels: [], datasets: [], sorted: [] };

    const sorted = [...filtered].sort((a, b) => (a.pct_actas ?? 0) - (b.pct_actas ?? 0));

    const labels = sorted.map(h => {
      if (timeWindow != null && h.time) {
        // Show Lima time (UTC-5) on x-axis when a time window is active
        const d = new Date(new Date(h.time).getTime() - 5 * 60 * 60 * 1000);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      }
      return `${(h.pct_actas ?? 0).toFixed(1)}%`;
    });
    const obsKf    = sorted.map(h => h.obs_kf_r2_share  != null ? +h.obs_kf_r2_share.toFixed(2)          : null);
    const obsRsp   = sorted.map(h => h.obs_kf_r2_share  != null ? +(100 - h.obs_kf_r2_share).toFixed(2)  : null);
    const projKf   = sorted.map(h => h.proj_kf_r2_share != null ? +h.proj_kf_r2_share.toFixed(2)         : null);
    const projRsp  = sorted.map(h => h.proj_kf_r2_share != null ? +(100 - h.proj_kf_r2_share).toFixed(2) : null);

    return {
      labels,
      sorted,
      datasets: [
        // Observed (solid)
        {
          label: 'KF observado',
          data: obsKf,
          borderColor: KF_COLOR,
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: KF_COLOR,
          tension: 0.3,
          spanGaps: true,
          fill: false,
          order: 1,
        },
        {
          label: 'RSP observado',
          data: obsRsp,
          borderColor: RSP_COLOR,
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: RSP_COLOR,
          tension: 0.3,
          spanGaps: true,
          fill: false,
          order: 1,
        },
        // Projected (dotted)
        {
          label: 'KF proyectado',
          data: projKf,
          borderColor: KF_COLOR,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 2,
          pointBackgroundColor: KF_COLOR,
          tension: 0.3,
          spanGaps: true,
          fill: false,
          order: 2,
        },
        {
          label: 'RSP proyectado',
          data: projRsp,
          borderColor: RSP_COLOR,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 2,
          pointBackgroundColor: RSP_COLOR,
          tension: 0.3,
          spanGaps: true,
          fill: false,
          order: 2,
        },
      ],
    };
  }, [filtered, timeWindow]);

  if (!history?.length) {
    return (
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 14,
        padding: '20px 16px', textAlign: 'center', color: '#78716C', fontSize: 13,
      }}>
        Esperando primeros resultados ONPE...
      </div>
    );
  }

  const allVals = (filtered ?? []).flatMap(h => [
    h.obs_kf_r2_share,
    h.obs_kf_r2_share  != null ? 100 - h.obs_kf_r2_share  : null,
    h.proj_kf_r2_share,
    h.proj_kf_r2_share != null ? 100 - h.proj_kf_r2_share : null,
  ]).filter(v => v != null);

  const dataMin   = Math.min(...allVals);
  const dataMax   = Math.max(...allVals);
  const padding   = Math.max(0.05, (dataMax - dataMin) * 0.2);
  const yMin = Math.max(0,   Math.floor((dataMin - padding) * 100) / 100);
  const yMax = Math.min(100, Math.ceil ((dataMax + padding) * 100) / 100);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#78716C',
          padding: 16,
          font: { size: 11 },
          generateLabels: (chart) =>
            chart.data.datasets
              .filter(ds => !ds.label.startsWith('_'))
              .map((ds, rawIdx) => {
                const i = chart.data.datasets.indexOf(ds);
                return {
                  text:        ds.label,
                  strokeStyle: ds.borderColor,
                  fillStyle:   'transparent',
                  lineWidth:   ds.borderWidth ?? 2,
                  lineDash:    ds.borderDash  ?? [],
                  hidden:      !chart.isDatasetVisible(i),
                  datasetIndex: i,
                  pointStyle:  'line',
                };
              }),
        },
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1C1917',
        bodyColor: '#78716C',
        borderColor: '#E5E0D8',
        borderWidth: 1,
        callbacks: {
          title: ctx => {
            if (timeWindow != null && sorted?.length) {
              const h = sorted[ctx[0]?.dataIndex];
              return `${ctx[0]?.label} · ${(h?.pct_actas ?? 0).toFixed(1)}% actas`;
            }
            return `${ctx[0]?.label} actas`;
          },
          label: ctx => {
            if (ctx.dataset.label.startsWith('_')) return null;
            return `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}%`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#F5F0EB' },
        ticks: { color: '#78716C', font: { size: 11 }, maxTicksLimit: 8 },
        title: {
          display: true,
          text: timeWindow != null ? 'Hora Lima' : '% actas procesadas',
          color: '#78716C',
          font: { size: 11 },
        },
      },
      y: {
        min: yMin,
        max: yMax,
        grid: { color: '#F5F0EB' },
        ticks: {
          color: '#78716C',
          font: { size: 11 },
          callback: v => `${(+v.toFixed(2))}%`,
        },
        title: {
          display: true,
          text: '% votos válidos',
          color: '#78716C',
          font: { size: 11 },
        },
      },
    },
  };

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5E0D8',
      borderRadius: 14,
      padding: '20px 16px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          color: '#8C877F', fontSize: 11,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Evolución del conteo · Observado vs Proyectado
        </div>
        <div style={{ display: 'flex', background: '#F7F4EF', borderRadius: 8, padding: 3, gap: 2 }}>
          {TIME_WINDOWS.map(({ label, value }) => {
            const active = timeWindow === value;
            return (
              <button
                key={label}
                onClick={() => setTimeWindow(value)}
                style={{
                  background: active ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  color: active ? '#1C1917' : '#78716C',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ height: 260 }}>
        <Line data={{ labels, datasets }} options={options} />
      </div>
    </div>
  );
}
