import { useState, useEffect } from 'react';
import { Clock, Timer, RefreshCw } from 'lucide-react';

const PHASE_STYLES = {
  pre_veda: { label: 'Pre-Veda', color: '#1E40AF', bg: '#EFF6FF', border: '1px solid #BFDBFE' },
  veda: { label: 'Veda Electoral', color: '#C2410C', bg: '#FFF7ED', border: '1px solid #FDBA74' },
  election_day: { label: 'Día de Elección', color: '#991B1B', bg: '#FEF2F2', border: '1px solid #FECACA' },
  post_election: { label: 'Post-Elección', color: '#78716C', bg: '#F0EDE8', border: '1px solid #E5E0D8' },
};

export default function Header({ status, predictions }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const limaTime = now.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  const phase = status?.electoral_phase || 'pre_veda';
  const ps = PHASE_STYLES[phase] || PHASE_STYLES.pre_veda;
  const alpha = status?.polymarket_weight;

  // Countdown hasta cierre de mesas segunda vuelta: 7 junio 2026 4pm Lima
  // 4pm Lima (UTC-5) = 9pm UTC = 2026-06-07T21:00:00Z
  const electionClose = new Date('2026-06-07T21:00:00Z');
  const diffMs = electionClose - now;
  const isPast = diffMs <= 0;
  const totalSecsLeft = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSecsLeft / 86400);
  const hours = Math.floor((totalSecsLeft % 86400) / 3600);
  const mins = Math.floor((totalSecsLeft % 3600) / 60);
  const secs = totalSecsLeft % 60;

  // Last updated indicator — thresholds scale with the phase update interval
  let updatedText = null;
  let updatedDotColor = '#6B7280';
  if (predictions?.generated_at_lima) {
    const genTime = new Date(predictions.generated_at_lima);
    const minsAgo = Math.floor((Date.now() - genTime) / 60000);
    // Green = within 1.2× expected interval; orange = within 2.5×; red = beyond
    const greenThresh  = phase === 'election_day' ? 18 : phase === 'veda' ? 36 : 72;
    const orangeThresh = phase === 'election_day' ? 38 : phase === 'veda' ? 75 : 150;
    updatedDotColor = minsAgo < greenThresh ? '#059669'
                    : minsAgo < orangeThresh ? '#D97706'
                    : '#DC2626';
    const intervalLabel = phase === 'election_day' ? '15 min' : phase === 'veda' ? '30 min' : '60 min';
    if (minsAgo < 1) updatedText = `Actualizado ahora · cada ${intervalLabel}`;
    else if (minsAgo < 60) updatedText = `Actualizado hace ${minsAgo} min · cada ${intervalLabel}`;
    else updatedText = `Actualizado hace ${Math.floor(minsAgo / 60)}h · cada ${intervalLabel}`;
  }

  return (
    <header style={{
      background: 'rgba(247, 244, 239, 0.95)',
      backdropFilter: 'blur(8px)',
      padding: '16px 20px', borderBottom: '1px solid #E5E0D8'
    }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'space-between', gap: '12px', maxWidth: '1200px', margin: '0 auto'
      }}>
        <div>
          <h1 style={{ color: '#1C1917', fontSize: '20px', fontWeight: 700, margin: 0 }}>
            Modelo Electoral Perú 2026
          </h1>
          <p style={{ color: '#6B6560', fontSize: '13px', margin: '2px 0 0' }}>
            Segunda vuelta {'\u00B7'} 7 junio 2026 {'\u00B7'} Keiko Fujimori vs Roberto Sánchez
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#6B6560', fontSize: '13px', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} style={{ color: '#8C877F' }} />
            {limaTime}
          </span>

          <span style={{
            background: ps.bg, color: ps.color, padding: '3px 10px',
            borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
            border: ps.border
          }}>{ps.label}</span>

          {isPast ? (
            <span style={{
              background: '#F0FDF4', color: '#15803D', padding: '3px 10px',
              borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
              border: '1px solid #86EFAC', display: 'flex', alignItems: 'center', gap: 4
            }}>
              <Timer size={12} />
              Mesas cerradas
            </span>
          ) : (
            <span style={{
              color: '#1C1917', fontVariantNumeric: 'tabular-nums',
              fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
            }}>
              <Timer size={12} style={{ color: '#8C877F' }} />
              {days > 0 && `${days}d `}{String(hours).padStart(2, '0')}h {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s
            </span>
          )}

          {alpha !== null && alpha !== undefined && (
            <span style={{
              background: '#EFF6FF', color: '#1E40AF', padding: '3px 10px',
              borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
              border: '1px solid #BFDBFE'
            }}>{'\u03B1'} {(alpha * 100).toFixed(1)}%</span>
          )}

          {updatedText && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              color: '#8C877F', fontSize: '11px'
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: updatedDotColor,
                display: 'inline-block',
                boxShadow: updatedDotColor === '#059669' ? `0 0 6px ${updatedDotColor}` : 'none'
              }} />
              <RefreshCw size={10} style={{ color: '#8C877F' }} />
              {updatedText}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
