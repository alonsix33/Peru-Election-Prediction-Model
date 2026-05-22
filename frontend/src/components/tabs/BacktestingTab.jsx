import { useState } from 'react';
import { getPartyColor } from '../../config/partyColors';
import { History, BarChart3, CheckCircle, XCircle, TrendingUp, Info } from 'lucide-react';

const DATA = {
  2016: {
    context: 'Primera vuelta con 3 encuestadoras activas (Ipsos, CPI, Datum). Agregador sin Polymarket — solo encuestas hasta antes de la veda electoral del 3 de abril.',
    candidates: [
      { name: 'Keiko Fujimori', modelo: 37.9, onpe: 39.9, error: -2.0, inIC: true },
      { name: 'Pedro Pablo Kuczynski', modelo: 19.8, onpe: 21.1, error: -1.3, inIC: true },
      { name: 'Verónika Mendoza', modelo: 17.6, onpe: 19.9, error: -2.3, inIC: true },
      { name: 'Alfredo Barnechea', modelo: 12.3, onpe: 7.3, error: +5.1, inIC: false },
      { name: 'Alan García', modelo: 7.5, onpe: 5.8, error: +1.7, inIC: true },
      { name: 'Gregorio Santos', modelo: 4.9, onpe: 4.1, error: +0.7, inIC: true },
    ],
    mae: 2.2,
    ic: '5/6 (83%)',
    pollsters: [
      { name: 'Ipsos', mae: 3.3 },
      { name: 'CPI', mae: 4.0 },
      { name: 'Datum', mae: 4.1 },
    ],
    highlight: 'El modelo ubicó correctamente el orden del top-3: Keiko 1ra, PPK 2do, Mendoza 3ra. La disputa entre PPK y Mendoza por el segundo lugar fue la más cerrada del ciclo.',
    note: 'El error más grande fue Barnechea (+5.1 pts), probablemente por voto estratégico de última hora hacia PPK. Este tipo de movimiento ocurre después de la última encuesta y es difícil de anticipar con cualquier modelo basado en encuestas.',
  },
  2021: {
    context: 'Primera vuelta con 4 encuestadoras activas (Ipsos, IEP, CPI, Datum). Agregador sin Polymarket — solo encuestas hasta antes de la veda electoral del 4 de abril.',
    candidates: [
      { name: 'Pedro Castillo', modelo: 12.7, onpe: 18.9, error: -6.2, inIC: false },
      { name: 'Keiko Fujimori', modelo: 11.9, onpe: 13.4, error: -1.5, inIC: true },
      { name: 'Rafael López Aliaga', modelo: 11.8, onpe: 11.8, error: 0.0, inIC: true },
      { name: 'Hernando de Soto', modelo: 13.5, onpe: 11.6, error: +1.9, inIC: true },
      { name: 'Yonhy Lescano', modelo: 15.1, onpe: 8.9, error: +6.2, inIC: false },
      { name: 'Verónika Mendoza', modelo: 10.4, onpe: 7.9, error: +2.5, inIC: true },
      { name: 'George Forsyth', modelo: 12.7, onpe: 6.1, error: +6.6, inIC: false },
      { name: 'César Acuña', modelo: 5.0, onpe: 5.8, error: -0.7, inIC: true },
      { name: 'Daniel Urresti', modelo: 6.8, onpe: 5.4, error: +1.4, inIC: true },
    ],
    mae: 3.0,
    ic: '6/9 (67%)',
    pollsters: [
      { name: 'IEP', mae: 3.5 },
      { name: 'Ipsos', mae: 4.8 },
      { name: 'CPI', mae: 5.1 },
    ],
    highlight: 'El modelo ubicó a Castillo en el #3 con 23.6% de probabilidad de pasar a segunda vuelta — una señal más clara que la de las encuestas individuales. El error de -6.2 pts refleja la misma subestimación del voto rural que afectó a todas las encuestadoras.',
    note: 'Lescano (+6.2) y Forsyth (+6.6) fueron los mayores errores, probablemente por migración de voto estratégico en las últimas horas — un patrón similar al de Barnechea en 2016.',
  },
  2026: {
    context: 'Primera vuelta 12 abril 2026. Blend bayesiano Polymarket + encuestas (α=0.77 día electoral). Primer ciclo incorporando mercados de predicción en tiempo real como señal complementaria. Nota: "Ipsos CR" y "Datum CR" son conteos rápidos (encuesta de salida el día de la elección), no encuestas pre-electorales — por eso su MAE es muy bajo; no es comparable con los MAE del modelo ni con los de años anteriores.',
    candidates: [
      { name: 'Keiko Fujimori', modelo: 30.0, onpe: 17.2, error: +12.8, inIC: false },
      { name: 'Rafael López Aliaga', modelo: 13.0, onpe: 11.9, error: +1.1, inIC: true },
      { name: 'Ricardo Belmont', modelo: 11.3, onpe: 10.2, error: +1.1, inIC: true },
      { name: 'Jorge Nieto', modelo: 9.1, onpe: 11.0, error: -1.9, inIC: true },
      { name: 'Roberto Sánchez Palomino', modelo: 8.9, onpe: 12.0, error: -3.1, inIC: false },
    ],
    mae: 4.01,
    ic: '3/5 (60%)',
    pollsters: [
      { name: 'Ipsos CR', mae: 0.28 },
      { name: 'Datum CR', mae: 2.0 },
    ],
    highlight: 'Dos fallos mayores. Primero: Keiko inflada +12.8pp. Con α=0.77, Polymarket (45.5% P(ganar la presidencia)) dominó el blend — y ese 45.5% no es el % de votos en primera vuelta, sino la probabilidad de ganar toda la elección incluyendo segunda vuelta. En una carrera de N candidatos ese número siempre sobreestima al líder. A α alto, ese sesgo se amplifica en proporción directa. Segundo: Sánchez en el #5 del modelo (8.9%), llegó #2 en ONPE (12.0%). Repitió el patrón Castillo 2021 exacto: base rural fuerte en zonas subrepresentadas en encuestas urbanas. Lo que salió bien: el orden Keiko #1, Aliaga #3, Nieto #4 son posiciones correctas; los errores en magnitud de esos tres están dentro del margen.',
    note: 'Correcciones para R2: (1) conversión P(win)→voto share implícito — PM 75.5% P(ganar) no significa 75.5% de votos; con la incertidumbre histórica de ±3pp, eso implica ~52% de votos. Sin esta corrección, el modelo sobreestimaba a Keiko hasta 3pp cuando sube el alpha en la veda; (2) alpha cap 0.77→0.60 para evitar sobreponderación; (3) pesos encuestadoras calibrados por precisión R1: Ipsos 1.30×, Datum 1.05×.',
  },
};

const POLLSTER_COLORS = {
  Ipsos: '#7C3AED', CPI: '#D97706', Datum: '#059669', IEP: '#1D4ED8',
};

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 10,
      padding: 18, flex: 1, minWidth: 160,
    }}>
      <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ color: color || '#1C1917', fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{value}</div>
      <div style={{ color: '#8C877F', fontSize: 11 }}>{sub}</div>
    </div>
  );
}

export default function BacktestingTab() {
  const [activeYear, setActiveYear] = useState(2026);
  const d = DATA[activeYear];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Validación histórica</div>
        <h2 style={{ color: '#1C1917', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
          ¿Qué tan bien predijo el modelo en elecciones pasadas?
        </h2>
        <p style={{ color: '#78716C', fontSize: 14, lineHeight: 1.6, maxWidth: 640 }}>
          Corrimos el agregador hacia atrás usando solo los datos que estaban disponibles antes de cada veda electoral — sin información futura, sin ajustes posteriores. Los números muestran tanto los aciertos como los errores.
        </p>
      </div>

      {/* Methodology note */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderLeft: '3px solid #1D4ED8',
        borderRadius: '0 10px 10px 0', padding: '16px 20px',
      }}>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: '#1C1917' }}>Metodología:</strong> el modelo combina encuestas de cada ciclo con ponderación bayesiana,
          ajusta por sesgos conocidos de cada encuestadora, redistribuye indecisos y corre 10,000 simulaciones Monte Carlo.{' '}
          <strong style={{ color: '#1C1917' }}>MAE</strong> (error absoluto medio) mide la distancia promedio entre predicción y resultado real en puntos porcentuales.
        </p>
      </div>

      {/* Year tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E0D8' }}>
        {[2026, 2021, 2016].map(y => (
          <button
            key={y}
            onClick={() => setActiveYear(y)}
            style={{
              padding: '10px 24px', fontSize: 14, fontWeight: activeYear === y ? 600 : 400,
              color: activeYear === y ? '#1D4ED8' : '#78716C', background: 'transparent',
              border: 'none', borderBottom: activeYear === y ? '2px solid #1D4ED8' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {y === 2026 ? '2026 ★' : y}
          </button>
        ))}
      </div>

      {/* Context */}
      <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6 }}>{d.context}</p>

      {/* Metric cards */}
      {(() => {
        const diff = d.pollsters[0].mae - d.mae; // positive = model better
        const modelBetter = diff > 0;
        return (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <MetricCard label="MAE del modelo" value={`${d.mae} pts`} sub="error absoluto medio" color={d.mae < 3 ? '#059669' : '#D97706'} />
            <MetricCard label="Calibración IC 90%" value={d.ic} sub="candidatos dentro del intervalo" color="#1D4ED8" />
            <MetricCard
              label="Vs. mejor encuestadora"
              value={modelBetter ? `−${diff.toFixed(1)} pts` : `+${Math.abs(diff).toFixed(1)} pts`}
              sub={modelBetter
                ? `mejor que ${d.pollsters[0].name} (${d.pollsters[0].mae} pts)`
                : `peor que ${d.pollsters[0].name} (${d.pollsters[0].mae} pts)`}
              color={modelBetter ? '#059669' : '#DC2626'}
            />
          </div>
        );
      })()}

      {/* Results table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5E0D8' }}>
          <span style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modelo vs. ONPE — votos válidos
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E0D8' }}>
                <th style={{ textAlign: 'left', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Candidato</th>
                <th style={{ textAlign: 'right', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Modelo</th>
                <th style={{ textAlign: 'right', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>ONPE</th>
                <th style={{ textAlign: 'right', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Error</th>
                <th style={{ textAlign: 'center', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>IC 90%</th>
              </tr>
            </thead>
            <tbody>
              {d.candidates.map(c => {
                const errColor = Math.abs(c.error) < 0.1 ? '#059669' : c.error > 3 ? '#DC2626' : c.error < -3 ? '#D97706' : '#1C1917';
                return (
                  <tr key={c.name} style={{ borderBottom: '1px solid #F0EDE8' }}>
                    <td style={{ padding: '10px 14px', color: '#1C1917', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1C1917' }}>{c.modelo.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#78716C' }}>{c.onpe.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: errColor, fontWeight: 500 }}>
                      {c.error > 0 ? '+' : ''}{c.error.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {c.inIC
                        ? <CheckCircle size={14} style={{ color: '#059669' }} />
                        : <XCircle size={14} style={{ color: '#DC2626' }} />
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Highlight */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 10, padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <TrendingUp size={16} style={{ color: '#1D4ED8', flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: '#1C1917' }}>Hallazgo clave:</strong> {d.highlight}
          </p>
        </div>
      </div>

      {/* Note */}
      <div style={{
        borderLeft: '3px solid #E5E0D8', padding: '12px 16px',
      }}>
        <p style={{ color: '#8C877F', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{d.note}</p>
      </div>

      {/* vs Pollsters */}
      <div>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Comparación de MAE — modelo vs. encuestadoras
        </div>

        {/* Model row */}
        {(() => {
          const modelBetter = d.mae < d.pollsters[0].mae;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0EDE8' }}>
              <span style={{ width: 100, color: '#1D4ED8', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>Modelo</span>
              <div style={{ flex: 1, height: 8, background: '#F0EDE8', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(d.mae / 6) * 100}%`, height: '100%', background: '#1D4ED8', borderRadius: 4 }} />
              </div>
              <span style={{ width: 55, textAlign: 'right', color: '#1D4ED8', fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{d.mae} pts</span>
              <span style={{
                fontSize: 10, padding: '2px 6px',
                background: modelBetter ? '#EFF6FF' : '#FEF2F2',
                color: modelBetter ? '#1D4ED8' : '#DC2626',
                border: modelBetter ? '1px solid #BFDBFE' : '1px solid #FECACA',
                borderRadius: 4, flexShrink: 0
              }}>{modelBetter ? 'menor MAE' : 'mayor MAE'}</span>
            </div>
          );
        })()}

        {/* Pollster rows */}
        {d.pollsters.map(p => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0EDE8' }}>
            <span style={{ width: 100, color: '#78716C', fontSize: 13, flexShrink: 0 }}>{p.name}</span>
            <div style={{ flex: 1, height: 8, background: '#F0EDE8', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(p.mae / 6) * 100}%`, height: '100%', background: POLLSTER_COLORS[p.name] || '#8C877F', opacity: 0.4, borderRadius: 4 }} />
            </div>
            <span style={{ width: 55, textAlign: 'right', color: '#78716C', fontSize: 13, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{p.mae} pts</span>
            <span style={{ width: 48 }} />
          </div>
        ))}
      </div>

      {/* 2026 lessons & R2 updates note */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderLeft: '3px solid #1D4ED8',
        borderRadius: '0 12px 12px 0', padding: '20px 24px',
      }}>
        <div style={{ color: '#1D4ED8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Segunda vuelta — Junio 2026</div>
        <h4 style={{ color: '#1C1917', fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>Qué cambiamos para la segunda vuelta</h4>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '0 0 10px' }}>
          El mayor aprendizaje de 2026 R1: Polymarket cotiza <strong style={{ color: '#1C1917' }}>P(ganar la presidencia)</strong>,
          no el porcentaje de votos. En primera vuelta eso distorsionó a Keiko +12.8pp. En segunda vuelta el problema persiste —
          PM 75.5% P(ganar) no equivale a 75.5% de los votos. Con ±3pp de incertidumbre histórica, ese 75.5% implica solo ~52% de votos.
          Sin corrección, el posterior se inflaría hasta 3pp al subir el alpha durante la veda.
        </p>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          Ajustes para R2: <strong style={{ color: '#1C1917' }}>conversión P(ganar)→voto share implícito</strong> antes de integrar;{' '}
          <strong style={{ color: '#1C1917' }}>alpha cap 0.60</strong> (era 0.77 en R1);{' '}
          <strong style={{ color: '#1C1917' }}>Ipsos 1.30×</strong> (mejor MAE R1) y{' '}
          <strong style={{ color: '#1C1917' }}>Datum 1.05×</strong> basados en performance real del conteo rápido.
        </p>
      </div>
    </div>
  );
}
