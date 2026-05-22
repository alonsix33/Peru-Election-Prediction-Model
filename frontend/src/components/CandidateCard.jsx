import { ChevronDown } from 'lucide-react';
import { getPartyColor } from '../config/partyColors';
import TermTooltip from './TermTooltip';

function getInitials(name) {
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function winColor(prob) {
  if (prob >= 50) return '#059669';
  if (prob >= 10) return '#D97706';
  return '#8C877F';
}

export default function CandidateCard({ candidate: c, rank, expanded, onToggle, maxMean = 30 }) {
  const party = getPartyColor(c.candidate);
  const barWidth = Math.min(100, (c.mean / maxMean) * 100);
  const p10Width = Math.min(100, (c.p10 / maxMean) * 100);
  const p90Width = Math.min(100, (c.p90 / maxMean) * 100);

  return (
    <div
      onClick={onToggle}
      tabIndex={0}
      role="button"
      aria-expanded={expanded}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#C9C4BB'; }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#E5E0D8';
        e.currentTarget.style.borderLeftColor = party.primary;
      }}
      style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: '12px',
        padding: '16px', cursor: 'pointer', borderLeft: `3px solid ${party.primary}`,
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          background: party.bg, color: party.text, border: `2px solid ${party.primary}`,
          fontWeight: 600, fontSize: '14px'
        }}>
          {getInitials(c.candidate)}
        </div>

        {/* Name + Party + Progress bar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#1C1917', fontWeight: 600, fontSize: '15px' }}>
            {rank && <span style={{ color: '#8C877F', fontWeight: 400, marginRight: 6 }}>#{rank}</span>}
            {c.candidate}
          </div>
          <div style={{ color: '#78716C', fontSize: '12px' }}>{party.party}</div>

          {/* Progress bar */}
          <div style={{
            marginTop: 8, height: 10, borderRadius: 5, background: '#F0EDE8',
            position: 'relative', overflow: 'hidden'
          }}>
            {/* IC 90% range */}
            <div style={{
              position: 'absolute', left: `${p10Width}%`, width: `${p90Width - p10Width}%`,
              height: '100%', background: party.primary, opacity: 0.2, borderRadius: 5
            }} />
            {/* Mean bar */}
            <div style={{
              width: `${barWidth}%`, height: '100%', background: party.primary,
              borderRadius: 5, position: 'relative', zIndex: 1
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#78716C', marginTop: 2 }}>
            IC 90%<TermTooltip term="IC_90" />: {c.p10.toFixed(1)}% - {c.p90.toFixed(1)}%
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', flexShrink: 0, textAlign: 'center', minWidth: 200 }}>
          <div>
            <div style={{ color: '#78716C', fontWeight: 500, fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>
              {c.mean.toFixed(1)}%
            </div>
            <div style={{ color: '#A8A29E', fontSize: '11px' }}>1ra vuelta</div>
          </div>
          <div>
            <div style={{ color: '#78716C', fontWeight: 500, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
              {c.prob_runoff.toFixed(0)}%
            </div>
            <div style={{ color: '#A8A29E', fontSize: '11px' }}>P(2da)</div>
          </div>
          <div>
            <div style={{
              color: winColor(c.prob_win), fontWeight: 700, fontSize: '22px',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.1
            }}>
              {c.prob_win.toFixed(1)}%
            </div>
            <div style={{ color: '#78716C', fontSize: '11px', fontWeight: 500 }}>P(Ganar)<TermTooltip term="P_GANAR" /></div>
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          aria-hidden="true"
          size={18}
          style={{
            color: '#8C877F', flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          marginTop: 12, padding: '12px', background: '#F7F4EF', borderRadius: 8,
          color: '#78716C', fontSize: '13px', lineHeight: '1.6'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 8 }}>
            <div><span style={{ color: '#78716C' }}>Encuestas:</span> <strong style={{ color: '#1C1917' }}>{c.polls_pct ? c.polls_pct.toFixed(1) + '%' : '—'}</strong></div>
            <div><span style={{ color: '#78716C' }}>Polymarket:</span> <strong style={{ color: '#1C1917' }}>{c.polymarket_pct ? c.polymarket_pct.toFixed(1) + '%' : '—'}</strong></div>
            <div><span style={{ color: '#78716C' }}>IC 90%:</span> <strong style={{ color: '#1C1917' }}>[{c.p10.toFixed(1)}% – {c.p90.toFixed(1)}%]</strong></div>
            <div><span style={{ color: '#78716C' }}>Posterior:</span> <strong style={{ color: '#1C1917' }}>{c.posterior_pct ? c.posterior_pct.toFixed(1) + '%' : '—'}</strong></div>
          </div>
          <p style={{ margin: 0, color: '#78716C' }}>
            {c.prob_win >= 50
              ? `${c.candidate} es el candidato más favorecido según el modelo. En ${c.prob_runoff.toFixed(0)}% de las simulaciones pasa a segunda vuelta.`
              : c.prob_win >= 5
              ? `${c.candidate} tiene posibilidades reales. Pasa a segunda vuelta en ${c.prob_runoff.toFixed(0)}% de las 10,000 simulaciones.`
              : `${c.candidate} tiene probabilidades bajas de ganar, pero podría influir en la distribución de votos y segunda vuelta.`
            }
          </p>
        </div>
      )}
    </div>
  );
}
