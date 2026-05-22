import { useState, Component } from 'react';
import { useElectionData } from './hooks/useElectionData';
import Header from './components/Header';
import TabNav from './components/TabNav';
import DashboardTab from './components/tabs/DashboardTab';
import PrimeraVueltaTab from './components/tabs/PrimeraVueltaTab';
import SegundaVueltaTab from './components/tabs/SegundaVueltaTab';
import MetodologiaTab from './components/tabs/MetodologiaTab';
import BacktestingTab from './components/tabs/BacktestingTab';
import { Loader2 } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#DC2626' }}>
          <h2 style={{ marginBottom: 8, color: '#1C1917' }}>Error en el dashboard</h2>
          <p style={{ color: '#78716C', fontSize: 14 }}>{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              marginTop: 16, background: '#1D4ED8', color: '#FFFFFF', border: 'none',
              borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600
            }}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { status, predictions, r1predictions, polymarket, polls, r2polls, antivoto, loading, error, lastUpdated, refresh } = useElectionData();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Header status={status} predictions={predictions} />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Banner FOTO FINAL R2 — visible solo cuando el modelo de segunda vuelta está congelado */}
      {predictions?.is_frozen && (
        <div style={{
          background: '#FFFBEB', borderBottom: '2px solid #F59E0B',
          padding: '16px 20px', textAlign: 'center',
        }}>
          <div style={{ color: '#92400E', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            FOTO FINAL DEL MODELO — 7 de junio de 2026, 6:00pm Lima
          </div>
          <div style={{ color: '#A16207', fontSize: 13, lineHeight: 1.5 }}>
            El modelo segunda vuelta se ha detenido. Esta predicción será evaluada contra los resultados oficiales de la ONPE.
          </div>
          {predictions.frozen_at && (
            <div style={{ color: '#B45309', fontSize: 11, marginTop: 6 }}>
              Congelado: {new Date(predictions.frozen_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
            </div>
          )}
        </div>
      )}

      <main aria-label="Contenido principal" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>
        {loading && (
          <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Loader2 size={24} style={{ color: '#1D4ED8', animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div style={{ color: '#78716C', fontSize: 14 }}>Conectando con el servidor de predicciones</div>
          </div>
        )}

        {error && !loading && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
            padding: '10px 16px', marginBottom: 16, color: '#DC2626', fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>{error}</span>
            <button onClick={refresh} style={{
              background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6,
              padding: '10px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 500, minHeight: 44
            }}>Reintentar</button>
          </div>
        )}

        {!loading && (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab predictions={predictions} polymarket={polymarket} polls={polls} status={status} />
            )}
            {activeTab === 'primera' && (
              <PrimeraVueltaTab predictions={r1predictions} polls={polls} onNavigate={setActiveTab} />
            )}
            {activeTab === 'segunda' && (
              <SegundaVueltaTab predictions={predictions} polymarket={polymarket} r2polls={r2polls} antivoto={antivoto} />
            )}
            {activeTab === 'metodologia' && (
              <MetodologiaTab r2polls={r2polls} />
            )}
            {activeTab === 'backtesting' && (
              <BacktestingTab />
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          textAlign: 'center', padding: '32px 0 16px', borderTop: '1px solid #E5E0D8', marginTop: 32
        }}>
          {lastUpdated && (
            <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 8 }}>
              Última actualización: {lastUpdated.toLocaleString('es-PE', { timeZone: 'America/Lima' })}
            </div>
          )}
          <div style={{ color: '#8C877F', fontSize: 12 }}>
            Modelo v2.0 — Alonso Ternero + Claude — Segunda vuelta Junio 2026
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
