import { useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { getPartyColor } from '../config/partyColors';

const KEIKO_COLOR_RGB   = '249, 115, 22';  // #F97316
const SANCHEZ_COLOR_RGB = '22, 163, 74';   // #16A34A
const GEO_URL = '/peru_dept.geojson';

// FIRST_IDDP "01" → ubigeo prefix "01" → matches our "010000"
function getDeptData(geoProps, deptData) {
  const id = geoProps.FIRST_IDDP; // "01".."25"
  return Object.values(deptData).find(d => d.ubigeo.slice(0, 2) === id) || null;
}

function getFillColor(kf_r2_share) {
  if (kf_r2_share == null) return '#E5E0D8';
  const margin  = Math.abs(kf_r2_share - 50);
  const opacity = Math.min(0.92, margin / 25 * 0.77 + 0.15);
  const rgb = kf_r2_share >= 50 ? KEIKO_COLOR_RGB : SANCHEZ_COLOR_RGB;
  return `rgba(${rgb}, ${opacity.toFixed(2)})`;
}

export default function PeruDeptMap({ deptData, onDeptHover }) {
  const [tooltip, setTooltip] = useState(null); // { x, y, dept }

  const handleMouseMove = (geo, evt) => {
    const data = getDeptData(geo.properties, deptData);
    const rect  = evt.currentTarget.closest('svg')?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
      dept: {
        nombre: geo.properties.NOMBDEP,
        ...data,
      },
    });
    onDeptHover?.(data);
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    onDeptHover?.(null);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-75, -9], scale: 1050 }}
        width={400}
        height={520}
        style={{ width: '100%', height: 'auto' }}
      >
        <ZoomableGroup zoom={1} minZoom={1} maxZoom={6}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const data  = getDeptData(geo.properties, deptData);
                const share = data?.kf_r2_share ?? null;
                const fill  = getFillColor(share);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth={0.6}
                    style={{
                      default:  { outline: 'none', cursor: 'pointer' },
                      hover:    { outline: 'none', filter: 'brightness(1.12)', cursor: 'pointer' },
                      pressed:  { outline: 'none' },
                    }}
                    onMouseMove={(evt) => handleMouseMove(geo, evt)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 12,
          top:  tooltip.y - 8,
          background: '#1C1917',
          color: '#F7F4EF',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>
            {tooltip.dept?.nombre ?? '—'}
          </div>
          {tooltip.dept?.kf_r2_share != null ? (
            <>
              <div style={{ color: tooltip.dept.kf_r2_share >= 50 ? `rgb(${KEIKO_COLOR_RGB})` : `rgb(${SANCHEZ_COLOR_RGB})` }}>
                {tooltip.dept.kf_r2_share >= 50
                  ? `Keiko ${tooltip.dept.kf_r2_share.toFixed(1)}%`
                  : `Sánchez ${(100 - tooltip.dept.kf_r2_share).toFixed(1)}%`}
              </div>
              <div style={{ color: '#A8A29E', fontSize: 11 }}>
                margen {Math.abs(tooltip.dept.kf_r2_share - 50).toFixed(1)}pp
              </div>
            </>
          ) : (
            <div style={{ color: '#A8A29E' }}>Sin datos</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 12, borderRadius: 3, background: `rgba(${SANCHEZ_COLOR_RGB}, 0.85)` }} />
          <span style={{ color: '#78716C', fontSize: 10 }}>Sánchez dominante</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 12, borderRadius: 3, background: `rgba(${SANCHEZ_COLOR_RGB}, 0.25)` }} />
          <span style={{ color: '#78716C', fontSize: 10 }}>Sánchez leve</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 12, borderRadius: 3, background: `rgba(${KEIKO_COLOR_RGB}, 0.25)` }} />
          <span style={{ color: '#78716C', fontSize: 10 }}>Keiko leve</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 12, borderRadius: 3, background: `rgba(${KEIKO_COLOR_RGB}, 0.85)` }} />
          <span style={{ color: '#78716C', fontSize: 10 }}>Keiko dominante</span>
        </div>
      </div>
    </div>
  );
}
