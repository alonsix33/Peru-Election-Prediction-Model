import { useState, useEffect, useCallback } from 'react';
import { getPartyColor } from '../../config/partyColors';
import WinProbabilityNeedle from '../WinProbabilityNeedle';
import PeruDeptMap from '../PeruDeptMap';
import ElectionNightEvolutionChart from '../ElectionNightEvolutionChart';

const KEIKO_COLOR   = getPartyColor('Keiko Fujimori').primary;           // #F97316
const SANCHEZ_COLOR = getPartyColor('Roberto Sánchez Palomino').primary; // #16A34A
const API_BASE      = import.meta.env.VITE_API_URL || '';

let _liveDataCache = null;

// ─── Demo data (R1 2026) ──────────────────────────────────────
const DEMO = {
  national: {
    kf_r2_share:      58.81,
    proj_kf_r2_share: 58.81,
    ci_low:           57.5,
    ci_high:          60.1,
    pct_actas:        100,
    kf_votos:         2_877_678,
    rsp_votos:        2_015_114,
  },
  nacional:    { kf_r2_share: 58.46, kf_votos: 2_825_224, rsp_votos: 2_007_120 },
  extranjero:  { kf_r2_share: 86.78, kf_votos: 52_454,    rsp_votos: 7_994, pct_actas: 100 },
  pct_actas:   100,
  is_demo:     true,
};

const DEMO_DEPTS = {
  '010000': { ubigeo: '010000', nombre: 'AMAZONAS',      kf_r2_share: 32.38, pct_actas: 100 },
  '020000': { ubigeo: '020000', nombre: 'ÁNCASH',        kf_r2_share: 54.54, pct_actas: 100 },
  '030000': { ubigeo: '030000', nombre: 'APURÍMAC',      kf_r2_share: 14.38, pct_actas: 100 },
  '040000': { ubigeo: '040000', nombre: 'AREQUIPA',      kf_r2_share: 42.06, pct_actas: 100 },
  '050000': { ubigeo: '050000', nombre: 'AYACUCHO',      kf_r2_share: 20.52, pct_actas: 100 },
  '060000': { ubigeo: '060000', nombre: 'CAJAMARCA',     kf_r2_share: 24.92, pct_actas: 100 },
  '240000': { ubigeo: '240000', nombre: 'CALLAO',        kf_r2_share: 87.30, pct_actas: 100 },
  '070000': { ubigeo: '070000', nombre: 'CUSCO',         kf_r2_share: 21.17, pct_actas: 100 },
  '080000': { ubigeo: '080000', nombre: 'HUANCAVELICA',  kf_r2_share: 14.02, pct_actas: 100 },
  '090000': { ubigeo: '090000', nombre: 'HUÁNUCO',       kf_r2_share: 34.11, pct_actas: 100 },
  '100000': { ubigeo: '100000', nombre: 'ICA',           kf_r2_share: 72.46, pct_actas: 100 },
  '110000': { ubigeo: '110000', nombre: 'JUNÍN',         kf_r2_share: 58.14, pct_actas: 100 },
  '120000': { ubigeo: '120000', nombre: 'LA LIBERTAD',   kf_r2_share: 68.16, pct_actas: 100 },
  '130000': { ubigeo: '130000', nombre: 'LAMBAYEQUE',    kf_r2_share: 71.08, pct_actas: 100 },
  '140000': { ubigeo: '140000', nombre: 'LIMA',          kf_r2_share: 84.53, pct_actas: 100 },
  '150000': { ubigeo: '150000', nombre: 'LORETO',        kf_r2_share: 74.20, pct_actas: 100 },
  '160000': { ubigeo: '160000', nombre: 'MADRE DE DIOS', kf_r2_share: 36.62, pct_actas: 100 },
  '170000': { ubigeo: '170000', nombre: 'MOQUEGUA',      kf_r2_share: 33.96, pct_actas: 100 },
  '180000': { ubigeo: '180000', nombre: 'PASCO',         kf_r2_share: 50.27, pct_actas: 100 },
  '190000': { ubigeo: '190000', nombre: 'PIURA',         kf_r2_share: 70.97, pct_actas: 100 },
  '200000': { ubigeo: '200000', nombre: 'PUNO',          kf_r2_share: 13.52, pct_actas: 100 },
  '210000': { ubigeo: '210000', nombre: 'SAN MARTÍN',    kf_r2_share: 49.28, pct_actas: 100 },
  '220000': { ubigeo: '220000', nombre: 'TACNA',         kf_r2_share: 36.51, pct_actas: 100 },
  '230000': { ubigeo: '230000', nombre: 'TUMBES',        kf_r2_share: 83.01, pct_actas: 100 },
  '250000': { ubigeo: '250000', nombre: 'UCAYALI',       kf_r2_share: 69.76, pct_actas: 100 },
};

// ─── StatusBar ────────────────────────────────────────────────
function StatusBar({ pct_actas, snapshot_ts, isDemo, shiftGranularity }) {
  const ts = snapshot_ts
    ? new Date(snapshot_ts).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    : null;

  const granLabel = shiftGranularity === 'district'  ? 'distrito'
                  : shiftGranularity === 'province'  ? 'provincia'
                  : shiftGranularity === 'dept'      ? 'departamento'
                  : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: isDemo ? '#FFFBEB' : '#F0FDF4',
      border: `1px solid ${isDemo ? '#FCD34D' : '#86EFAC'}`,
      borderRadius: 8, padding: '8px 14px', fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color: isDemo ? '#92400E' : '#15803D', display: 'flex', alignItems: 'center', gap: 5 }}>
        {isDemo ? 'DEMO · Datos R1 2026' : (
          <><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />EN VIVO</>
        )}
      </span>
      {pct_actas != null && (
        <>
          <span style={{ color: '#D4CEC8' }}>·</span>
          <span style={{ color: '#1C1917', fontWeight: 600 }}>{pct_actas.toFixed(1)}% de actas procesadas</span>
        </>
      )}
      {ts && (
        <>
          <span style={{ color: '#D4CEC8' }}>·</span>
          <span style={{ color: '#78716C' }}>Último snapshot: {ts} PET</span>
        </>
      )}
      {granLabel && (
        <>
          <span style={{ color: '#D4CEC8' }}>·</span>
          <span style={{
            background: '#DCFCE7', color: '#15803D',
            borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600,
          }}>
            proyección por {granLabel}
          </span>
        </>
      )}
      {isDemo && (
        <span style={{ color: '#92400E', fontSize: 11 }}>— colores del mapa y tabla usan resultados reales de R1 por departamento</span>
      )}
    </div>
  );
}

// ─── Candidate summary cards ──────────────────────────────────
function CandidateCards({ kf_r2_share, proj_kf_r2_share, ci_low, ci_high, kf_votos, rsp_votos, isDemo }) {
  const rsp_r2_share  = kf_r2_share  != null ? 100 - kf_r2_share  : null;
  const proj_rsp      = proj_kf_r2_share != null ? 100 - proj_kf_r2_share : null;
  const kfLeads       = kf_r2_share >= 50;

  const fmtVotos = (v) => v != null ? v.toLocaleString('es-PE') : null;

  const card = (name, color, share, proj, votos, isLeader) => {
    const primary = proj ?? share;
    return (
      <div style={{
        flex: 1, minWidth: 200,
        background: '#FFFFFF',
        border: `2px solid ${isLeader ? color + '40' : '#E5E0D8'}`,
        borderRadius: 14, padding: '18px 20px',
        position: 'relative',
      }}>
        {isLeader && (
          <div style={{
            position: 'absolute', top: 10, right: 12,
            background: color + '15', color, borderRadius: 20,
            padding: '2px 8px', fontSize: 10, fontWeight: 700,
          }}>
            VA GANANDO
          </div>
        )}
        <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>{name}</div>

        {/* PRIMARY: projected % — the number that matters */}
        <div style={{ color, fontWeight: 800, fontSize: 38, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {primary != null ? primary.toFixed(2) + '%' : '—'}
        </div>
        <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 3 }}>
          {proj != null ? 'Proyectado al 100% de actas' : (isDemo ? 'votos válidos (baseline R1)' : 'votos válidos contabilizados')}
        </div>

        {isLeader && ci_low != null && !isDemo && (
          <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 4 }}>
            CI 90%: [{ci_low.toFixed(1)}, {ci_high.toFixed(1)}]
          </div>
        )}

        {/* SECONDARY: raw ONPE count — context only, reduced opacity */}
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0EDE8',
          display: 'flex', alignItems: 'baseline', gap: 6,
          opacity: 0.55,
        }}>
          <span style={{ color, fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
            {share != null ? share.toFixed(2) + '%' : '—'}
          </span>
          <span style={{ color: '#A8A29E', fontSize: 11 }}>
            Votos válidos{votos != null ? ` · ${fmtVotos(votos)} votos` : (isDemo ? ' (baseline R1)' : '')}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {kfLeads
        ? <>{card('Keiko Fujimori', KEIKO_COLOR, kf_r2_share, proj_kf_r2_share, kf_votos, true)}{card('Roberto Sánchez', SANCHEZ_COLOR, rsp_r2_share, proj_rsp, rsp_votos, false)}</>
        : <>{card('Roberto Sánchez', SANCHEZ_COLOR, rsp_r2_share, proj_rsp, rsp_votos, true)}{card('Keiko Fujimori', KEIKO_COLOR, kf_r2_share, proj_kf_r2_share, kf_votos, false)}</>
      }
    </div>
  );
}

// ─── Horizontal vote bars ─────────────────────────────────────
function VoteBars({ total, nacional, extranjero, isDemo }) {
  const [view, setView] = useState('total');
  const src = view === 'total' ? total : view === 'nacional' ? nacional : extranjero;

  const kfShare  = src?.kf_r2_share ?? null;
  const rspShare = kfShare != null ? 100 - kfShare : null;
  const kfLeads  = kfShare != null && kfShare >= 50;

  const bars = kfShare != null ? (
    kfLeads
      ? [{ name: 'Keiko Fujimori',  color: KEIKO_COLOR,   share: kfShare,  votos: src?.kf_votos  },
         { name: 'Roberto Sánchez', color: SANCHEZ_COLOR,  share: rspShare, votos: src?.rsp_votos }]
      : [{ name: 'Roberto Sánchez', color: SANCHEZ_COLOR,  share: rspShare, votos: src?.rsp_votos },
         { name: 'Keiko Fujimori',  color: KEIKO_COLOR,   share: kfShare,  votos: src?.kf_votos  }]
  ) : [];

  const fmtV = (v) => v != null ? v.toLocaleString('es-PE') : null;

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#1C1917', fontSize: 15, fontWeight: 600, margin: 0 }}>
          Votos emitidos{isDemo ? <span style={{ color: '#A8A29E', fontWeight: 400, fontSize: 12 }}> · Demo R1</span> : ''}
        </h3>
        <div style={{ display: 'flex', background: '#F7F4EF', borderRadius: 8, padding: 3, gap: 2 }}>
          {['total', 'nacional', 'extranjero'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? '#FFFFFF' : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              padding: '5px 14px', fontSize: 12, fontWeight: view === v ? 600 : 400,
              color: view === v ? '#1C1917' : '#78716C',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>
              {v === 'total' ? 'Total' : v === 'nacional' ? 'Nacional' : 'Extranjero'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {bars.map(b => (
          <div key={b.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
              <span style={{ color: '#1C1917', fontWeight: 600, fontSize: 13 }}>{b.name}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {b.votos != null && (
                  <span style={{ color: '#A8A29E', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtV(b.votos)} votos
                  </span>
                )}
                <span style={{ color: b.color, fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {b.share.toFixed(2)}%
                </span>
              </div>
            </div>
            <div style={{ height: 28, borderRadius: 6, background: '#F0EDE8', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${b.share}%`, height: '100%',
                background: b.color, borderRadius: 6,
                transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.12)' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', marginTop: 4, height: 14 }}>
        <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', color: '#A8A29E', fontSize: 10 }}>50%</span>
      </div>
      {view === 'total' && isDemo && (
        <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 8 }}>
          Total R1: KF 2,877,678 votos · RSP 2,015,114 votos (ONPE oficial).
        </div>
      )}
      {view === 'extranjero' && isDemo && (
        <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 8 }}>
          Extranjero R1: 77 países · 52,454 votos KF / 7,994 votos RSP. KF dominó en todos los continentes.
        </div>
      )}
    </div>
  );
}

// ─── Shared shift badge ───────────────────────────────────────
function ShiftBadge({ shift_pp }) {
  if (shift_pp == null) return null;
  const abs  = Math.abs(shift_pp);
  if (abs < 0.05) return <span style={{ color: '#A8A29E', fontSize: 10 }}>±0pp</span>;
  const pos  = shift_pp > 0;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      color: pos ? KEIKO_COLOR : SANCHEZ_COLOR,
      background: (pos ? KEIKO_COLOR : SANCHEZ_COLOR) + '12',
      borderRadius: 4, padding: '1px 5px',
    }}>
      {pos ? '+' : ''}{shift_pp.toFixed(1)}pp
    </span>
  );
}

// ─── Shared result row (province or district) ─────────────────
function ResultRow({ nombre, kf_r2_share, shift_pp, onClick, isClickable }) {
  const kfLeads  = kf_r2_share != null && kf_r2_share >= 50;
  const rspShare = kf_r2_share != null ? 100 - kf_r2_share : null;
  const margin   = kf_r2_share != null ? Math.abs(kf_r2_share - rspShare) : null;
  const winner   = kfLeads ? 'K' : 'S';
  const color    = kfLeads ? KEIKO_COLOR : SANCHEZ_COLOR;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 0', borderBottom: '1px solid #F7F4EF', gap: 6,
        cursor: isClickable ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        {isClickable && (
          <span style={{ color: '#D4CEC8', fontSize: 11, flexShrink: 0 }}>›</span>
        )}
        <span style={{ color: '#1C1917', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nombre}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {shift_pp != null && <ShiftBadge shift_pp={shift_pp} />}
        {kf_r2_share != null ? (
          <span style={{ color, fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {winner}+{margin.toFixed(1)}pp
          </span>
        ) : (
          <span style={{ color: '#A8A29E', fontSize: 12 }}>Sin datos</span>
        )}
      </div>
    </div>
  );
}

// ─── Department detail panel ──────────────────────────────────
function DeptDetailPanel({ dept, r1Districts, r1Loading, liveProvinces, liveDistricts, isLive }) {
  const [selectedProv, setSelectedProv] = useState(null);

  useEffect(() => { setSelectedProv(null); }, [dept?.ubigeo]);

  if (!dept) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 220, gap: 8 }}>
        <div style={{ color: '#D4CEC8', fontSize: 28 }}>↖</div>
        <p style={{ color: '#A8A29E', fontSize: 13, textAlign: 'center', margin: 0 }}>
          Haz clic en un departamento para ver el desglose
        </p>
      </div>
    );
  }

  const kf      = dept.kf_r2_share;
  const rsp     = kf != null ? 100 - kf : null;
  const margin  = kf != null ? Math.abs(kf - rsp) : null;
  const kfLeads = kf != null && kf >= 50;

  const deptHeader = (
    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #F0EDE8' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 10 }}>
        {dept.nombre}
      </div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 8 }}>
        <div>
          <div style={{ color: '#8C877F', fontSize: 10, marginBottom: 2 }}>Keiko Fujimori</div>
          <div style={{ color: kfLeads ? KEIKO_COLOR : '#A8A29E', fontWeight: kfLeads ? 800 : 400, fontSize: 24, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {kf != null ? kf.toFixed(1) + '%' : '—'}
          </div>
        </div>
        <div>
          <div style={{ color: '#8C877F', fontSize: 10, marginBottom: 2 }}>Roberto Sánchez</div>
          <div style={{ color: !kfLeads ? SANCHEZ_COLOR : '#A8A29E', fontWeight: !kfLeads ? 800 : 400, fontSize: 24, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {rsp != null ? rsp.toFixed(1) + '%' : '—'}
          </div>
        </div>
      </div>
      {margin != null && (
        <div style={{ display: 'inline-block', background: (kfLeads ? KEIKO_COLOR : SANCHEZ_COLOR) + '18', color: kfLeads ? KEIKO_COLOR : SANCHEZ_COLOR, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
          {kfLeads ? 'Keiko' : 'Sánchez'} +{margin.toFixed(1)}pp
        </div>
      )}
    </div>
  );

  // ── Live mode: province drill-down ─────────────────────────
  const deptProvs = isLive
    ? liveProvinces
        .filter(p => p.deptUbigeo === dept.ubigeo)
        .sort((a, b) => Math.abs(b.kf_r2_share - 50) - Math.abs(a.kf_r2_share - 50))
    : [];

  if (isLive && selectedProv) {
    const provDists = liveDistricts
      .filter(d => d.provUbigeo === selectedProv.ubigeo)
      .sort((a, b) => Math.abs(b.kf_r2_share - 50) - Math.abs(a.kf_r2_share - 50));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {deptHeader}
        <button
          onClick={() => setSelectedProv(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: '#78716C', fontSize: 11, padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Provincias · {selectedProv.nombre}
        </button>
        <div style={{ color: '#8C877F', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
          Distritos ({provDists.length}){provDists.length === 0 ? ' — sin datos aún' : ' · por margen'}
        </div>
        <div style={{ overflowY: 'auto', flex: 1, maxHeight: 300 }}>
          {provDists.length > 0 ? provDists.map(d => (
            <ResultRow key={d.ubigeo} nombre={d.nombre} kf_r2_share={d.kf_r2_share} shift_pp={d.shift_pp} isClickable={false} />
          )) : (
            <div style={{ color: '#A8A29E', fontSize: 12 }}>Los distritos de esta provincia aún no reportan.</div>
          )}
        </div>
      </div>
    );
  }

  if (isLive && deptProvs.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {deptHeader}
        <div style={{ color: '#8C877F', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
          Provincias ({deptProvs.length}) · haz clic para ver distritos
        </div>
        <div style={{ overflowY: 'auto', flex: 1, maxHeight: 320 }}>
          {deptProvs.map(p => (
            <ResultRow
              key={p.ubigeo}
              nombre={p.nombre}
              kf_r2_share={p.kf_r2_share}
              shift_pp={p.shift_pp}
              isClickable={true}
              onClick={() => setSelectedProv(p)}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Demo mode or live but no province data yet ──────────────
  const demoSorted = [...r1Districts].sort((a, b) => {
    if (a.kf_r2_share == null && b.kf_r2_share == null) return 0;
    if (a.kf_r2_share == null) return 1;
    if (b.kf_r2_share == null) return -1;
    return Math.abs(b.kf_r2_share - 50) - Math.abs(a.kf_r2_share - 50);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {deptHeader}
      {r1Loading ? (
        <div style={{ color: '#A8A29E', fontSize: 12, padding: '8px 0' }}>Cargando distritos...</div>
      ) : demoSorted.length > 0 ? (
        <>
          <div style={{ color: '#8C877F', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            Distritos ({demoSorted.length}) · {isLive ? 'baseline R1' : 'resultados R1'} · por margen
          </div>
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: 320 }}>
            {demoSorted.map(d => (
              <ResultRow key={d.ubigeo} nombre={d.nombre} kf_r2_share={d.kf_r2_share} shift_pp={null} isClickable={false} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ color: '#A8A29E', fontSize: 12 }}>Sin desglose distrital disponible</div>
      )}
    </div>
  );
}

// ─── Department table ─────────────────────────────────────────
function DeptTable({ deptData, extranjero, isDemo }) {
  const [sortBy, setSortBy] = useState('pct_actas');

  const extRow = extranjero ? {
    ubigeo: 'EXT', nombre: 'Extranjero',
    kf_r2_share: extranjero.kf_r2_share,
    pct_actas:   extranjero.pct_actas ?? 100,
    isExtranjero: true, subLabel: '77 países',
  } : null;

  const rows = [
    ...Object.values(deptData),
    ...(extRow ? [extRow] : []),
  ].sort((a, b) => {
    if (sortBy === 'pct_actas') return (a.pct_actas ?? 0) - (b.pct_actas ?? 0);
    if (sortBy === 'margin')    return Math.abs((b.kf_r2_share ?? 50) - 50) - Math.abs((a.kf_r2_share ?? 50) - 50);
    return a.nombre.localeCompare(b.nombre);
  });

  const colBtn = (key, label) => (
    <button onClick={() => setSortBy(key)} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
      color: sortBy === key ? '#1C1917' : '#A8A29E',
      fontWeight: sortBy === key ? 700 : 500, fontSize: 11,
    }}>
      {label}{sortBy === key ? (key === 'margin' ? ' ↓' : ' ↑') : ''}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#8C877F', fontSize: 11 }}>Ordenar:</span>
        {colBtn('pct_actas', 'Menos contado primero')}
        {colBtn('margin', 'Mayor margen')}
        {colBtn('nombre', 'A-Z')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E0D8' }}>
              <th style={{ textAlign: 'left',  padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>Departamento</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>% contado</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: KEIKO_COLOR,   fontWeight: 600 }}>Keiko v.v.</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: SANCHEZ_COLOR, fontWeight: 600 }}>Sánchez v.v.</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(dept => {
              const share    = dept.kf_r2_share;
              const rspShare = share != null ? 100 - share : null;
              const margin   = share != null ? Math.abs(share - rspShare).toFixed(1) : null;
              const kfLeads  = share != null && share >= 50;
              const pct      = dept.pct_actas ?? null;
              return (
                <tr key={dept.ubigeo} style={{ borderBottom: '1px solid #F0EDE8', background: dept.isExtranjero ? '#F7F4EF' : undefined }}>
                  <td style={{ padding: '7px 8px', color: dept.isExtranjero ? '#78716C' : '#1C1917', fontWeight: 600, fontStyle: dept.isExtranjero ? 'italic' : 'normal' }}>
                    {dept.nombre}
                    {dept.subLabel && <span style={{ color: '#A8A29E', fontSize: 10, marginLeft: 5, fontWeight: 400, fontStyle: 'normal' }}>{dept.subLabel}</span>}
                    {!dept.isExtranjero && pct != null && pct < 100 && <span style={{ color: '#D97706', fontSize: 10, marginLeft: 5, fontWeight: 400 }}>⏳ {(100 - pct).toFixed(0)}% falta</span>}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E5E0D8', overflow: 'hidden' }}>
                        <div style={{ width: `${pct ?? 0}%`, height: '100%', background: (pct ?? 0) >= 100 ? '#16A34A' : '#D97706', borderRadius: 2 }} />
                      </div>
                      <span style={{ color: '#78716C', fontVariantNumeric: 'tabular-nums' }}>{pct != null ? pct.toFixed(0) + '%' : '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: kfLeads ? KEIKO_COLOR : '#A8A29E', fontWeight: kfLeads ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {share != null ? share.toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: !kfLeads ? SANCHEZ_COLOR : '#A8A29E', fontWeight: !kfLeads ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {rspShare != null ? rspShare.toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: kfLeads ? KEIKO_COLOR : SANCHEZ_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {margin != null ? `${kfLeads ? 'K' : 'S'}+${margin}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isDemo && (
        <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 6 }}>
          Demo: resultados R1 reales por departamento. El 7J se reemplazan por el conteo ONPE en tiempo real.
        </div>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────
export default function LiveResultsTab({ predictions }) {
  const [liveData,         setLiveData]         = useState(_liveDataCache);
  const [isLive,           setIsLive]           = useState(_liveDataCache !== null);
  const [hoveredDept,      setHoveredDept]      = useState(null);
  const [selectedDept,     setSelectedDept]     = useState(null);
  const [r1DistrictData,   setR1DistrictData]   = useState(null);
  const [r1DistLoading,    setR1DistLoading]    = useState(false);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/live-projection`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.status === 'ok') { _liveDataCache = json; setLiveData(json); setIsLive(true); }
    } catch { /* stay in demo */ }
  }, []);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, 30_000);
    return () => clearInterval(id);
  }, [fetchLive]);

  // Lazy-load R1 district baseline for demo mode (and live fallback)
  useEffect(() => {
    if (!selectedDept || r1DistrictData) return;
    setR1DistLoading(true);
    fetch('/r1_districts_flat.json')
      .then(r => r.json())
      .then(json => { setR1DistrictData(json); setR1DistLoading(false); })
      .catch(() => setR1DistLoading(false));
  }, [selectedDept]); // r1DistrictData intentionally omitted

  const isDemo = !isLive;
  const data   = isLive ? liveData : DEMO.national;

  const kfShare     = data?.kf_r2_share;
  const projKfShare = data?.proj_kf_r2_share;
  const deptData    = isLive && liveData?.departments
    ? Object.fromEntries(liveData.departments.map(d => [d.ubigeo, d]))
    : DEMO_DEPTS;

  const liveProvinces  = liveData?.provinces  || [];
  const liveDistricts  = liveData?.districts  || [];
  const shiftGranularity = liveData?.shift_granularity ?? null;

  // Needle
  const modelCands   = predictions?.candidates || [];
  const keikoModel   = modelCands.find(c => c.candidate?.includes('Keiko'));
  const sanchezModel = modelCands.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));
  const needleKeiko  = isDemo ? keikoModel : (projKfShare != null ? {
    mean: projKfShare,
    p10:  data.ci_low  ?? projKfShare - 3,
    p90:  data.ci_high ?? projKfShare + 3,
    p25: null, p40: null, p60: null, p75: null,
    prob_win: liveData?.prob_win_kf ?? (projKfShare > 50 ? 72 : 28),
  } : null);
  const needleSanchez = isDemo ? sanchezModel : (needleKeiko ? {
    mean:     100 - needleKeiko.mean,
    p10:      100 - needleKeiko.p90,
    p25:      needleKeiko.p75 != null ? 100 - needleKeiko.p75 : null,
    p40:      needleKeiko.p60 != null ? 100 - needleKeiko.p60 : null,
    p60:      needleKeiko.p40 != null ? 100 - needleKeiko.p40 : null,
    p75:      needleKeiko.p25 != null ? 100 - needleKeiko.p25 : null,
    p90:      100 - needleKeiko.p10,
    prob_win: liveData?.prob_win_kf != null ? 100 - liveData.prob_win_kf : 100 - needleKeiko.prob_win,
  } : null);

  const nacional   = isLive ? liveData?.nacional   : DEMO.nacional;
  const extranjero = isLive ? liveData?.extranjero  : DEMO.extranjero;

  // R1 districts for selected dept (demo fallback)
  const r1DeptDistricts = selectedDept && r1DistrictData
    ? Object.values(r1DistrictData).filter(
        d => d.deptUbigeo === selectedDept.ubigeo && d.kf_r2_share != null
      )
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ color: '#1C1917', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
          Resultados en Vivo · 7 de junio de 2026
        </h2>
        <p style={{ color: '#78716C', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Proyección a 100% de actas en tiempo real. Nueva data cada ~2 minutos durante el conteo.
        </p>
      </div>

      <StatusBar
        pct_actas={data?.pct_actas}
        snapshot_ts={liveData?.snapshot_ts}
        isDemo={isDemo}
        shiftGranularity={isLive ? shiftGranularity : null}
      />

      <CandidateCards
        kf_r2_share={kfShare}
        proj_kf_r2_share={projKfShare}
        ci_low={data?.ci_low}
        ci_high={data?.ci_high}
        kf_votos={data?.kf_votos}
        rsp_votos={data?.rsp_votos}
        isDemo={isDemo}
      />

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 14, padding: '24px 16px 20px' }}>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', marginBottom: 4 }}>
          {isDemo ? 'Proyección pre-electoral · Modelo R2' : 'Proyección a 100% · Conteo en vivo'}
        </div>
        <WinProbabilityNeedle keiko={needleKeiko} sanchez={needleSanchez} />
      </div>

      <ElectionNightEvolutionChart history={isLive ? liveData?.history : null} />

      <VoteBars
        total={isLive ? liveData?.national : DEMO.national}
        nacional={nacional}
        extranjero={extranjero}
        isDemo={isDemo}
      />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          flex: '0 0 auto', width: 'clamp(280px, 42%, 400px)',
          background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16,
        }}>
          <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Mapa por departamento
            {hoveredDept && (
              <span style={{ color: '#A8A29E', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                · {hoveredDept.nombre}
              </span>
            )}
          </h3>
          <PeruDeptMap
            deptData={deptData}
            onDeptHover={setHoveredDept}
            onDeptSelect={setSelectedDept}
          />
        </div>

        <div style={{ flex: 1, minWidth: 260, background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
          <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Detalle departamental
          </h3>
          <DeptDetailPanel
            dept={selectedDept}
            r1Districts={r1DeptDistricts}
            r1Loading={r1DistLoading}
            liveProvinces={liveProvinces}
            liveDistricts={liveDistricts}
            isLive={isLive}
          />
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
        <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
          Resultados Detallados
        </h3>
        <DeptTable deptData={deptData} extranjero={extranjero} isDemo={isDemo} />
      </div>
    </div>
  );
}
