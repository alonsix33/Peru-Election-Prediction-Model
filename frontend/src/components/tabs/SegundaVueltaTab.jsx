import { getPartyColor } from '../../config/partyColors';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import TermTooltip from '../TermTooltip';

const KEIKO_COLOR = getPartyColor('Keiko Fujimori').primary;                // #F97316
const SANCHEZ_COLOR = getPartyColor('Roberto Sánchez Palomino').primary;   // #16A34A

// Alliance context — editorial data (news-sourced, not from live polls)
// Sources: communicados oficiales, declaraciones públicas, La República, RPP, Infobae, Caretas
const KEIKO_ALLIANCES = [
  {
    name: 'Rafael López Aliaga',
    pct: 11.9,
    status: 'parcial',
    note: 'Renovación Popular. RLA rechazó dar apoyo personal a Keiko el 18/05 ("no tengo nada que hablar"). Parlamentarios del partido en diálogo con Fuerza Popular. Mayor bloque de votos en disputa.',
  },
  {
    name: 'Jorge Nieto',
    pct: 11.0,
    status: 'ambiguo',
    note: 'Partido del Buen Gobierno. Delegó decisión a su comité ejecutivo. No descartó el voto blanco/viciado como opción del partido (18/05). Sin señal hacia ningún candidato.',
  },
];

const SANCHEZ_ADJACENT = [
  {
    name: 'Verónica Mendoza',
    pct: 4.1,
    status: 'formal',
    note: 'Nuevo Perú. Apoyo formal anunciado por Sánchez el 15/05. Uno de los cinco partidos que confirmaron respaldo.',
  },
  {
    name: 'López Chau',
    pct: 7.3,
    status: 'ambiguo',
    note: 'Ahora Nación. Descartó votar por Keiko. Considera conversaciones con Juntos por el Perú en el Congreso. Sin anuncio formal de apoyo a Sánchez.',
  },
  {
    name: 'Marisol Pérez Tello',
    pct: 3.4,
    status: 'parcial',
    note: 'Primero la Gente. Partido apoya a Sánchez. Ella personalmente votará viciado.',
  },
];

const SIN_POSICION = [
  { name: 'Belmont', pct: 10.2, note: 'Retirado, sin pronunciamiento público.' },
];

function parseDate(raw) {
  if (!raw) return null;
  // Postgres DATE can arrive as "2026-04-24" or "2026-04-24T00:00:00.000Z"
  if (typeof raw === 'string' && !raw.includes('T')) return new Date(raw + 'T12:00:00Z');
  return new Date(raw);
}

function formatDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d)) return '—';
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPollTypLabel(pollType) {
  if (pollType === 'intencion_voto') return 'Intención de voto';
  if (pollType === 'simulacro') return 'Simulacro (votos válidos)';
  return pollType || '—';
}

function PollsTable({ r2polls }) {
  const polls = r2polls?.polls || [];

  if (polls.length === 0) {
    return (
      <div style={{ color: '#78716C', fontSize: 13, textAlign: 'center', padding: 20 }}>
        {r2polls === null
          ? 'Error cargando encuestas. Reintenta en un momento.'
          : 'Sin encuestas de segunda vuelta aún.'}
      </div>
    );
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E0D8' }}>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Encuestadora</th>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Campo · Publicada</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', color: KEIKO_COLOR, fontWeight: 600, fontSize: 11 }}>Keiko</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', color: SANCHEZ_COLOR, fontWeight: 600, fontSize: 11 }}>Sánchez</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>B/N</th>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {polls.map(p => {
              const keiko = p.results?.find(r => r.candidate?.includes('Keiko'));
              const sanchez = p.results?.find(r => r.candidate?.includes('Sánchez') || r.candidate?.includes('Roberto'));
              const fieldRange = `${formatDate(p.field_start)}–${formatDate(p.field_end)}`;
              const pub = p.published_date ? formatDate(p.published_date) : '—';
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #F0EDE8' }}>
                  <td style={{ padding: '10px 12px', color: '#1C1917', fontWeight: 600 }}>{p.pollster}</td>
                  <td style={{ padding: '10px 12px', color: '#78716C', fontSize: 12 }}>
                    {fieldRange}<br />
                    <span style={{ color: '#A8A29E' }}>pub. {pub}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: KEIKO_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {keiko ? keiko.pct_raw.toFixed(0) + '%' : '—'}
                    {keiko && sanchez && (
                      <div style={{ color: '#A8A29E', fontSize: 11, fontWeight: 400, marginTop: 1 }}>
                        {((keiko.pct_raw / (keiko.pct_raw + sanchez.pct_raw)) * 100).toFixed(1)}% v.v.
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: SANCHEZ_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {sanchez ? sanchez.pct_raw.toFixed(0) + '%' : '—'}
                    {keiko && sanchez && (
                      <div style={{ color: '#A8A29E', fontSize: 11, fontWeight: 400, marginTop: 1 }}>
                        {((sanchez.pct_raw / (keiko.pct_raw + sanchez.pct_raw)) * 100).toFixed(1)}% v.v.
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#78716C', fontVariantNumeric: 'tabular-nums' }}>
                    {p.pct_blank_null != null ? p.pct_blank_null.toFixed(0) + '%' : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#78716C', fontSize: 12 }}>{getPollTypLabel(p.poll_type)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {polls.map(p => p.notes && (
        <div key={p.id + '_note'} style={{ color: '#A8A29E', fontSize: 11, marginTop: 6 }}>
          <strong>{p.pollster}:</strong> {p.notes}
        </div>
      ))}
      <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 6 }}>
        Los % principales son <strong>intención de voto bruta</strong> (incluye indecisos y B/N). v.v. = votos válidos calculados de los datos declarados, excluyendo B/N y NS/NP.
      </div>
      <div style={{
        marginTop: 8, background: '#FFFBEB', border: '1px solid #FCD34D',
        borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#92400E',
      }}>
        Circulan encuestas falsas atribuidas a Datum, Ipsos e IEP. Solo las encuestas mostradas aquí han sido verificadas. IEP emitió comunicado el 16/05/2026 confirmando que no publicó ninguna encuesta de mayo.
      </div>
    </>
  );
}

function HeadToHead({ predictions }) {
  const cands = predictions?.candidates || [];
  const keiko = cands.find(c => c.candidate?.includes('Keiko') || c.candidate?.includes('Fujimori'));
  const sanchez = cands.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));
  const blankPct = predictions?.risk_scenarios?.expected_blank_null ?? null;

  if (!keiko && !sanchez) {
    return (
      <div style={{
        background: '#F7F4EF', borderRadius: 12, padding: 20,
        color: '#78716C', textAlign: 'center', fontSize: 13
      }}>
        Modelo segunda vuelta inicializando. Datos disponibles al completar la primera predicción R2.
      </div>
    );
  }

  const candidates = [
    { data: keiko, name: 'Keiko Fujimori', party: 'Fuerza Popular', color: KEIKO_COLOR },
    { data: sanchez, name: 'Roberto Sánchez Palomino', party: 'Juntos por el Perú', color: SANCHEZ_COLOR },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {candidates.map(({ data, name, party, color }) => (
          <div key={name} style={{
            flex: 1, minWidth: 200, background: '#FFFFFF',
            border: `2px solid ${color}20`, borderRadius: 12, padding: 20,
          }}>
            <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 6 }}>{party}</div>
            <div style={{ color: '#1C1917', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{name}</div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>% votos válidos (estimación MC)</div>
              <div style={{ color, fontWeight: 700, fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>
                {data ? data.mean.toFixed(1) : '—'}%
              </div>
              {data && (
                <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 2 }}>
                  IC 90%<TermTooltip term="IC_90" /> v.v.: [{data.p10.toFixed(1)}%, {data.p90.toFixed(1)}%]
                </div>
              )}
            </div>

            <div>
              <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>P(ganar segunda vuelta)<TermTooltip term="P_GANAR" /></div>
              <div style={{ color, fontWeight: 600, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                {data ? data.prob_win.toFixed(1) : '—'}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {blankPct !== null && (
        <div style={{
          background: '#F7F4EF', borderRadius: 10, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ color: '#78716C', fontSize: 11, marginBottom: 2 }}>Voto blanco / nulo estimado</div>
            <div style={{ color: '#1C1917', fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
              {blankPct.toFixed(1)}%
            </div>
          </div>
          <div style={{ color: '#A8A29E', fontSize: 11, flex: 1, minWidth: 180 }}>
            Estimación del modelo: doble rechazo bilateral (antivoto KF × antivoto RSP, ρ=−0.20).
            Históricamente entre 2–5% en R2 peruano (2016: 2.5%, 2021: 3.1%).
          </div>
        </div>
      )}
    </div>
  );
}

function PMvsPollsSection({ polymarket, r2polls }) {
  const keikoPM = polymarket?.candidates?.find(c => c.candidate?.includes('Keiko'));
  const sanchezPM = polymarket?.candidates?.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));

  const polls = r2polls?.polls || [];
  // probability stored as 0-100 in DB (scraper multiplies priceYes * 100)
  const keikoPct = keikoPM ? parseFloat(keikoPM.probability).toFixed(0) : null;
  const sanchezPct = sanchezPM ? parseFloat(sanchezPM.probability).toFixed(0) : null;
  const volumeM = polymarket?.volume_usd ? (polymarket.volume_usd / 1e6).toFixed(1) : null;

  // Weighted average raw intent from polls
  let wKeikoSum = 0, wSanchezSum = 0, wTotal = 0;
  for (const p of polls) {
    const keiko = p.results?.find(r => r.candidate?.includes('Keiko'));
    const sanchez = p.results?.find(r => r.candidate?.includes('Sánchez') || r.candidate?.includes('Roberto'));
    const w = p.effective_weight || 1;
    if (keiko && sanchez) {
      wKeikoSum += keiko.pct_raw * w;
      wSanchezSum += sanchez.pct_raw * w;
      wTotal += w;
    }
  }
  const avgKeiko = wTotal > 0 ? (wKeikoSum / wTotal).toFixed(0) : null;
  const avgSanchez = wTotal > 0 ? (wSanchezSum / wTotal).toFixed(0) : null;

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12,
      borderLeft: '4px solid #7C3AED', padding: 20
    }}>
      <h3 style={{ color: '#7C3AED', fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>
        Polymarket vs. Encuestas
      </h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 180, background: '#F7F4EF', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 6 }}>
            Polymarket · P(ganar){volumeM && <span style={{ color: '#A8A29E' }}> · ${volumeM}M vol.</span>}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div>
              <div style={{ color: KEIKO_COLOR, fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                {keikoPct != null ? keikoPct + '%' : '—'}
              </div>
              <div style={{ color: '#A8A29E', fontSize: 10 }}>Keiko · prob. ganar</div>
            </div>
            <div>
              <div style={{ color: SANCHEZ_COLOR, fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                {sanchezPct != null ? sanchezPct + '%' : '—'}
              </div>
              <div style={{ color: '#A8A29E', fontSize: 10 }}>Sánchez · prob. ganar</div>
            </div>
          </div>
          {polymarket?.captured_at_lima && (
            <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 6 }}>
              {new Date(polymarket.captured_at_lima).toLocaleString('es-PE', { timeZone: 'America/Lima', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 180, background: '#F7F4EF', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 6 }}>
            Encuestas (intención bruta, promedio ponderado)
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div>
              <div style={{ color: KEIKO_COLOR, fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                {avgKeiko != null ? avgKeiko + '%' : '—'}
              </div>
              <div style={{ color: '#A8A29E', fontSize: 10 }}>Keiko</div>
            </div>
            <div>
              <div style={{ color: SANCHEZ_COLOR, fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                {avgSanchez != null ? avgSanchez + '%' : '—'}
              </div>
              <div style={{ color: '#A8A29E', fontSize: 10 }}>Sánchez</div>
            </div>
          </div>
          {polls.length > 0 && (
            <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 6 }}>
              {polls.length} encuesta{polls.length > 1 ? 's' : ''} · ~{polls.reduce((s, p) => {
                const bn = p.pct_blank_null || 0;
                const nd = p.pct_undecided || 0;
                return s + Math.max(bn, nd);
              }, 0) / polls.length | 0}% no comprometidos
            </div>
          )}
        </div>
      </div>
      <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>
        A diferencia de la primera vuelta, en R2 Polymarket <em>sí</em> cotiza directamente P(ganar la presidencia), que es lo que mide la segunda vuelta.
        La brecha entre el mercado y las encuestas podría indicar que PM incorpora información no capturada en sondeos
        (encuestas internas, alianzas en formación) o que hay un componente especulativo en el mercado.
      </p>
      <p style={{ color: '#8C877F', fontSize: 12, margin: 0 }}>
        El modelo asigna α=20–60% al mercado (sube progresivamente durante la veda).
        Polymarket se incorpora como P(ganar), capada en ±10 pts desde el 50% para evitar vote shares imposibles.
      </p>
    </div>
  );
}

function AllianceSection() {
  const statusLabel = {
    formal:   { label: 'apoyo formal',        color: '#16A34A', bg: '#DCFCE7' },
    incierto: { label: 'en negociaciones',    color: '#D97706', bg: '#FEF9C3' },
    ambiguo:  { label: 'posición ambigua',    color: '#78716C', bg: '#F3F4F6' },
    parcial:  { label: 'partido sí / ella no', color: '#78716C', bg: '#F3F4F6' },
  };

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
      <h3 style={{ color: '#1C1917', fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
        Alianzas y transferencia de voto
      </h3>
      <p style={{ color: '#A8A29E', fontSize: 12, margin: '0 0 14px' }}>
        Históricamente, entre el 40 y el 60% del voto de un candidato sigue la recomendación de su líder.
        Badge verde = confirmado · amarillo = en negociación · gris = posición ambigua.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* Sánchez side */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: SANCHEZ_COLOR, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Sector Sánchez
          </div>
          {SANCHEZ_ADJACENT.map(a => {
            const s = statusLabel[a.status];
            return (
              <div key={a.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ color: '#1C1917', fontSize: 13 }}>{a.name}</span>
                  <span style={{ color: SANCHEZ_COLOR, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{a.pct}% en R1</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{
                    background: s.bg, color: s.color,
                    borderRadius: 4, padding: '3px 8px', fontSize: 12, fontWeight: 600
                  }}>{s.label}</span>
                </div>
                <div style={{ color: '#A8A29E', fontSize: 11 }}>{a.note}</div>
                <div style={{ height: 4, borderRadius: 2, background: '#F0EDE8', marginTop: 5 }}>
                  <div style={{ width: `${(a.pct / 15) * 100}%`, height: '100%', borderRadius: 2, background: SANCHEZ_COLOR }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Keiko side */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: KEIKO_COLOR, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Sector Keiko
          </div>
          {KEIKO_ALLIANCES.map(a => {
            const s = statusLabel[a.status];
            return (
              <div key={a.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ color: '#1C1917', fontSize: 13 }}>{a.name}</span>
                  <span style={{ color: KEIKO_COLOR, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{a.pct}% en R1</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{
                    background: s.bg, color: s.color,
                    borderRadius: 4, padding: '3px 8px', fontSize: 12, fontWeight: 600
                  }}>{s.label}</span>
                </div>
                <div style={{ color: '#A8A29E', fontSize: 11 }}>{a.note}</div>
                <div style={{ height: 4, borderRadius: 2, background: '#F0EDE8', marginTop: 5 }}>
                  <div style={{ width: `${(a.pct / 15) * 100}%`, height: '100%', borderRadius: 2, background: KEIKO_COLOR }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sin posición */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0EDE8' }}>
        <div style={{ color: '#78716C', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Sin pronunciamiento</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SIN_POSICION.map(a => (
            <div key={a.name} style={{ background: '#F7F4EF', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
              <span style={{ color: '#1C1917', fontWeight: 600 }}>{a.name}</span>
              <span style={{ color: '#A8A29E', marginLeft: 6 }}>{a.pct}% en R1 · {a.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GeographicSection() {
  const data = [
    { region: 'Lima Metropolitana', keiko: 41, sanchez: 22, note: 'Keiko +19pp' },
    { region: 'Interior / Rural', keiko: 26, sanchez: 55, note: 'Sánchez +29pp' },
  ];

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
      <h3 style={{ color: '#1C1917', fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
        Polarización geográfica
      </h3>
      <p style={{ color: '#A8A29E', fontSize: 12, margin: '0 0 14px' }}>
        Intención de voto por región (IEP, abr 2026). Perfil similar al de Castillo 2021: Lima vs. el resto del país.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.map(r => (
          <div key={r.region}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#1C1917', fontWeight: 600, fontSize: 13 }}>{r.region}</span>
              <span style={{ color: '#A8A29E', fontSize: 11 }}>{r.note}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: KEIKO_COLOR, fontSize: 11, fontWeight: 600 }}>Keiko {r.keiko}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: '#F0EDE8' }}>
                  <div style={{ width: `${r.keiko}%`, height: '100%', borderRadius: 4, background: KEIKO_COLOR, opacity: 0.7 }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
                  <span style={{ color: SANCHEZ_COLOR, fontSize: 11, fontWeight: 600 }}>Sánchez {r.sanchez}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: '#F0EDE8', display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: `${r.sanchez}%`, height: '100%', borderRadius: 4, background: SANCHEZ_COLOR, opacity: 0.7 }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AntiVotoTrendChart({ antivoto }) {
  const candidates = antivoto?.candidates || [];
  const keiko = candidates.find(c => c.candidate?.includes('Keiko'));
  const sanchez = candidates.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));

  if (!keiko?.history?.length && !sanchez?.history?.length) return null;

  // Build unified dataset keyed by timestamp (numeric for continuous X axis)
  const pointMap = {};
  for (const h of keiko?.history || []) {
    const ts = parseDate(h.field_end)?.getTime();
    if (!ts) continue;
    if (!pointMap[ts]) pointMap[ts] = { ts, dateRaw: h.field_end };
    pointMap[ts].keiko = h.pct_no;
  }
  for (const h of sanchez?.history || []) {
    const ts = parseDate(h.field_end)?.getTime();
    if (!ts) continue;
    if (!pointMap[ts]) pointMap[ts] = { ts, dateRaw: h.field_end };
    pointMap[ts].sanchez = h.pct_no;
  }
  const chartData = Object.values(pointMap).sort((a, b) => a.ts - b.ts);
  if (chartData.length < 2) return null;

  const r1Ts = new Date('2026-04-12T12:00:00Z').getTime();
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

  // Dynamic Y axis so outlier points (e.g. Sánchez at 7% when barely known) are visible
  const allVals = chartData.flatMap(d => [d.keiko, d.sanchez].filter(v => v != null));
  const yMin = Math.max(0, Math.floor(Math.min(...allVals)) - 4);
  const yMax = Math.min(100, Math.ceil(Math.max(...allVals)) + 4);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 8 }}>
        Evolución del rechazo definitivo: R1 → R2
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
          <XAxis
            dataKey="ts" type="number" scale="time"
            domain={[chartData[0].ts - WEEK_MS, chartData[chartData.length - 1].ts + WEEK_MS]}
            tickFormatter={fmtDate}
            tick={{ fontSize: 10, fill: '#A8A29E' }}
          />
          <YAxis domain={[yMin, yMax]} tickFormatter={v => `${v}%`} width={34} tick={{ fontSize: 10, fill: '#A8A29E' }} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(val, key) => [`${val}%`, key === 'keiko' ? 'Keiko Fujimori' : 'Roberto Sánchez']}
            contentStyle={{ fontSize: 12, borderColor: '#E5E0D8', borderRadius: 6 }}
          />
          <ReferenceLine
            x={r1Ts} stroke="#D97706" strokeDasharray="4 3"
            label={{ value: 'R1 12 abr', position: 'insideTopRight', fontSize: 9, fill: '#D97706', fontWeight: 600 }}
          />
          <Line type="monotone" dataKey="keiko" name="Keiko Fujimori"
            stroke={KEIKO_COLOR} strokeWidth={2}
            dot={{ r: 4, fill: KEIKO_COLOR, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls
          />
          <Line type="monotone" dataKey="sanchez" name="Roberto Sánchez"
            stroke={SANCHEZ_COLOR} strokeWidth={2}
            dot={{ r: 4, fill: SANCHEZ_COLOR, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 4 }}>
        Fuentes: Ipsos (5 feb, 27 mar, 2 abr, 23-24 abr, 17 may 2026) · CIT (20-23 mar 2026)
      </div>
    </div>
  );


}

function AntiVotoSection({ antivoto }) {
  const candidates = antivoto?.candidates || [];
  const keiko = candidates.find(c => c.candidate?.includes('Keiko'));
  const sanchez = candidates.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));

  const renderCard = (data, color, shortName) => {
    if (!data) return null;
    // Delta vs. the previous R2 snapshot only (ignore R1 history for the card delta)
    const r2hist = (data.history || []).filter(h => h.election_round === 2);
    const prev = r2hist.length > 1 ? r2hist[r2hist.length - 2] : null;
    const delta = prev ? (data.latest_pct_no - prev.pct_no).toFixed(0) : null;
    const deltaLabel = delta === null ? null
      : delta > 0 ? `+${delta}pp desde ${formatDate(prev.field_end)}`
      : `${delta}pp desde ${formatDate(prev.field_end)}`;

    return (
      <div style={{ flex: 1, minWidth: 160, background: '#F7F4EF', borderRadius: 8, padding: 12 }}>
        <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 6 }}>{shortName}</div>
        <div style={{ color, fontWeight: 700, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>
          {data.latest_pct_no}%
        </div>
        <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 2 }}>definitivamente no votaría</div>
        {deltaLabel && (
          <div style={{ color: parseInt(delta) < 0 ? '#16A34A' : '#DC2626', fontSize: 10, marginTop: 2, fontWeight: 600 }}>
            {deltaLabel}
          </div>
        )}
        {data.pollster && (
          <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 4 }}>
            {data.pollster} · {formatDate(data.latest_field_end)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12,
      borderLeft: '4px solid #DC2626', padding: 20
    }}>
      <h3 style={{ color: '#DC2626', fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>
        Antivoto: el factor estructural
      </h3>
      {candidates.length === 0 ? (
        <div style={{ color: '#A8A29E', fontSize: 13 }}>Datos de antivoto no disponibles.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {renderCard(keiko, KEIKO_COLOR, 'Keiko Fujimori')}
            {renderCard(sanchez, SANCHEZ_COLOR, 'Roberto Sánchez')}
          </div>
          <AntiVotoTrendChart antivoto={antivoto} />
          <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '12px 0 8px' }}>
            Los datos muestran una convergencia: Keiko bajó 20pp en rechazo (64%→44%) de febrero a mayo,
            mientras Sánchez subió de 7% a 40% a medida que fue conocido.
            La brecha entre ambos se redujo a 4pp, lo que podría ampliar el voto blanco/nulo el día de la elección.
          </p>
        </>
      )}
    </div>
  );
}

export default function SegundaVueltaTab({ predictions, polymarket, r2polls, antivoto }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Title */}
      <div>
        <h2 style={{ color: '#1C1917', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
          Segunda Vuelta · 7 de junio de 2026
        </h2>
        <p style={{ color: '#78716C', fontSize: 14, margin: '0 0 6px', lineHeight: 1.5 }}>
          Keiko Fujimori (17.2%) vs. Roberto Sánchez Palomino (12.0%). Clasificados por la ONPE con resultados al 100% proclamados el 17/05/2026.
        </p>
        <p style={{ color: '#78716C', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          ¿Quién ganará el 7 de junio? El modelo combina encuestas, mercados de predicción y factores históricos para responder esta pregunta con datos actualizados automáticamente.
        </p>
      </div>

      {/* Model prediction head-to-head */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Predicción del modelo (actualizada automáticamente)
        </div>
        <HeadToHead predictions={predictions} />
        {predictions?.generated_at_lima && (
          <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 12 }}>
            Última actualización: {new Date(predictions.generated_at_lima).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
            {' · '}α Polymarket: {predictions.polymarket_weight ? (predictions.polymarket_weight * 100).toFixed(0) + '%' : '—'}
          </div>
        )}
      </div>

      {/* Polls table — dynamic from API */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
        <h3 style={{ color: '#1C1917', fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
          Encuestas publicadas
        </h3>
        <p style={{ color: '#A8A29E', fontSize: 12, margin: '0 0 12px' }}>
          Encuestas de segunda vuelta verificadas hasta la fecha.
        </p>
        <PollsTable r2polls={r2polls} />
      </div>

      {/* PM vs Polls — dynamic */}
      <PMvsPollsSection polymarket={polymarket} r2polls={r2polls} />

      {/* Alliance context — editorial */}
      <AllianceSection />

      {/* Geographic breakdown — editorial, sourced from IEP */}
      <GeographicSection />

      {/* Antivoto — dynamic from API */}
      <AntiVotoSection antivoto={antivoto} />

      {/* Narrative bridge */}
      <div style={{
        background: '#F7F4EF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 20,
      }}>
        <h3 style={{ color: '#1C1917', fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>
          ¿Qué implican estos factores para el pronóstico?
        </h3>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          Las alianzas formales (RLA + otros) suman bloques de voto que históricamente transfieren entre 40% y 60% de sus electores.
          La geografía muestra que Sánchez tiene ventaja fuera de Lima, replicando el perfil de Castillo en 2021.
          El antivoto de ambos candidatos converge cerca del 40-44%, lo que podría elevar el voto blanco/nulo por encima del promedio histórico.
          El modelo integra estos factores a través de la incertidumbre del Monte Carlo: los números de P(Ganar) reflejan todos estos escenarios ponderados por su probabilidad.
        </p>
      </div>

      {/* Historical pattern — expanded with anti-vote, polls vs result, margins */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12,
        borderLeft: '4px solid #DC2626', padding: 20
      }}>
        <h3 style={{ color: '#DC2626', fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>
          Keiko en segunda vuelta: historial completo
        </h3>
        <p style={{ color: '#A8A29E', fontSize: 12, margin: '0 0 14px' }}>
          Resultados ONPE oficiales · Antivoto Ipsos · Últimas encuestas publicables (semana previa)
        </p>

        {/* Three election cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
          {[
            {
              year: 2011, opponent: 'Ollanta Humala',
              r1_keiko: 23.6,
              keiko_r2: 48.55, opp_r2: 51.45,
              keiko_votes: '7.49M', margin_votes: '447,057', margin_pp: 2.90,
              antivoto_keiko: 35, antivoto_opp: null, antivoto_src: 'Ipsos Apoyo (est. campaña)',
              polls_avg_keiko: 51.8, polls_note: 'Todas predijeron victoria Keiko',
              best_pollster: 'Ipsos (−2.9 pp)',
              context: 'Humala unió al electorado antifujimorista en la última semana, fuera de la ventana publicable.',
            },
            {
              year: 2016, opponent: 'Pedro Pablo Kuczynski (PPK)',
              r1_keiko: 39.9,
              keiko_r2: 49.88, opp_r2: 50.12,
              keiko_votes: '8.55M', margin_votes: '42,597', margin_pp: 0.25,
              antivoto_keiko: 43, antivoto_opp: 38, antivoto_src: 'Ipsos (may 2016)',
              polls_avg_keiko: 52.2, polls_note: 'Todas predijeron victoria Keiko (4–8 pp)',
              best_pollster: 'Datum (≈0.1 pp)',
              context: 'Escándalo Odebrecht estalló durante la semana de veda. Datum fue el único en mostrar empate técnico.',
            },
            {
              year: 2021, opponent: 'Pedro Castillo',
              r1_keiko: 13.4,
              keiko_r2: 49.88, opp_r2: 50.13,
              keiko_votes: '8.79M', margin_votes: '44,058', margin_pp: 0.25,
              antivoto_keiko: 45, antivoto_opp: 41, antivoto_src: 'Ipsos (may 30, 2021)',
              polls_avg_keiko: 49.7, polls_note: 'Empate técnico en encuestas (~49.7%)',
              best_pollster: 'IEP (0.2 pp)',
              context: 'Ipsos boca de urna llamó la victoria a Keiko; el voto rural contado al final dio vuelta el resultado.',
            },
          ].map(e => (
            <div key={e.year} style={{ background: '#F7F4EF', borderRadius: 10, padding: 14 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <span style={{ color: '#1C1917', fontWeight: 700, fontSize: 14 }}>{e.year}</span>
                  <span style={{ color: '#78716C', fontSize: 12, marginLeft: 8 }}>vs. {e.opponent}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#DC2626', fontWeight: 600, fontSize: 12 }}>
                    Perdió por {e.margin_votes} votos
                  </div>
                  <div style={{ color: '#A8A29E', fontSize: 11 }}>{e.margin_pp.toFixed(2)} pp</div>
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                {/* Result */}
                <div style={{ background: '#FFFFFF', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: '#A8A29E', fontSize: 10, marginBottom: 3 }}>Resultado R2</div>
                  <div style={{ color: KEIKO_COLOR, fontWeight: 700, fontSize: 13 }}>{e.keiko_r2}%</div>
                  <div style={{ color: '#78716C', fontSize: 11 }}>vs {e.opp_r2}% oponente</div>
                  <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 2 }}>{e.keiko_votes} votos</div>
                </div>
                {/* Anti-vote */}
                <div style={{ background: '#FFFFFF', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: '#A8A29E', fontSize: 10, marginBottom: 3 }}>Antivoto Keiko</div>
                  <div style={{ color: '#DC2626', fontWeight: 700, fontSize: 13 }}>{e.antivoto_keiko}%</div>
                  {e.antivoto_opp != null
                    ? <div style={{ color: '#78716C', fontSize: 11 }}>vs {e.antivoto_opp}% oponente</div>
                    : <div style={{ color: '#A8A29E', fontSize: 11 }}>oponente: s/d</div>
                  }
                  <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 2 }}>{e.antivoto_src}</div>
                </div>
                {/* Polls */}
                <div style={{ background: '#FFFFFF', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: '#A8A29E', fontSize: 10, marginBottom: 3 }}>Encuestas daban</div>
                  <div style={{ color: KEIKO_COLOR, fontWeight: 700, fontSize: 13 }}>{e.polls_avg_keiko}% Keiko</div>
                  <div style={{ color: '#78716C', fontSize: 11 }}>{e.polls_note}</div>
                  <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 2 }}>más preciso: {e.best_pollster}</div>
                </div>
              </div>

              {/* Context note */}
              <div style={{ color: '#78716C', fontSize: 11, lineHeight: 1.5, fontStyle: 'italic' }}>
                {e.context}
              </div>
            </div>
          ))}
        </div>

        {/* Pollster accuracy table */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#78716C', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Precisión histórica de encuestadoras en R2 (error vs resultado oficial)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F0EDE8' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: '#78716C', fontWeight: 600 }}>Encuestadora</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', color: '#78716C', fontWeight: 600 }}>2011</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', color: '#78716C', fontWeight: 600 }}>2016</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', color: '#78716C', fontWeight: 600 }}>2021</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', color: '#78716C', fontWeight: 600 }}>Prom. error abs.</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Datum',  e2011: +3.8, e2016: +0.1,  e2021: -0.4, avg: 1.4 },
                  { name: 'IEP',    e2011: null, e2016: null,  e2021: +0.2, avg: 0.2, note: '*' },
                  { name: 'CIT',    e2011: null, e2016: null,  e2021: +0.3, avg: 0.3, note: '*' },
                  { name: 'Ipsos',  e2011: +2.9, e2016: +2.7,  e2021: -1.0, avg: 2.2 },
                  { name: 'GfK',    e2011: null, e2016: +2.3,  e2021: null, avg: 2.3, note: '*' },
                  { name: 'CPI',    e2011: +3.3, e2016: +4.3,  e2021: -0.4, avg: 2.7 },
                ].map((row, i) => {
                  const fmt = (v) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + ' pp';
                  const errColor = (v) => v == null ? '#A8A29E' : Math.abs(v) <= 0.5 ? '#16A34A' : Math.abs(v) <= 2.0 ? '#D97706' : '#DC2626';
                  return (
                    <tr key={row.name} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#F7F4EF' }}>
                      <td style={{ padding: '6px 10px', color: '#1C1917', fontWeight: 500 }}>
                        {row.name}{row.note && <span style={{ color: '#A8A29E', fontSize: 10 }}>{row.note}</span>}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: errColor(row.e2011) }}>{fmt(row.e2011)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: errColor(row.e2016) }}>{fmt(row.e2016)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: errColor(row.e2021) }}>{fmt(row.e2021)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: errColor(row.avg), fontWeight: 600 }}>{row.avg.toFixed(1)} pp</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 6 }}>
            Error = encuesta final − resultado oficial (en % votos válidos de Keiko). Positivo = sobreestimó a Keiko. * = solo un R2 disponible.
          </div>
        </div>

        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          Keiko ha llegado a segunda vuelta <strong>tres veces</strong> y ha perdido las tres.
          En 2016 y 2021 la diferencia fue de menos de 45,000 votos (~0.25 pp), las dos elecciones más reñidas de la historia peruana.
          Datum registra el menor error histórico en R2 (1.4 pp promedio); CPI el mayor (2.7 pp, tendió a sobreestimar a Keiko).
          Sánchez muestra un perfil geográfico similar al de Castillo (2021): dominante en sierra y selva, débil en Lima.
        </p>
      </div>

      {/* Conclusión dinámica */}
      {predictions?.candidates?.length > 0 && (() => {
        const keiko = predictions.candidates.find(c => c.candidate?.includes('Keiko') || c.candidate?.includes('Fujimori'));
        const sanchez = predictions.candidates.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));
        if (!keiko || !sanchez) return null;
        const margin = Math.abs(keiko.prob_win - sanchez.prob_win);
        const leader = keiko.prob_win >= sanchez.prob_win ? keiko : sanchez;
        const leaderName = leader.candidate.split(' ').pop();
        let conclusion;
        if (margin < 15) {
          conclusion = `El modelo proyecta una carrera muy reñida: la diferencia de ${margin.toFixed(0)}pp entre ambos candidatos indica que el resultado está dentro del margen de incertidumbre del modelo. El antivoto, la geografía y la movilización serán determinantes.`;
        } else {
          conclusion = `Según el modelo, ${leaderName} tiene una ventaja de ${margin.toFixed(0)}pp en probabilidad de ganar. El historial de elecciones reñidas en Perú y los niveles de antivoto de ambos candidatos hacen que esa ventaja no sea garantía de resultado.`;
        }
        return (
          <div style={{
            background: '#F7F4EF', border: '1px solid #E5E0D8',
            borderLeft: '4px solid #1D4ED8', borderRadius: '0 12px 12px 0', padding: '16px 20px',
          }}>
            <div style={{ color: '#1D4ED8', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Conclusión del modelo
            </div>
            <p style={{ color: '#1C1917', fontSize: 13, lineHeight: 1.7, margin: 0 }}>{conclusion}</p>
          </div>
        );
      })()}
    </div>
  );
}
