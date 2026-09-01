export const methodologyRevision = "f3196b0003a13cb22db350a7795e8bf8538bfa13"
export const indicators = [
  {
    "id": "score",
    "group": "Actividad web",
    "title": "¿Por qué el Score puede superar 100?",
    "labels": [
      "Score",
      "Radar Score",
      "Intensity",
      "Flight Instruments"
    ],
    "meaning": "Puntos de actividad del motor heredado, no un porcentaje.",
    "calculation": "Base = 35% frontend + 25% infraestructura + 25% rewards + 15% comportamiento. Se suman boosts de patrones y 10 puntos por movimiento on-chain; esa etapa se limita a 100. radar.js añade después bonos por palabras, descubrimiento y backend; el total puede superar 100. Ejemplos: claim +10, eligible +8, nonce +3 y canclaim_true de backend +25. Los pesos completos están en las fuentes enlazadas. Intensidad = clamp(50 × log10(puntos + 1), 0, 100).",
    "example": "9 puntos → 50 de intensidad; 99 → 100; 144 → 100.",
    "limits": "La intensidad se satura. Los bonos pueden compartir un hecho subyacente y no son probabilidades ni pruebas independientes.",
    "sources": [
      "watcher/lib/scoring-engine.js",
      "watcher/lib/signal-builder.js",
      "watcher/lib/pattern-engine.js",
      "watcher/radar.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "files",
    "group": "Actividad web",
    "title": "¿Qué cuentan Total Files, Added, Changed y Movement?",
    "labels": [
      "Total Files",
      "Added",
      "Changed",
      "Movement",
      "Changed %",
      "Movement %"
    ],
    "meaning": "Archivos observados, no funciones habilitadas.",
    "calculation": "Se compara la captura actual con la anterior. Movement agrupa añadidos y modificados; sus porcentajes usan el total actual. Bundle Diff tiene su propio inventario de JavaScript y puede dar otros conteos.",
    "example": "21 archivos de 63 = 33.33% de movimiento.",
    "limits": "Una recompilación puede reemplazar nombres/hashes sin habilitar funciones. No es porcentaje de producto completado.",
    "sources": [
      "watcher/radar.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "snapshot",
    "group": "Actividad web",
    "title": "¿Qué fecha representa Snapshot?",
    "labels": [
      "Snapshot",
      "Signal Tape",
      "Check-in Tape"
    ],
    "meaning": "Momento de captura/evaluación y registros de barridos.",
    "calculation": "Los identificadores incorporan UTC. La interfaz convierte fechas para lectura local; Heartbeat usa explícitamente CDMX. LIVE corresponde al snapshot actual, HIST a uno archivado y ALERT a un registro histórico de envío.",
    "example": "23:33 UTC del 30 de agosto = 17:33 de ese día en CDMX.",
    "limits": "No es necesariamente la hora exacta del cambio: solo se observa durante los barridos.",
    "sources": [
      "app/lib/date.ts",
      "app/components/radar/CheckInTape.tsx",
      "app/page.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "trend",
    "group": "Actividad web",
    "title": "¿Qué significan Trend, Velocity y Burst / 5m?",
    "labels": [
      "Trend Graph",
      "Historical Movement",
      "Trend",
      "Velocity",
      "Burst / 5m"
    ],
    "meaning": "Evolución de puntos y frecuencia de snapshots.",
    "calculation": "Trend del scoring compara con el promedio de hasta cinco registros: UP con delta ≥8 y DOWN con ≤−8. Velocity en pantalla resta scores de los dos registros más recientes. Burst / 5m cuenta snapshots en esa ventana.",
    "example": "De 0 a 144 puntos puede mostrar Velocity +144.",
    "limits": "Trend y Velocity usan referencias distintas. Burst de snapshots no cuenta transferencias.",
    "sources": [
      "watcher/lib/scoring-engine.js",
      "app/page.tsx",
      "app/components/radar/TrendGraph.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "tags",
    "group": "Actividad web",
    "title": "¿Qué significan Signal Type, Tags y Pattern Highlights?",
    "labels": [
      "Signal Type",
      "Signals & Tags",
      "Pattern Highlights",
      "Priority Readout",
      "Executive Readout"
    ],
    "meaning": "Categorías y narrativas heurísticas.",
    "calculation": "Se agrupan palabras como reward, claim, wallet y auth; los patrones añaden etiquetas y boosts según condiciones. Los textos interpretativos se generan a partir de esas reglas.",
    "example": "REWARDS puede aparecer por una palabra en un bundle sin pagos nuevos.",
    "limits": "Varias palabras de una compilación no son confirmaciones independientes. Una narrativa no es evidencia de disponibilidad.",
    "sources": [
      "watcher/lib/pattern-engine.js",
      "watcher/radar-intelligence.js",
      "app/lib/radar.ts"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "heuristics",
    "group": "Actividad web",
    "title": "¿Son probabilidades Activation heuristic, Confidence y Readiness?",
    "labels": [
      "Legacy heuristic signal",
      "Activation heuristic",
      "Operational Intelligence",
      "Confidence",
      "Readiness State",
      "Terminal Status",
      "Pattern Boost",
      "Alpha Score",
      "Alpha Class",
      "Trigger State",
      "Suggested Action",
      "ETA"
    ],
    "meaning": "Clasificaciones heredadas, no predicciones validadas.",
    "calculation": "Activation heuristic suma condiciones en computeActivationProbability y limita a 100. Confidence de pantalla = clamp(round(0.6 × intensidad + 0.2 × movimiento + 2 × trend),0,100). Readiness combina score, movimiento, tags y señales. Pattern Boost suma bonos de patrones. Alpha independiente fue retirado de la página principal.",
    "example": "Un salto de score puede producir Confidence 100 sin desbloqueos.",
    "limits": "No confundir con Evidence Confidence. IMMINENT, ACTIVATION o ETA heredados no prueban fecha ni claims; la guía no recalibra estos cálculos.",
    "sources": [
      "watcher/radar-intelligence.js",
      "app/page.tsx",
      "watcher/lib/pattern-engine.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "bundles",
    "group": "Activación y evidencia",
    "title": "¿Qué es Build / Bundle Fingerprint y Bundle Diff?",
    "labels": [
      "Feature Activation Intelligence",
      "Build / Bundle Fingerprint",
      "Previous Build",
      "Comparable",
      "Bundle Diff Intelligence",
      "Current State"
    ],
    "meaning": "Identidad de compilación y diferencias de recursos first-party.",
    "calculation": "Se comparan huellas y hashes de bundles y referencias a APIs, rutas, palabras y flags. Comparable indica una base previa utilizable.",
    "example": "20 bundles añadidos y 19 retirados pueden ser reemplazos por compilación.",
    "limits": "No demuestra 20 funciones nuevas. Sin base comparable no se puede afirmar estabilidad.",
    "sources": [
      "watcher/lib/feature-surface.js",
      "watcher/lib/feature-activation-evidence.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "routes",
    "group": "Activación y evidencia",
    "title": "¿Qué significan Unlocks, Activated Routes y Discovery?",
    "labels": [
      "Unlocks",
      "Activated Routes",
      "Convergence",
      "Activation Cluster",
      "Route + API Discovery v2",
      "DISCOVERED",
      "FRESH",
      "LIVE APIS",
      "DORMANT → LIVE",
      "LIVE → DORMANT",
      "Dormant Routes"
    ],
    "meaning": "Flags observados, accesibilidad y transiciones frente al estado previo.",
    "calculation": "Discovery enumera superficies conocidas, nuevas, APIs live y transiciones; Feature Activation combina cambios de flags y rutas para su clasificación. El nuevo WEB_CHANGE exige condiciones más específicas, descritas en Elegibilidad.",
    "example": "/claim en 404 no está habilitado aunque cambie su referencia.",
    "limits": "Un 200 puede ser login o página genérica. Accesibilidad no demuestra elegibilidad ni un claim exitoso.",
    "sources": [
      "watcher/route-api-discovery.js",
      "watcher/lib/feature-activation-evidence.js",
      "watcher/lib/evidence-events.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "semantic",
    "group": "Activación y evidencia",
    "title": "¿Cómo se calcula Semantic Change Score?",
    "labels": [
      "Semantic Change Score",
      "Semantic"
    ],
    "meaning": "Suma acotada de estructura, semántica y transiciones.",
    "calculation": "Estructura: min(12,modificados×2) + min(8,añadidos×2) + min(6,retirados×1.5), más hasta 8 por referencias retiradas. Se añaden pesos de rutas, palabras, flags y transiciones. Bonus 6 por dos evidencias de alto valor o 12 por tres o más. Total 0–100. Niveles: 15 LOW, 35 MEDIUM, 60 HIGH, 80 CRITICAL; menos de 15 TRIVIAL.",
    "example": "20 añadidos y 19 retirados sin otras señales = 8+6 = 14, TRIVIAL.",
    "limits": "Los pesos son reglas, no probabilidades de acierto. Consultar fuente para cada peso de ruta/flag.",
    "sources": [
      "watcher/lib/semantic-change-score.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "decision",
    "group": "Activación y evidencia",
    "title": "¿Qué mide Activation Decision / Decision Strength?",
    "labels": [
      "Activation Decision Engine v1",
      "Decision Strength"
    ],
    "meaning": "Estado condicionado por calidad y convergencia.",
    "calculation": "Strength = round(min(100,0.55×max(correlación,timeline)+0.35×confianza+0.1×min(semántica,60))); QUIET fuerza 0. STRUCTURAL_CHANGE: semántica ≥35. RUNTIME_ACTIVATION: transición y confianza ≥70. HIGH_CONFIDENCE_CONVERGENCE: correlación ≥55, confianza ≥80, ≥3 dominios y evidencia runtime. Candidato crítico: transición y distribución, timeline ≥70, correlación ≥65, confianza ≥85 y ≥4 dominios.",
    "example": "Semántica 14, correlación 18, confianza/timeline 0 → Strength 11, WATCH.",
    "limits": "Un candidato no confirma lanzamiento; este motor contextual no es la regla de Telegram.",
    "sources": [
      "watcher/lib/activation-decision-engine.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "timeline",
    "group": "Activación y evidencia",
    "title": "¿Qué cuenta Activation Timeline?",
    "labels": [
      "Activation Timeline v2.1",
      "Timeline",
      "Flags Tracked",
      "Flag Transitions",
      "Recent Domains",
      "New Events"
    ],
    "meaning": "Secuencia deduplicada en 60 minutos.",
    "calculation": "Suma limitada a 100: desbloqueo/API activada 22; ruta activada 18; distribuidor 20; destinatario nuevo 16; semántica 14; on-chain 12; cambio flag 10; bloqueo 6; API desactivada 4; ruta desactivada 3. Flags Tracked cuenta flags conocidos; New Events son observaciones nuevas del barrido.",
    "example": "Una ruta activada aporta 18 puntos, no 18% de probabilidad.",
    "limits": "Dominios distintos pueden compartir un hecho: distribuidor y destinatario pueden venir de la misma transferencia.",
    "sources": [
      "watcher/activation-timeline.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "confidence",
    "group": "Activación y evidencia",
    "title": "¿Cómo se calcula Evidence Confidence?",
    "labels": [
      "Evidence Confidence",
      "High Confidence",
      "Strongest evidence"
    ],
    "meaning": "Valoración heurística de fuentes y corroboración.",
    "calculation": "Promedio de los cinco eventos mejor valorados con pesos 0.38/0.25/0.17/0.12/0.08, renormalizados si hay menos. Bonus 1.5 por dominio adicional, hasta 6; total 0–100. Bases: transferencia 97, destinatario 95, on-chain 94, desbloqueo 88, API activada 86, ruta activada 78, semántica 58; HTTP/runtime ajustan valores. High Confidence cuenta eventos ≥85.",
    "example": "Una transferencia puede tener alta confianza sin indicar lanzamiento.",
    "limits": "Valores asignados por reglas, no porcentajes estadísticos de acierto. No certifica independencia causal.",
    "sources": [
      "watcher/lib/evidence-confidence.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "api",
    "group": "Activación y evidencia",
    "title": "¿Qué detecta API Response Drift?",
    "labels": [
      "API Response Drift"
    ],
    "meaning": "Cambios de estructura en respuestas first-party comparables.",
    "calculation": "Se compara el esquema observado con su baseline. STABLE indica que no se detectó deriva estructural dentro de la cobertura.",
    "example": "Cambiar campos de una respuesta puede generar drift sin nueva ruta.",
    "limits": "Esquema estable no implica valores o lógica idénticos; una API no observada no queda validada.",
    "sources": [
      "watcher/route-api-discovery.js",
      "app/page.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "correlation",
    "group": "Activación y evidencia",
    "title": "¿Qué significan Evidence y Temporal Correlation?",
    "labels": [
      "Evidence Correlation",
      "Temporal Correlation",
      "Correlation",
      "Evidence",
      "Domains",
      "API",
      "Backend",
      "Web Surface",
      "On-chain",
      "Window",
      "Span",
      "Sequence"
    ],
    "meaning": "Coincidencia de tipos de evidencia y tiempos, no causalidad.",
    "calculation": "Puntos por dominio: API 12, backend 15, semántica min(20,8+round(scoreSemántico×0.12)), web 8, on-chain 12, distribuidor 18, destinatarios 15. Bonus 10 si semántica+distribuidor; si no, 6 con ≥4 dominios o 3 con ≥3. Total limitado a 100. Temporal resume secuencia y separación en 60 min.",
    "example": "Semántica y web pueden activarse por una sola compilación.",
    "limits": "Dos dominios no aseguran dos fuentes independientes. Span 0 puede ser timestamp común de captura.",
    "sources": [
      "watcher/lib/evidence-correlation.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "chain",
    "group": "On-chain y rewards",
    "title": "¿Qué son ON-CHAIN, Fresh Trigger y Last 5 Minutes?",
    "labels": [
      "On-chain Intelligence",
      "Fresh Trigger",
      "Last 5 Minutes",
      "Chain score"
    ],
    "meaning": "Actividad en las wallets cubiertas por el monitor.",
    "calculation": "Se filtran transferencias por timestamp y ventana; Last 5 Minutes cuenta operaciones y suma wPOND. Fresh Trigger en pantalla exige actividad reciente; una ventana estadística por sí sola no basta. Chain score es el score de actividad del productor, no una probabilidad.",
    "example": "0 operaciones/0 wPOND se refiere a esa cobertura y ventana.",
    "limits": "No cubre toda Solana ni prueba ausencia global de pagos. Errores/cobertura incompleta limitan las conclusiones.",
    "sources": [
      "watcher/chain-intelligence.js",
      "app/components/radar/ChainIntelligencePanel.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "pattern",
    "group": "On-chain y rewards",
    "title": "¿Qué mide Pattern Match y su confidence?",
    "labels": [
      "wPOND Distribution Cycle Predictor",
      "Pattern Match",
      "Pattern Components",
      "Cadence similarity",
      "Delay similarity",
      "proximity",
      "Historical Baseline"
    ],
    "meaning": "Similitud con ciclos históricos.",
    "calculation": "Match = 30% cadencia + 15% demora + 20% correlación funding/transferencia + 20% automatización + 15% proximidad. Similitudes ausentes usan 50; sin contexto live, proximidad usa 50. Confidence del baseline: ≥100 ciclos VERY HIGH, ≥30 HIGH, ≥12 MEDIUM, menos LOW.",
    "example": "36 ciclos pueden mostrar HIGH aunque no exista trigger reciente.",
    "limits": "Los valores neutros permiten match positivo sin nueva actividad. No es probabilidad de cobrar o lanzar.",
    "sources": [
      "watcher/chain-intelligence.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "cadence",
    "group": "On-chain y rewards",
    "title": "¿Qué significan Funding Cadence, Claim After Funding y ventanas?",
    "labels": [
      "Funding Cadence",
      "Claim After Funding",
      "Predictor",
      "Statistical funding window",
      "Claim window after funding",
      "Operational Automation Confidence"
    ],
    "meaning": "Intervalos medianos y relaciones temporales históricas.",
    "calculation": "La tasa divide ciclos correlacionados entre analizados ×100; hay variantes live, histórica y combinada ponderada por número de ciclos. Automatización suma hasta 55 por ≥1/3/5 ciclos correlacionados, 25 por tasas ≥50/75%, 15 por demoras ≤180/60 s y 5 por variación de cadencia ≤0.25; máximo 100. Las ventanas usan medianas y dispersión.",
    "example": "635 s de cadencia mediana describe la muestra, no promete pago en 635 s.",
    "limits": "Correlación no demuestra claims reales ni financiación 1:1. INSUFFICIENT DATA no es una predicción negativa.",
    "sources": [
      "watcher/chain-intelligence.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "distributor",
    "group": "On-chain y rewards",
    "title": "¿Qué mide Reward Distributor Intelligence?",
    "labels": [
      "Reward Distributor Intelligence",
      "1h Flow",
      "6h Flow",
      "24h Flow",
      "SURGING",
      "BURSTING",
      "ACTIVE",
      "COOLING",
      "QUIET"
    ],
    "meaning": "Volumen, conteos y destinatarios únicos del distribuidor.",
    "calculation": "Filtra por 1/6/24 h y suma importes. SURGING: ≥5 operaciones en 1 h o burst ≥5; BURSTING: burst ≥3; ACTIVE: alguna en 1 h; COOLING: alguna en 6 h; si no QUIET.",
    "example": "Dos operaciones a una wallet = dos transferencias y un destinatario.",
    "limits": "La muestra del panel puede ser más limitada que el archivo exacto del evaluador. Revisar cobertura antes de interpretar ceros.",
    "sources": [
      "watcher/lib/distributor-behavior.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "distributor-stats",
    "group": "On-chain y rewards",
    "title": "¿Cómo se calculan Velocity, Bursts y Anomalies?",
    "labels": [
      "1h Velocity",
      "Bursts",
      "Median Transfer",
      "Anomalies",
      "largest"
    ],
    "meaning": "Cambios de volumen y agrupaciones temporales.",
    "calculation": "Velocity = (actual−anterior)/anterior ×100, por volumen y por conteo. Si anterior=0, convención 100 si actual>0 o 0 si ambas vacías. Bursts agrupa separaciones de hasta 10 min. Mediana usa importes positivos; anomalía = importe ≥3×mediana.",
    "example": "De 2 a 6 transferencias = +200%; aquí superar 100% sí tiene sentido.",
    "limits": "Base cero usa una convención. Mediana/anomalías dependen de los datos recuperados.",
    "sources": [
      "watcher/lib/distributor-behavior.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "recipients",
    "group": "On-chain y rewards",
    "title": "¿Qué significa Observed Reward Recipients y Recipient Mix?",
    "labels": [
      "Observed Reward Recipients",
      "Recipient Mix",
      "Wallet",
      "Status",
      "wPOND",
      "Transfers",
      "First Seen",
      "Last Seen",
      "Last Tx"
    ],
    "meaning": "Registro persistente de destinatarios de transferencias externas candidatas.",
    "calculation": "Se acumulan conteos/importes por wallet, primera/última observación y firma. NEW: ≤1 transferencia; REPEAT: 2–4; FREQUENT: ≥5. Solscan permite consultar wallet/tx.",
    "example": "NEW puede seguir visible días después: es frecuencia, no novedad del barrido.",
    "limits": "La etiqueta histórica no certifica rewards ni claims. El total acumulado no es volumen reciente.",
    "sources": [
      "watcher/lib/distributor-behavior.js",
      "app/components/radar/ChainIntelligencePanel.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "heartbeat",
    "group": "Salud del monitoreo",
    "title": "¿Qué significan FRESH, LAGGING, STALE y Next expected sweep?",
    "labels": [
      "Radar Heartbeat",
      "Next expected sweep",
      "Last success",
      "Freshness",
      "Source",
      "Scheduler"
    ],
    "meaning": "Antigüedad del último barrido frente al intervalo esperado.",
    "calculation": "Con intervalo 60 min y gracia 15: FRESH hasta 75 min; LAGGING hasta 135; STALE después; sin fecha válida UNKNOWN. La cuenta regresiva es una estimación.",
    "example": "Puede vencer la cuenta regresiva y seguir FRESH durante la tolerancia.",
    "limits": "No son datos en tiempo real ni una garantía de puntualidad del programador.",
    "sources": [
      "app/lib/radar.ts",
      "app/components/radar/HeartbeatPanel.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "health",
    "group": "Salud del monitoreo",
    "title": "¿Qué son Observability, Radar Trust y Reliability?",
    "labels": [
      "Radar Reliability",
      "Observability",
      "Navigation",
      "Document",
      "First-party",
      "First-party APIs",
      "Radar Trust",
      "trigger",
      "capture",
      "chain",
      "radar",
      "publish"
    ],
    "meaning": "Cobertura y salud de las etapas de monitoreo.",
    "calculation": "Observability resume navegación, captura, respuestas y APIs first-party. Trust combina frescura/visibilidad web y chain. Reliability reúne estado de trigger, capture, chain, radar, Telegram y publicación.",
    "example": "HEALTHY confirma comprobaciones operativas del monitor.",
    "limits": "El portal puede tener errores funcionales aunque el monitor esté saludable. No es estado de lanzamiento.",
    "sources": [
      "watcher/system-health.js",
      "app/lib/radar.ts",
      "app/components/radar/SystemHealthPanel.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "telegram-health",
    "group": "Salud del monitoreo",
    "title": "¿Telegram HEALTHY significa que envió alertas?",
    "labels": [
      "Telegram",
      "Bot",
      "Chat",
      "Last health check",
      "Last Radar alert",
      "Last chain alert"
    ],
    "meaning": "Alcanzabilidad del bot/chat, distinta de entrega.",
    "calculation": "El probe consulta bot/chat y lee timestamps históricos; si se ejecuta antes del envío del barrido, Last Radar alert puede quedar un ciclo detrás.",
    "example": "REACHABLE puede aparecer durante OBSERVATION_ONLY sin mensajes enviados.",
    "limits": "Solo un registro de entrega acredita un envío registrado. HEALTHY no reactiva emisores.",
    "sources": [
      "watcher/telegram-health.js",
      "app/components/radar/SystemHealthPanel.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "sentinel",
    "group": "Salud del monitoreo",
    "title": "¿Qué significa Sentinel TRIGGERED?",
    "labels": [
      "Sentinel Intelligence",
      "Trigger Reason",
      "Changed Surfaces",
      "Max Priority",
      "Threshold Flags"
    ],
    "meaning": "Detector temprano de cambios en superficies.",
    "calculation": "Compara superficies configuradas y reporta cambios, HTTP y prioridades; los flags describen condiciones del detector.",
    "example": "home 200 y claim 404 pueden cambiar y disparar Sentinel sin abrir claims.",
    "limits": "TRIGGERED aquí no significa mensaje enviado ni activación confirmada.",
    "sources": [
      "watcher/sentinel.js",
      "app/components/radar/SentinelPanel.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "evidence",
    "group": "Alertas y validación",
    "title": "¿Cómo se coordinan Evidence & Telegram y la web?",
    "labels": [
      "Evidence & Telegram",
      "Claims available",
      "Would notify",
      "Observation only",
      "Not sent"
    ],
    "meaning": "Registro compartido con decisión reproducible por evento.",
    "calculation": "Archiva intervalo, transacciones/cambios, razón y mensaje congelado. NO_NEW_CHANGE: ningún cambio web calificable; BASELINE_ONLY: falta comparación; NOT_EVALUATED: fuente no evaluada. OBSERVATION_ONLY simula, no entrega.",
    "example": "Would notify junto a Not sent indica simulación.",
    "limits": "Claims permanece NOT_CONFIRMED. Datos ausentes no significan ausencia de actividad. Las páginas de evento describen su intervalo histórico.",
    "sources": [
      "watcher/lib/evidence-events.js",
      "watcher/evidence-observe.js"
    ],
    "role": "Fuente compartida de la estrategia; envíos reales desactivados."
  },
  {
    "id": "eligibility",
    "group": "Alertas y validación",
    "title": "¿Qué evidencia califica y qué bloquea una alerta?",
    "labels": [
      "FUNDS_MOVEMENT",
      "WEB_CHANGE",
      "MONITORING_PROBLEM",
      "Coverage"
    ],
    "meaning": "Reglas evidence-v1 separadas de los scores heredados.",
    "calculation": "FUNDS_MOVEMENT agrupa transferencias deduplicadas por firma+índice: ≥3 rewards o cualquier funding/externa. WEB_CHANGE: muestra fresca/comparable y ruta relevante de <200 o ≥400 a 2xx, o flag relevante desbloqueado. Datos >90 min, intervalo inválido, cobertura incompleta o brecha >24 h bloquean procesamiento chain. Dos muestras deficientes distintas generan un evento de monitoreo por incidente.",
    "example": "Una recompilación con palabras claim/reward no califica; 1–2 transferencias rewards se guardan como observación.",
    "limits": "Coobservación ≤15 min aporta contexto, no causalidad ni una tercera alerta. Un workflow detenido requiere vigilancia externa.",
    "sources": [
      "watcher/lib/evidence-events.js",
      "watcher/lib/chain-alert-window.js"
    ],
    "role": "Determina Would notify; no envía en modo observación."
  },
  {
    "id": "history",
    "group": "Alertas y validación",
    "title": "¿Por qué aparecen alertas viejas?",
    "labels": [
      "Legacy Telegram Delivery History",
      "Recent Alerts",
      "ALERT"
    ],
    "meaning": "Historial del emisor Radar retirado, separado de observaciones nuevas.",
    "calculation": "alerts-history registra sentAt; el emisor chain antiguo no dejó un historial completo. El nuevo ledger conserva hasta 200 eventos y archiva cada evento/barrido por separado.",
    "example": "Cuatro alertas viejas pueden seguir visibles tras activar observación.",
    "limits": "No son decisiones nuevas. El backlog de observación no se enviará automáticamente.",
    "sources": [
      "app/api/radar/route.ts",
      "watcher/evidence-observe.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "calibration",
    "group": "Alertas y validación",
    "title": "¿Qué significan Calibration, Exact Evidence y Ground Truth?",
    "labels": [
      "Decision Engine Calibration",
      "Exact Evidence",
      "Ground Truth Covered",
      "Threshold Changes",
      "Recommendation",
      "SENSITIVE",
      "DEFAULT",
      "CONSERVATIVE"
    ],
    "meaning": "Replay con muestras exactas y eventos de referencia registrados.",
    "calculation": "Compara perfiles de umbrales. Por defecto requiere ≥72 barridos exactos y ≥3 eventos de referencia cubiertos para revisar umbrales. Threshold Changes LOCKED: no existe ajuste automático.",
    "example": "55/72 es progreso de muestras, no certeza de lanzamiento.",
    "limits": "El archivo histórico de calibración es distinto del nuevo evidence-sweeps. Cobertura insuficiente impide generalizar.",
    "sources": [
      "watcher/calibration-learning.js",
      "app/components/radar/CalibrationLearningPanel.tsx"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "metrics",
    "group": "Alertas y validación",
    "title": "¿Cómo se calculan Precision, Recall y False Signal Rate?",
    "labels": [
      "Signals",
      "False Signals",
      "Precision",
      "Recall",
      "False Signal Rate",
      "Median Lead"
    ],
    "meaning": "Evaluación de señales frente a referencias cubiertas.",
    "calculation": "Precision = señales emparejadas/señales ×100. Recall = eventos detectados/eventos cubiertos ×100. False Signal Rate = señales no emparejadas/barridos ×100. Median Lead: mediana del adelanto de señales emparejadas. Denominador vacío produce dato ausente.",
    "example": "Una señal sin correspondencia en 55 barridos → precision 0%, false signal rate 1.82%.",
    "limits": "No emparejada no prueba falsedad: la referencia puede estar incompleta. No es validación de precisión del nuevo emisor.",
    "sources": [
      "watcher/calibration-learning.js"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  },
  {
    "id": "reading",
    "group": "Alertas y validación",
    "title": "¿Cómo leer el Radar sin especular?",
    "labels": [
      "Guía",
      "Metodología",
      "Q&A"
    ],
    "meaning": "Primero frescura/cobertura, después evidencia y por último heurísticas.",
    "calculation": "Hecho: una transferencia o transición observada. Interpretación: posible preparación. Predicción: fecha de lanzamiento. Deben mantenerse separados.",
    "example": "144 puntos, cero desbloqueos y cero transferencias nuevas: cambio de archivos, no lanzamiento confirmado.",
    "limits": "La guía no valida modelos ni cambia sus reglas. El monitor no conecta wallets, firma ni prueba claims personales.",
    "sources": [
      "docs/evidence-alert-strategy.md"
    ],
    "role": "Contexto; no activa el nuevo emisor por sí solo."
  }
] as const
