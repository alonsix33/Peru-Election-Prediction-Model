import { useState } from 'react';
import {
  Database, TrendingUp, Shuffle, Scale, AlertTriangle,
  BookOpen, ChevronRight, Layers, Zap, Shield, Eye, MapPin
} from 'lucide-react';

function PipelineStep({ icon: Icon, label, sublabel }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, maxWidth: 200,
      background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12,
      padding: 16, textAlign: 'center',
    }}>
      <Icon size={24} color="#1D4ED8" style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1917' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#78716C', marginTop: 4 }}>{sublabel}</div>
    </div>
  );
}

function StepRow({ number, title, description, isLast }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '20px 0' }}>
        <div style={{
          width: 36, height: 36, minWidth: 36, borderRadius: '50%',
          background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {number}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#78716C', lineHeight: 1.6 }}>{description}</div>
        </div>
      </div>
      {!isLast && <div style={{ height: 1, background: '#E5E0D8', marginLeft: 52 }} />}
    </div>
  );
}

function FeatureCard({ icon: Icon, iconColor, title, description }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12,
      padding: 20, flex: 1, minWidth: 200,
    }}>
      <Icon size={32} color={iconColor} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#78716C', lineHeight: 1.6 }}>{description}</div>
    </div>
  );
}

function LimitationItem({ text }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0' }}>
      <div style={{
        width: 8, height: 8, minWidth: 8, borderRadius: '50%',
        background: '#D97706', marginTop: 5,
      }} />
      <div style={{ fontSize: 13, color: '#78716C', lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

// ─── PRIMERA VUELTA ───────────────────────────────────────────
function PrimeraVueltaContent() {
  const pipelineSteps = [
    { icon: Database, label: 'Datos', sublabel: '27 encuestas + Polymarket' },
    { icon: Scale, label: 'Ponderación', sublabel: 'Peso por precisión' },
    { icon: Shuffle, label: '10,000 simulaciones', sublabel: 'Monte Carlo' },
    { icon: TrendingUp, label: 'Resultado', sublabel: 'Probabilidades' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', margin: '0 0 12px' }}>
          ¿Cómo funcionó el modelo de primera vuelta?
        </h2>
        <p style={{ fontSize: 16, color: '#78716C', lineHeight: 1.7, margin: '0 0 28px' }}>
          Para la primera vuelta del 12 de abril de 2026, combinamos 27 encuestas de 6 casas
          encuestadoras con datos de Polymarket. Luego simulamos la elección 10,000 veces.
          Esta página explica cómo lo hicimos, incluyendo los errores.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {pipelineSteps.map((step, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <PipelineStep icon={step.icon} label={step.label} sublabel={step.sublabel} />
              {i < pipelineSteps.length - 1 && <ChevronRight size={20} color="#C9C4BB" style={{ flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Layers size={20} color="#1D4ED8" />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: 0 }}>
            Paso a paso
          </h3>
        </div>
        <StepRow number={1} title="Recopilamos las encuestas"
          description="Tomamos 27 encuestas de 6 casas encuestadoras: IEP, Datum, Ipsos, CPI, CIT y CID Latinoamérica. Cada una preguntó a más de 1,200 personas en todo el Perú (urbano y rural) por quién votarían. La última encuesta incorporada fue el estudio Datum del 1-4 de abril (n=3,000, la muestra más grande del ciclo), publicada el día de inicio de la veda electoral." />
        <StepRow number={2} title="Les damos peso según su historial"
          description="No todas las encuestadoras aciertan igual. IEP tuvo el menor error absoluto medio en las elecciones de 2021, así que le damos más peso (1.25x). CID Latinoamérica es nueva en el modelo y tiene la muestra más grande (n=2,120) pero sin historial previo en elecciones peruanas (0.80x). Las encuestas más recientes también pesan más que las antiguas, con decaimiento exponencial." />
        <StepRow number={3} title="Incluimos lo que dice el mercado"
          description="Polymarket es un mercado donde la gente apuesta dinero real sobre quién va a ganar. En primera vuelta le dimos un peso de ~28% al mercado y ~72% a las encuestas. Cuando empezó la veda electoral (5 de abril), el peso del mercado subió hasta 77% el día de la elección. En retrospectiva, ese 77% fue demasiado alto: Polymarket publicaba probabilidad de ganar la presidencia entera, no el porcentaje de votos en primera vuelta, lo que infló a Keiko +12.8pp." />
        <StepRow number={4} title="Simulamos 10,000 elecciones"
          description="Corremos la elección 10,000 veces con variaciones aleatorias calibradas para la volatilidad peruana. Usamos distribuciones de cola pesada (t-Student) para capturar eventos extremos. En el 35% de las simulaciones incluimos shocks: el líder puede colapsar -5 a -15 puntos (15% de las sims), el segundo puede caer (10%), o un candidato menor puede subir fuerte como Castillo en 2021 (10%)." />
        <StepRow number={5} title="Simulamos la segunda vuelta" isLast
          description="Para las simulaciones donde ningún candidato supera el 50%, tomamos a los dos primeros y simulamos la segunda vuelta. Los votos de los eliminados se transfieren según afinidad ideológica, limitados por el rechazo definitivo de cada finalista. Si un candidato le cae mal al 63% de la población, esos votos van al voto blanco." />
      </div>

      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid #DC2626', borderRadius: '0 12px 12px 0', padding: '20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>
          Qué salió mal en primera vuelta, y qué corregimos
        </div>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>
          El mayor error fue Keiko +12.8pp. Con α=0.77 en el día electoral, Polymarket (45.5% P(ganar la presidencia)) dominó el blend. El problema es estructural: P(ganar la presidencia) no es el % de votos en primera vuelta. En carreras de N candidatos ese número siempre sobreestima al líder.
        </p>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          Sánchez llegó #2 en ONPE (12%) cuando el modelo lo tenía #5 (8.9%). Siguió el mismo patrón de Castillo 2021: base rural fuerte en zonas subrepresentadas en encuestas urbanas. Para segunda vuelta corregimos ambos problemas.
        </p>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <BookOpen size={20} color="#1D4ED8" />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: 0 }}>De dónde vienen los datos</h3>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Encuestas (6 casas, 27 encuestas)
            </div>
            {[
              { name: 'IEP', via: 'La República', weight: '1.25x' },
              { name: 'Datum', via: 'El Comercio / Cuarto Poder', weight: '1.10x' },
              { name: 'Ipsos', via: 'Perú21', weight: '1.00x' },
              { name: 'CPI', via: 'RPP Noticias', weight: '0.95x' },
              { name: 'CIT', via: 'Centro de Investigaciones Tecnológicas', weight: '0.85x' },
              { name: 'CID', via: 'CID Latinoamérica', weight: '0.80x' },
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span><span style={{ fontWeight: 600, color: '#1C1917' }}>{s.name}</span><span style={{ color: '#8C877F' }}>, {s.via}</span></span>
                <span style={{ color: '#1D4ED8', fontWeight: 500, fontSize: 12 }}>{s.weight}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Otras fuentes
            </div>
            {[
              { name: 'Polymarket', detail: 'polymarket.com ($6.3M en volumen)' },
              { name: 'ONPE', detail: 'Resultados oficiales 2021' },
              { name: 'Wikipedia', detail: 'Tracker de encuestas 2026' },
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 2 }}>
                <span style={{ fontWeight: 600, color: '#1C1917' }}>{s.name}</span>
                <span style={{ color: '#8C877F' }}>, {s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderLeft: '4px solid #1D4ED8', borderRadius: '0 12px 12px 0', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <MapPin size={16} color="#1D4ED8" />
          <h4 style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>Sesgo geográfico en las encuestas</h4>
        </div>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>
          Los datos de IEP (28-31 marzo) por macrozona revelan que Roberto Sánchez lideraba en Perú rural con 16.3% (superando a Keiko con 9.3% y Aliaga con 3.0%) y en el Oriente con 14.6%. Sin embargo, en Lima Metropolitana solo alcanzaba 1.7%. Como las muestras están ponderadas hacia Lima, su intención de voto total aparecía en 6.7%.
        </p>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>
          Este perfil geográfico es casi idéntico al de Castillo en 2021, quien llegó al 18.9% real. El 24.1% de indecisos en zonas rurales representó la mayor bolsa de volatilidad no capturada.
        </p>
        <p style={{ color: '#8C877F', fontSize: 12, margin: 0 }}>Fuente: IEP / @bernal_gallegos, campo 28-31 marzo 2026.</p>
      </div>
    </div>
  );
}

// ─── SEGUNDA VUELTA ───────────────────────────────────────────
function SegundaVueltaContent({ r2polls }) {
  const pollCount = r2polls?.polls?.length ?? null;
  const houseCount = r2polls?.polls ? new Set(r2polls.polls.map(p => p.pollster)).size : null;
  const pollSublabel = pollCount !== null
    ? `${pollCount} encuesta${pollCount !== 1 ? 's' : ''} · ${houseCount} casa${houseCount !== 1 ? 's' : ''}`
    : 'Encuestas + Polymarket';

  const pipelineSteps = [
    { icon: Database, label: 'Encuestas R2', sublabel: pollSublabel },
    { icon: Scale, label: 'Blend bayesiano', sublabel: 'Encuestas + Polymarket' },
    { icon: Shuffle, label: '10,000 simulaciones', sublabel: 'Monte Carlo' },
    { icon: TrendingUp, label: 'Resultado', sublabel: 'P(ganar) por candidato' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', margin: '0 0 12px' }}>
          ¿Cómo funciona el modelo de segunda vuelta?
        </h2>
        <p style={{ fontSize: 16, color: '#78716C', lineHeight: 1.7, margin: '0 0 28px' }}>
          Este modelo está activo hoy y se actualiza cada 30 minutos. Combina 4 encuestas de segunda vuelta con las señales de Polymarket, aplica correcciones estadísticas y simula la elección 10,000 veces. Te explicamos exactamente qué hace cada paso — sin tecnicismos.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {pipelineSteps.map((step, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <PipelineStep icon={step.icon} label={step.label} sublabel={step.sublabel} />
              {i < pipelineSteps.length - 1 && <ChevronRight size={20} color="#C9C4BB" style={{ flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Layers size={20} color="#1D4ED8" />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: 0 }}>Paso a paso</h3>
        </div>

        <StepRow number={1} title="Las encuestas de segunda vuelta"
          description={`Hay ${pollCount !== null ? pollCount : 'varias'} encuestas de segunda vuelta de ${houseCount !== null ? houseCount : 'distintas'} casas encuestadoras. No pesan igual. Las más recientes pesan más — una de hace 28 días vale mucho menos que una de hace 5. La encuestadora con mejor precisión en la primera vuelta de 2026 recibe mayor peso, y las encuestas tipo simulacro (que preguntan directamente por el día de la elección) reciben un bonus adicional. El resultado: las encuestas más recientes dominan casi completamente el agregado.`} />

        <StepRow number={2} title="Los house effects — corrección por sesgo de encuestadora"
          description="Algunas encuestadoras sobreestiman sistemáticamente a ciertos candidatos. Basados en su comportamiento en R1 2026, le restamos 1.5pp a CIT para Keiko (tendía a sobreestimarla) y 0.5pp a Ipsos para Keiko. A Sánchez no le aplicamos ninguna corrección porque no tenemos suficiente evidencia de sesgo en su caso. Estas correcciones son pequeñas pero evitan que los sesgos de encuestadora se acumulen." />

        <StepRow number={3} title="Los que no deciden — incertidumbre, no redistribución"
          description="Entre el 24% y el 37% de los encuestados no se compromete con ningún candidato: dicen 'no sé', declaran que votarán blanco/nulo, o simplemente no responden. El modelo no pretende saber cómo votará ese grupo — redistribuirlos proporcionalmente implicaría asumir que romperán igual que los que ya decidieron, y en Perú no hay evidencia de que eso sea cierto (en 2021 rompieron masivamente hacia Castillo). En cambio, el modelo trabaja directamente con la proporción declarada entre los dos candidatos: si Keiko aparece al 39% y Sánchez al 35%, el punto de partida es Keiko 52.7% vs Sánchez 47.3% en votos válidos. Toda la incertidumbre sobre cómo romperán los no comprometidos la absorben las 10,000 simulaciones del paso 6." />

        <StepRow number={4} title="Polymarket — por qué no se usa el número directo"
          description="Polymarket publica la probabilidad de que cada candidato gane la elección. Hoy Keiko aparece al 75.5%. Ese número no significa que Keiko va a sacar 75.5% de los votos — significa que los apostadores creen que hay 75.5% de chances de que gane. Para usar esa señal correctamente, el modelo hace el camino inverso: si hay 75.5% de probabilidad de ganar, y la incertidumbre histórica de una elección peruana es de ±3pp, ¿qué porcentaje de votos necesita Keiko para que eso tenga sentido? La respuesta es ~52%. Sin esta corrección, el modelo inflaría a Keiko artificialmente cada vez que el alpha sube durante la veda." />

        <StepRow number={5} title="El alpha — cuánto peso le damos a Polymarket"
          description="El alpha (α) controla qué tanto influye Polymarket vs las encuestas. Hoy está en 25%: Polymarket pesa 25%, encuestas 75%. El 31 de mayo empieza la veda electoral — las encuestas se congelan pero Polymarket sigue moviéndose. El alpha sube gradualmente hasta 60% el día de la elección. Gracias a la corrección del paso anterior, esto ya no distorsiona el resultado: Polymarket ahora dice '~52% de votos para Keiko', que es casi lo mismo que las encuestas. Subir el alpha de 25% a 60% mueve el posterior menos de 0.5pp." />

        <StepRow number={6} title="Las 10,000 simulaciones Monte Carlo" isLast
          description="Con el número final (posterior) como punto de partida, corremos 10,000 simulaciones. En cada una añadimos variación aleatoria — hoy ±5.7pp, el día de la elección ±3pp. En el 35% de las simulaciones ocurre un shock: en el 15% el líder colapsa entre 5 y 15 puntos (escándalo, colapso en debate); en el 10% el segundo cae; en el 10% hay un swing de debate que puede ir a cualquiera. Corrido el experimento, los shocks benefician neto a Sánchez en 2.2pp porque hay más eventos diseñados para perjudicar al líder que al segundo. El P(ganar) es simplemente el porcentaje de simulaciones que ganó cada candidato." />
      </div>

      {/* Ejemplo visual: los 100 mundos */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '24px 28px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>
          ¿Por qué P(ganar) ≠ % de votos?
        </div>
        <p style={{ color: '#1C1917', fontSize: 14, lineHeight: 1.7, margin: '0 0 12px' }}>
          Si el modelo dice que Keiko tiene 52% de los votos esperados, ¿por qué solo el 57% de probabilidad de ganar y no el 100%?
        </p>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '0 0 12px' }}>
          Porque las elecciones no son exactas. Con una ventaja de 2-3 puntos y una incertidumbre de ±3pp, imagina 100 versiones posibles de esta elección:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {Array.from({ length: 100 }, (_, i) => (
            <div key={i} style={{
              width: 18, height: 18, borderRadius: 3,
              background: i < 57 ? '#F97316' : i < 100 ? '#16A34A' : '#E5E0D8',
              title: i < 57 ? 'Keiko gana' : 'Sánchez gana',
            }} />
          ))}
        </div>
        <p style={{ color: '#78716C', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#F97316', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
          Keiko gana (57 mundos) &nbsp;
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#16A34A', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
          Sánchez gana (43 mundos) — incluyendo el 28% donde el margen es menor a 5 puntos.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <FeatureCard icon={Zap} iconColor="#D97706" title="Shocks incluidos"
          description="En el 35% de las simulaciones pasa algo inesperado: un escándalo, un debate decisivo, un colapso de campaña. En Perú, 3 de las últimas 4 elecciones tuvieron sorpresas. Los modelamos explícitamente." />
        <FeatureCard icon={Eye} iconColor="#1D4ED8" title="Transparencia total"
          description="No ajustamos nada a mano. El modelo corre automáticamente cada 30 minutos. Si llega una encuesta nueva, el peso cambia solo. Si Polymarket se mueve, el posterior cambia — pero de forma acotada." />
        <FeatureCard icon={Shield} iconColor="#059669" title="Correcciones calibradas"
          description="Los sesgos de encuestadora, el alpha dinámico, la conversión de probabilidad PM a voto share — todo está calibrado con datos reales de R1 2026 y el historial electoral peruano." />
      </div>

      <div style={{ background: '#FFFBEB', borderLeft: '4px solid #FDE68A', borderRadius: '0 12px 12px 0', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={20} color="#D97706" />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: 0 }}>Lo que el modelo no puede ver</h3>
        </div>
        <LimitationItem text="El voto vergüenza: en 2021, las encuestas subestimaron a Castillo ~5pp porque parte de sus votantes no lo admitían en encuestas. Si Sánchez tiene un perfil similar de votante rural que no declara su intención, el modelo no lo captura. El escenario 'bias +5pts Sánchez' en la sección de riesgos ilustra este caso." />
        <LimitationItem text="La movilización diferencial el día D: si el voto rural (donde Sánchez lidera) tiene mayor o menor asistencia que el urbano (donde lidera Keiko), el resultado puede ser muy diferente al de las encuestas. Las encuestas miden intención, no asistencia." />
        <LimitationItem text="Eventos de última hora: un escándalo, una exclusión legal, o una declaración viral en los últimos días antes de la veda. Los shocks del Monte Carlo capturan parte de esto, pero no un evento específico y conocido." />
        <LimitationItem text="El antivoto real vs declarado: el 44% que dice 'definitivamente no votaría por Keiko' en encuestas puede suavizarse o endurecerse el día de la elección. El modelo usa esos números como referencia pero no puede predecir cuánto se moverán." />
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <BookOpen size={20} color="#1D4ED8" />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: 0 }}>Fuentes de datos R2</h3>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Encuestas segunda vuelta
            </div>
            {[
              { name: 'Ipsos', detail: '23-24 abr · 15-17 may 2026', weight: '1.30x' },
              { name: 'IEP', detail: '21-25 abr 2026', weight: '1.00x' },
              { name: 'CIT', detail: '14-17 may 2026 (simulacro)', weight: '1.00x ×1.2 tipo' },
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 2.2, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F0EDE8' }}>
                <span><span style={{ fontWeight: 600, color: '#1C1917' }}>{s.name}</span><span style={{ color: '#8C877F' }}>, {s.detail}</span></span>
                <span style={{ color: '#1D4ED8', fontWeight: 500, fontSize: 12 }}>{s.weight}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Otras fuentes
            </div>
            {[
              { name: 'Polymarket', detail: 'Mercado de predicción · $53M+ volumen' },
              { name: 'Ipsos', detail: 'Antivoto: 5 feb, 27 mar, 2 abr, 24 abr, 17 may' },
              { name: 'ONPE', detail: 'Resultados oficiales R1 2026' },
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 2 }}>
                <span style={{ fontWeight: 600, color: '#1C1917' }}>{s.name}</span>
                <span style={{ color: '#8C877F' }}>, {s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────
export default function MetodologiaTab({ r2polls }) {
  const [activeTab, setActiveTab] = useState('segunda');

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E0D8', marginBottom: 32 }}>
        {[
          { key: 'segunda', label: 'Segunda vuelta ★' },
          { key: 'primera', label: 'Primera vuelta' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: activeTab === t.key ? 600 : 400,
            color: activeTab === t.key ? '#1D4ED8' : '#78716C',
            background: 'transparent', border: 'none',
            borderBottom: activeTab === t.key ? '2px solid #1D4ED8' : '2px solid transparent',
            cursor: 'pointer', marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'segunda' ? <SegundaVueltaContent r2polls={r2polls} /> : <PrimeraVueltaContent />}
    </div>
  );
}
