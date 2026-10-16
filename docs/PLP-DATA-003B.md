# RIGO PLP-DATA-003B — Integrity Error Code Dictionary

**Versión:** 0.1 (diseño)  
**Fecha:** 2026-10-15  
**Destino propuesto:** `docs/PLP-DATA-003B.md`  
**Estado:** `DESIGN COMPLETE / IMPLEMENTATION OPEN / TESTS OPEN`  
**Ámbito:** ES, MES, NQ, MNQ; datos de contratos CME de índices estadounidenses.  
**Permisos:** Solo lectura y fixtures sintéticos. Sin instalar dependencias, modificar lockfiles, conectar DB, entrenar modelos, ejecutar trading, commit, push o deploy.

## 1. Objetivo y límites de evidencia

Detectar datos de mercado incompatibles, irrecuperables o insuficientemente documentados **antes** de construir un dataset walk-forward. Separar:

- **INVALID:** contradicción reproducible con un invariante o referencia verificable.
- **UNVERIFIED:** falta evidencia suficiente para aceptar o rechazar una afirmación.
- **VALID_WITH_WARNING:** datos admisibles para investigación restringida con advertencia no bloqueante.

**No confundir:** validación de metadatos ≠ prueba de ausencia de look-ahead ≠ certificación de precios CME ≠ prueba de reproducibilidad post-reload.

Las observaciones WealthCharts `ES1` / `NQ1` son símbolos continuos o alias de plataforma: **no prueban por sí mismos el contrato de vencimiento ni la política de ajuste**. La correspondencia con un contrato negociado debe venir de un mapeo auditable del proveedor.

## 2. Semántica de severidad y decisión

| Severidad | Resultado estructurado | Política |
|---|---|---|
| `REJECT` | `REJECTED` | Invariante falso o corrupción constatada; no ingestar ni calcular outcomes. |
| `QUARANTINE` | `PENDING_EVIDENCE` | No hay evidencia suficiente; conservar solo en staging aislado para revisión, nunca como muestra apta para entrenamiento. |
| `WARN` | `ACCEPTED_WITH_WARNINGS` | Puede usarse en un análisis explícitamente permitido; registrar la advertencia. Nunca implica permiso de entrenamiento. |

**Prelación:** `REJECT` > `QUARANTINE` > `WARN` > `ACCEPTED`. Todas las incidencias se devuelven juntas, ordenadas por código, para auditoría reproducible. Las incidencias de calidad son **resultados tipados**, no excepciones. Solo errores internos del validador (p. ej., bug de ejecución) pueden lanzar excepción y deben fallar de forma cerrada. `INSUFFICIENT_DATA` y `AMBIGUOUS` pertenecen a DATA-002: no los reutilizaremos como errores de proveniencia.

## 3. Diccionario normativo

| Código | Identificador | Severidad inicial | Condición comprobable y acción |
|---|---|---|---|
| `PROV-001` | `MISSING_CANONICAL_TICKER` | QUARANTINE | Falta contrato exacto; solo se recibió `ES1`, `NQ1` u otro alias. Exigir mapeo del feed. |
| `PROV-002` | `INVALID_CONTRACT_CODE` | REJECT | Ticker contradice gramática canónica declarada (`root` + mes + año), o mes no es H/M/U/Z en este alcance. |
| `PROV-003` | `CONTRACT_METADATA_CONFLICT` | REJECT | `canonicalTicker`, `rootSymbol`, `expirationMonth` y `expirationYear` se contradicen. |
| `PROV-004` | `CONTRACT_NOT_TRADABLE_AT_TIMESTAMP` | REJECT / QUARANTINE | REJECT solo si calendario/listado oficial o manifest verificado descarta negociación en fecha de barra; QUARANTINE si faltan referencias. **No inferir solo por roll date habitual.** |
| `PROV-005` | `CONTINUOUS_SERIES_UNRESOLVED` | QUARANTINE | Alias continuo sin política de selección/ajuste ni secuencia de contratos por barra. |
| `PROV-006` | `INVALID_UTC_TIMESTAMP` | REJECT | Timestamp inválido, imposible, sin `Z`/offset normalizable o normalización UTC no reversible. |
| `PROV-007` | `BAR_INTERVAL_INVALID` | REJECT | `open >= close`, duración incompatible con intervalo declarado o duplicación de marcas de tiempo. |
| `PROV-008` | `SESSION_POLICY_UNKNOWN` | QUARANTINE | Falta definición versionada de horario RTH/ETH, zona IANA y política de etiquetas/cierres. |
| `PROV-009` | `BAR_OUTSIDE_TRADING_CALENDAR` | REJECT / QUARANTINE | REJECT con calendario oficial versionado; QUARANTINE si festivos, cierres anticipados o mantenimiento no están verificados. |
| `PROV-010` | `ATR_UNFROZEN_OR_UNTRACEABLE` | QUARANTINE | No hay ATR numérico de la barra decisoria, ventana de inputs cerrados, fórmula, período y timestamp de disponibilidad verificables. |
| `PROV-011` | `ATR_RECOMPUTATION_MISMATCH` | REJECT | ATR calculado con OHLCV de referencia y reglas congeladas excede tolerancia explícita de precisión. |
| `PROV-012` | `SOURCE_PROVIDER_UNVERIFIED` | QUARANTINE | Proveedor, ID de dataset, versión/revisión, licencia o resolución OHLCV insuficientes para identificar el origen. |
| `PROV-013` | `SEQUENCE_HASH_MISSING` | QUARANTINE | Ausencia de SHA-256 de bytes canónicos y de especificación de serialización de la secuencia histórica. |
| `PROV-014` | `SEQUENCE_HASH_MISMATCH` | REJECT | Recomputación de SHA-256 sobre la misma serialización/versiones produce digest diferente. |
| `PROV-015` | `HASH_CANONICALIZATION_UNDEFINED` | QUARANTINE | No constan orden de campos, precisión numérica, separador, encoding, ordenamiento y reglas de normalización. |
| `PROV-016` | `BAR_SEQUENCE_GAP_UNEXPLAINED` | QUARANTINE | Falta una barra esperada según calendario y política de agregación; cierre programado **no es** hueco anómalo. |
| `PROV-017` | `ROLLOVER_POLICY_UNDECLARED` | QUARANTINE | Un cambio de contrato detectado sin manifest de fecha efectiva, origen/destino, selección, ajuste y versión. |
| `PROV-018` | `ROLLOVER_ADJUSTMENT_UNVERIFIED` | QUARANTINE | Se usa back-adjustment sin fórmula, offset, instante de fijación, inputs y evidencia de causalidad. |
| `PROV-019` | `MIXED_PRICE_BASIS` | REJECT | Niveles de OB, precio de referencia, ATR o velas futuras usan bases raw/ajustadas incompatibles sin transformación verificada. |
| `PROV-020` | `FUTURE_INFORMATION_IN_DECISION_SNAPSHOT` | REJECT | Traza/cálculo demuestra que snapshot usa datos cuya disponibilidad es posterior a la confirmación. |
| `PROV-021` | `ASOF_EVIDENCE_MISSING` | QUARANTINE | No existe manifest de insumos y tiempos `asOf` que permita auditar causalidad; **ausencia de prueba no equivale a fuga demostrada**. |
| `PROV-022` | `PROVIDER_DATA_REVISION` | QUARANTINE | El feed revisó barras/hash/versionado sin registro de revisión y revalidación del snapshot. |
| `PROV-023` | `OHLCV_INVALID` | REJECT | `low > high`, `open/close` fuera del rango, precios no finitos, volumen negativo o no finito. |
| `PROV-024` | `CONTRACT_ROLL_DATE_DEVIATION` | WARN | Política explícita válida cambia contrato en fecha distinta del roll date habitual de CME, sin contradicción con listado/negociación real. |

Los casos con severidad `REJECT / QUARANTINE` se resuelven determinísticamente **según evidencia disponible** y registran `evidenceRef`; el validador nunca debe asumir que una fuente desconocida es definitiva.

## 4. Aclaraciones fundamentales sobre futuros CME

1. **Código de vencimiento.** En este ámbito, meses trimestrales: marzo `H`, junio `M`, septiembre `U`, diciembre `Z`. Ejemplo válido de representación interna: `ESZ2026`. Otros proveedores muestran `ESZ26`; exigir formato interno único y guardar `providerTicker` original. `ES1` no es prueba de `ESZ2026`.
2. **Roll date no es expiración ni restricción de negociación.** CME publica para índices estadounidenses la fecha **habitual** de rollover como el **lunes anterior al tercer viernes** del mes de vencimiento. En diciembre de 2026: **14 de diciembre** (roll habitual) y **18 de diciembre** (vencimiento en el calendario de referencia). Los participantes pueden rolar en otros momentos. `ESZ2026` para 15 de octubre de 2026 **no es sospechoso solo por su fecha**.
3. **Sesiones y DST.** La negociación habitual de ES/MES y NQ/MNQ en Globex transcurre del domingo 18:00 ET al viernes 17:00 ET, con mantenimiento diario 17:00–18:00 ET; consultar horario particular, festivos y eventuales interrupciones. Guardar `America/New_York`, zona de origen del proveedor, versión del calendario y UTC normalizado. No imponer UTC offset fijo durante DST.
4. **Fin de semana.** No inventar velas durante cierre programado. En 1H, la siguiente vela operable tras el fin de semana puede ser `t+1`, con `calendarGap` documentado. Un salto de precio entre cierres/aperturas debe preservarse en OHLC raw, no borrarse por ser fin de semana.
5. **Rollover.** No aplicar automáticamente back-adjustment. Para evaluación de MFE/MAE o target/stop calculados en base raw, un salto contractual exige una política explícita. Preferencia inicial: **detener el outcome en el límite de contrato** hasta poder verificar un ajuste causal, estable y compatible con los niveles del snapshot. Series continuas históricas pueden incorporar ajustes ex post que serían inválidos como inputs predictivos `asOf` del pasado.
6. **Snapshot causal.** Las 100 velas **previas y cerradas** sirven como insumo reproducible del snapshot; las 5/10/20/50/100 posteriores corresponden a DATA-002 y no pueden mezclarse en su hash causal. El hash prueba identidad de una secuencia bajo una serialización fija, no verdad, completitud ni ausencia de futuro por sí mismo.

Fuentes primarias:
- CME: https://www.cmegroup.com/trading/equity-index/rolldates.html
- CME: https://www.cmegroup.com/markets/equities/sp-500-and-nasdaq-100-futures.html
- CME: https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html
- CME: https://www.cmegroup.com/market-data/cme-group-continuous-price-series.html
- CME: https://www.cmegroup.com/trading-hours.html

## 5. Revisión propuesta del contrato DATA-003-A (no implementada)

Agregar o aclarar sin modificar todavía los módulos congelados:

- `canonicalTicker` + `providerTicker` + `contractIdSource` + `effectiveAtUtc` del mapeo; no asumir que `root + month + year` demuestra existencia/listado.
- `seriesKind: "EXACT_CONTRACT" | "CONTINUOUS_RAW" | "CONTINUOUS_ADJUSTED"`.
- `rolloverPolicy?: { id, version, sourceContract, destinationContract, effectiveAtUtc, trigger, adjustmentMode, adjustmentPoints?, asOfUtc }`; opcional cuando no hubo rollover.
- `chrono: { barOpenTimeUTC, barCloseTimeUTC, barLabelConvention, timeframe, sessionPolicyId, calendarVersion, exchangeTimeZone }`.
- `volatility: { atrPeriod, atrFormulaReference, atrValueFrozen, atrAsOfUtc, atrInputHash, numericTolerance }`.
- `integrity: { provider, datasetId, sourceRevision, serializationVersion, historicalSequenceHash, inputBarCount, eventSnapshotHash?, retrievalAtUtc }`.
- En cada resultado, referencia separada a `outcomeInputHash` y `outcomeAsOfUtc`; no colocar futuras velas en `historicalSequenceHash` de la decisión.

## 6. Contrato de respuesta del validador (propuesta)

```ts
type Disposition = "ACCEPTED" | "ACCEPTED_WITH_WARNINGS" | "PENDING_EVIDENCE" | "REJECTED";
type Severity = "WARN" | "QUARANTINE" | "REJECT";
interface ProvenanceIssue {
  code: `PROV-${string}`;
  severity: Severity;
  field: string;
  evidenceRef?: string;
  message: string;
}
interface ProvenanceValidationResult {
  disposition: Disposition;
  issues: ProvenanceIssue[];
  validatorVersion: string;
  canEnterWalkForward: false | true; // true solo con política de gates adicionales aprobada
}
```

`canEnterWalkForward` es **false por defecto** en PLP-DATA-003B; no lo cambia un `ACCEPTED` aislado. Registrar la disposición sin lanzar excepciones por datos inválidos. Pérdida del manifest o cambio del código de validador invalida una certificación histórica hasta revalidación.

## 7. Matriz mínima de fixtures (para futuro DATA-003C)

| Caso | Entrada sintética | Esperado |
|---|---|---|
| A | Solo `ES1`, sin contrato resuelto | `PROV-001` QUARANTINE |
| B | `ESZ2026` + root `NQ` | `PROV-003` REJECT |
| C | `ESZ2026`, evento 2026-10-15 y fuente válida | **No emitir** `PROV-004` por fecha únicamente |
| D | Fecha 2026-10-15T25:00:00Z | `PROV-006` REJECT |
| E | Cierre UTC <= apertura | `PROV-007` REJECT |
| F | Hash SHA-256 distinto del calculado | `PROV-014` REJECT |
| G | Gap entre viernes y domingo autorizado por calendario | **No emitir** `PROV-016` |
| H | Bar adicional durante mantenimiento, calendario verificado | `PROV-009` REJECT |
| I | Cambio ESU→ESZ sin manifest | `PROV-017` QUARANTINE |
| J | Predicción usa high de la vela siguiente | `PROV-020` REJECT |
| K | Imposible probar corte `asOf`, sin evidencia de fuga | `PROV-021` QUARANTINE |
| L | MFE raw junto a niveles ajustados sin transformación | `PROV-019` REJECT |
| M | Rollover válido fuera del lunes habitual | `PROV-024` WARN, **no** rechazo automático |
| N | ATR sin fórmula o valor exacto congelado | `PROV-010` QUARANTINE |

## 8. Evidencias y gates de cierre

Para declarar `PLP-DATA-003B LOCAL PASS` será necesario, como mínimo:

1. Documento revisado y guardado localmente; código/mapeos y política de errores congelados con versión.
2. Implementación del validador en backend (si se autoriza), sin conexiones externas.
3. Fixtures unitarios reproducibles para los códigos, incluyendo transiciones de severidad según evidencia y escenarios de DST, sesiones, festivos y rollover.
4. Jest real PASS + backend typecheck PASS; conservar logs y referencia exacta de git/worktree.
5. Revisión explícita de correspondencia temporal en un dataset **con procedencia acreditada** antes de DATA-004.

**Estado real actual:** Documento de diseño generado; NO consta implementación de DATA-003B, fixtures Jest ejecutados, validación de feed, hash del histórico, conexión de bases de datos, ni pruebas anti-repainting/anti-look-ahead en producción. **DATA-004 permanece bloqueado hasta definir gates operativos y disponer de evidencia suficiente.**
