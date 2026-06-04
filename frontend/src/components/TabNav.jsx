const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  // { id: 'primera', label: 'Primera Vuelta' },  // hidden for R2 sharing
  { id: 'segunda', label: 'Segunda Vuelta' },
  { id: 'live', label: '7J · Resultados', highlight: true },
  { id: 'metodologia', label: 'Metodología' },
  { id: 'backtesting', label: 'Precisión' },
];

export default function TabNav({ activeTab, onTabChange }) {
  return (
    <nav role="tablist" style={{
      display: 'flex', gap: '4px', padding: '0 16px',
      background: 'transparent', borderBottom: '1px solid #E5E0D8',
      overflowX: 'auto', scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }}>
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.id)}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#1C1917'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#78716C'; }}
            style={{
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: active ? 600 : 400,
              color: active ? (tab.highlight ? '#DC2626' : '#1D4ED8') : (tab.highlight ? '#DC2626' : '#78716C'),
              background: 'transparent',
              border: 'none',
              borderBottom: active ? `2px solid ${tab.highlight ? '#DC2626' : '#1D4ED8'}` : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              transition: 'color 0.2s, border-color 0.2s',
              outline: 'none',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
