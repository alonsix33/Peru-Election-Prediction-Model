import { useMemo } from 'react';
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

export default function ElectionNightEvolutionChart({ history }) {
  const { labels, datasets } = useMemo(() => {
    if (!history?.length) return { labels: [], datasets: [] };

    const sorted = [...history].sort((a, b) => (a.pct_actas ?? 0) - (b.pct_actas ?? 0));

    const labels   = sorted.map(h => `${(h.pct_actas ?? 0).toFixed(1)}%`);
    const obsKf    = sorted.map(h => h.obs_kf_r2_share  != null ? +h.obs_kf_r2_share.toFixed(2)          : null);
    const obsRsp   = sorted.map(h => h.obs_kf_r2_share  != null ? +(100 - h.obs_kf_r2_share).toFixed(2)  : null);
    const projKf   = sorted.map(h => h.proj_kf_r2_share != null ? +h.proj_kf_r2_share.toFixed(2)         : null);
    const projRsp  = sorted.map(h => h.proj_kf_r2_share != null ? +(100 - h.proj_kf_r2_share).toFixed(2) : null);

    return {
      labels,
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
  }, [history]);

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

  const allVals = history.flatMap(h => [
    h.obs_kf_r2_share,
    h.obs_kf_r2_share  != null ? 100 - h.obs_kf_r2_share  : null,
    h.proj_kf_r2_share,
    h.proj_kf_r2_share != null ? 100 - h.proj_kf_r2_share : null,
  ]).filter(v => v != null);

  const yMin = Math.max(0,   Math.floor(Math.min(...allVals) - 3));
  const yMax = Math.min(100, Math.ceil (Math.max(...allVals) + 3));

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#78716C',
          padding: 12,
          usePointStyle: true,
          pointStyleWidth: 10,
          font: { size: 11 },
          filter: item => !item.text.startsWith('_'),
        },
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1C1917',
        bodyColor: '#78716C',
        borderColor: '#E5E0D8',
        borderWidth: 1,
        callbacks: {
          title: ctx => `${ctx[0]?.label} actas`,
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
          text: '% actas procesadas',
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
          callback: v => `${v}%`,
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
      <div style={{
        color: '#8C877F', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 12,
      }}>
        Evolución del conteo · Observado vs Proyectado
      </div>
      <div style={{ height: 260 }}>
        <Line data={{ labels, datasets }} options={options} />
      </div>
    </div>
  );
}
