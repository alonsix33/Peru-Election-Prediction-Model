import { getPartyColor } from '../config/partyColors';

// Promedio ponderado CIT marzo (40%) + Ipsos abril (60%)
const REJECTION = {
  'Rafael López Aliaga': 50.9,
  'Keiko Fujimori': 60.5,
  'Carlos Álvarez': 42.9,
  'López Chau': 45.9,
  'Roberto Sánchez Palomino': 44.2,
  'Wolfgang Grozo': 45.6,
};

export default function RunoffCard({ scenario: s, expanded, onToggle }) {
  const candidates = Object.keys(s.wins);
  const [candA, candB] = candidates.sort((a, b) => s.wins[b] - s.wins[a]);
  const pctA = s.wins[candA];
  const pctB = s.wins[candB];
  const colorA = getPartyColor(candA);
  const colorB = getPartyColor(candB);

  // Bar proportions (excluding blank for the vote bar)
  const totalVote = pctA + pctB;
  const barA = totalVote > 0 ? (pctA / totalVote) * 100 : 50;
  const barB = totalVote > 0 ? (pctB / totalVote) * 100 : 50;

  return (
    <div
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      tabIndex={0}
      role="button"
      aria-expanded={expanded}
      style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: '12px',
        padding: '16px', cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#C9C4BB'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E0D8'}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#1C1917', fontWeight: 600, fontSize: '15px' }}>
          {candA.split(' ').pop()} vs {candB.split(' ').pop()}
        </span>
        <span style={{
          background: '#F0EDE8', color: '#78716C', padding: '2px 8px',
          borderRadius: '9999px', fontSize: '12px', border: '1px solid #E5E0D8'
        }}>
          {s.frequency}% de simulaciones
        </span>
      </div>

      {/* Bicolor bar */}
      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{
          width: `${barA}%`, background: colorA.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '12px', fontWeight: 600, minWidth: 30
        }}>
          {pctA.toFixed(0)}%
        </div>
        <div style={{
          width: `${barB}%`, background: colorB.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '12px', fontWeight: 600, minWidth: 30
        }}>
          {pctB.toFixed(0)}%
        </div>
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <span style={{ color: colorA.primary }}>{candA}</span>
        <span style={{ color: '#8C877F' }}>Blanco: {s.avg_blank_pct.toFixed(1)}%</span>
        <span style={{ color: colorB.primary }}>{candB}</span>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{
          marginTop: 12, padding: '12px', background: '#F7F4EF', borderRadius: 8,
          color: '#78716C', fontSize: '13px', lineHeight: '1.6'
        }}>
          <p style={{ margin: '0 0 8px' }}>
            <strong style={{ color: '#1C1917' }}>Voto blanco: {s.avg_blank_pct.toFixed(1)}%</strong>
            {s.avg_blank_pct > 35
              ? '. Ambos candidatos concentran alto rechazo. Una porción significativa del electorado podría optar por no votar por ninguno.'
              : '. Nivel moderado de voto blanco para una segunda vuelta.'}
          </p>
          {REJECTION[candA] && (
            <p style={{ margin: '0 0 4px', color: '#78716C' }}>Rechazo definitivo {candA.split(' ').pop()}: <strong style={{ color: '#1C1917' }}>{REJECTION[candA]}%</strong></p>
          )}
          {REJECTION[candB] && (
            <p style={{ margin: 0, color: '#78716C' }}>Rechazo definitivo {candB.split(' ').pop()}: <strong style={{ color: '#1C1917' }}>{REJECTION[candB]}%</strong></p>
          )}
        </div>
      )}
    </div>
  );
}
