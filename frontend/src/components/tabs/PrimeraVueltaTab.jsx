import { useState } from 'react';
import CandidateCard from '../CandidateCard';
import TrendChart from '../TrendChart';

const POLLSTER_INFO = [
  { name: 'IEP', weight: '1.25x', note: 'Menor error absoluto medio en 2021. Mayor cobertura rural.' },
  { name: 'Datum', weight: '1.10x', note: 'Mayor muestra (n=3000). Ficha técnica robusta. (Actualizado a 1.05x para R2 tras sesgo urbano en mesas de muestra.)' },
  { name: 'Ipsos', weight: '1.00x', note: 'Referencia base R1. MAE 0.28pp en conteo rápido. (Actualizado a 1.30x para R2 por mejor cobertura geográfica nacional.)' },
  { name: 'CPI', weight: '0.95x', note: 'Ligeramente menor precisión en 2021.' },
  { name: 'CIT', weight: '0.85x', note: 'Sin data comparable 2021. Penalización por incertidumbre.' },
  { name: 'CID', weight: '0.80x', note: 'CID Latinoamérica. Primera aparición en el modelo. Sin historial en Perú.' },
];

export default function PrimeraVueltaTab({ predictions, polls, onNavigate }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  if (!predictions?.candidates?.length) {
    return <div style={{ color: '#78716C', textAlign: 'center', padding: 40 }}>Sin datos de predicción.</div>;
  }

  const sorted = [...predictions.candidates].sort((a, b) => b.mean - a.mean);
  const maxMean = sorted[0]?.mean || 30;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* R1 frozen banner */}
      <div style={{
        background: '#F0FDF4', border: '1px solid #86EFAC',
        borderLeft: '4px solid #16A34A', borderRadius: 10, padding: '12px 16px',
      }}>
        <div style={{ color: '#15803D', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          Foto final · Primera vuelta 12 de abril de 2026
        </div>
        <div style={{ color: '#166534', fontSize: 12, lineHeight: 1.5 }}>
          Datos congelados. ONPE proclamó resultados el 17/05/2026: Keiko Fujimori 17.2%,
          Roberto Sánchez Palomino 12.0%, Rafael López Aliaga 11.9%, Jorge Nieto 11.0%.
          Sánchez y Keiko pasan a segunda vuelta el 7 de junio.
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate('segunda')}
            style={{
              marginTop: 10, width: '100%', minHeight: 44,
              background: '#16A34A', color: '#FFFFFF', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '10px 16px',
            }}
          >
            Ver pronóstico de segunda vuelta →
          </button>
        )}
      </div>

      {/* Title */}
      <div>
        <h2 style={{ color: '#1C1917', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
          Primera Vuelta · 12 de abril de 2026
        </h2>
        <p style={{ color: '#78716C', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Foto final del modelo vs. resultados ONPE 100%. Segunda vuelta: Keiko vs. Sánchez el 7 de junio.
        </p>
      </div>

      {/* Candidate cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((c, i) => (
          <CandidateCard
            key={c.candidate}
            candidate={c}
            rank={i + 1}
            expanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            maxMean={maxMean}
          />
        ))}
      </div>

      {/* Trend Chart */}
      <TrendChart polls={polls} />

      {/* Pollster weight table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
        <h3 style={{ color: '#1C1917', fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>
          Peso de encuestadoras
        </h3>
        <p style={{ color: '#78716C', fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          El peso de cada encuestadora se basa en su precisión real en las elecciones de 2021 (MAE: Error Absoluto Medio).
          Las encuestas más recientes tienen mayor peso que las antiguas.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E0D8' }}>
                <th style={{ color: '#78716C', fontWeight: 500, padding: '8px 12px', textAlign: 'left' }}>Encuestadora</th>
                <th style={{ color: '#78716C', fontWeight: 500, padding: '8px 12px', textAlign: 'center' }}>Peso</th>
                <th style={{ color: '#78716C', fontWeight: 500, padding: '8px 12px', textAlign: 'left' }}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {POLLSTER_INFO.map(p => (
                <tr key={p.name} style={{ borderBottom: '1px solid #E5E0D8' }}>
                  <td style={{ color: '#1C1917', fontWeight: 600, padding: '8px 12px' }}>{p.name}</td>
                  <td style={{ color: '#1D4ED8', fontWeight: 600, padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.weight}</td>
                  <td style={{ color: '#78716C', padding: '8px 12px' }}>{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#A8A29E', fontSize: 12, margin: '12px 0 0', fontStyle: 'italic' }}>
          Total encuestas en el modelo: {polls?.total_polls || 16} de {POLLSTER_INFO.length} casas encuestadoras.
        </p>
      </div>
    </div>
  );
}
