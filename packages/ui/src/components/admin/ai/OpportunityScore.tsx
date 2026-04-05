'use client';

interface OpportunityScoreProps {
  score: number | null;
  confidence: 'High' | 'Medium' | 'Low';
  type: 'Arbitrage' | 'Monitor' | 'Avoid';
  loaded: boolean;
}

function arcPath(score: number, radius: number, cx: number, cy: number): string {
  // Arc from -135° to +135° (270° sweep), score maps to partial fill
  const startAngle = -225; // degrees (left side)
  const totalSweep = 270;
  const sweepAngle = (score / 100) * totalSweep;
  const endAngle = startAngle + sweepAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(toRad(startAngle));
  const y1 = cy + radius * Math.sin(toRad(startAngle));
  const x2 = cx + radius * Math.cos(toRad(endAngle));
  const y2 = cy + radius * Math.sin(toRad(endAngle));
  const largeArc = sweepAngle > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function bgArcPath(radius: number, cx: number, cy: number): string {
  const startAngle = -225;
  const endAngle = startAngle + 270;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(toRad(startAngle));
  const y1 = cy + radius * Math.sin(toRad(startAngle));
  const x2 = cx + radius * Math.cos(toRad(endAngle));
  const y2 = cy + radius * Math.sin(toRad(endAngle));
  return `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}`;
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

export function OpportunityScore({ score, confidence, type, loaded }: OpportunityScoreProps) {
  const displayScore = score ?? 0;
  const cx = 60;
  const cy = 60;
  const r = 48;
  const badge = loaded && score !== null;

  return (
    <div className="card p-4 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-white font-semibold text-sm">Opportunity Score</h2>
        {badge ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600/30 text-green-300">LIVE</span>
        ) : (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-300">DEMO</span>
        )}
      </div>

      <svg width="120" height="100" viewBox="0 0 120 100" className="mb-2">
        {/* Background arc */}
        <path
          d={bgArcPath(r, cx, cy)}
          fill="none"
          stroke="#1e293b"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Score arc */}
        {displayScore > 0 && (
          <path
            d={arcPath(displayScore, r, cx, cy)}
            fill="none"
            stroke={scoreColor(displayScore)}
            strokeWidth="10"
            strokeLinecap="round"
          />
        )}
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-white text-2xl font-bold" fontSize="28">
          {badge ? displayScore : '—'}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-dark-400" fontSize="10">
          / 100
        </text>
      </svg>

      <div className="text-center space-y-1">
        <div className="text-xs text-dark-400">
          Confidence: <span className="text-white font-medium">{badge ? confidence : '—'}</span>
        </div>
        <div className="text-xs text-dark-400">
          Type:{' '}
          <span
            className={`font-medium ${type === 'Arbitrage' ? 'text-green-400' : type === 'Monitor' ? 'text-yellow-400' : 'text-red-400'}`}
          >
            {badge ? type : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
