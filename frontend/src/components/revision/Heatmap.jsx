import { useMemo, useState } from 'react';
import { formatDate } from '../../utils/dates';

/** GitHub-style activity level → cell styling. */
function levelFor(count) {
  if (!count) return 'bg-slate-800/80';
  if (count <= 2) return 'bg-emerald-900/90';
  if (count <= 5) return 'bg-emerald-700';
  if (count <= 9) return 'bg-emerald-500';
  return 'bg-emerald-300';
}

const LEVEL_LEGEND = [
  { label: '0', cls: 'bg-slate-800/80' },
  { label: '1-2', cls: 'bg-emerald-900/90' },
  { label: '3-5', cls: 'bg-emerald-700' },
  { label: '6-10', cls: 'bg-emerald-500' },
  { label: '10+', cls: 'bg-emerald-300' },
];

/**
 * Revision heatmap.
 * @param {Array<{date: string, revisions: number, solved: number}>} days
 * @param {(date: string) => void} onSelect  clicking a day (drill-down)
 */
export default function Heatmap({ days = [], onSelect = null, minHeightWeeks = 0 }) {
  const [hover, setHover] = useState(null);

  const { grid, monthLabels } = useMemo(() => {
    if (!days.length) return { grid: [], monthLabels: [] };

    // Pad the start so columns align to full weeks (Mon-first not required —
    // just consistent columns; we align by weekday of the first day).
    const first = new Date(`${days[0].date}T00:00:00`);
    const pad = first.getDay(); // 0 = Sunday
    const padded = [...Array(pad).fill(null), ...days];

    const weeks = [];
    for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

    const labels = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const d = week.find(Boolean);
      if (!d) return;
      const m = new Date(`${d.date}T00:00:00`).getMonth();
      if (m !== lastMonth) {
        labels.push({ week: wi, label: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }) });
        lastMonth = m;
      }
    });
    return { grid: weeks, monthLabels: labels };
  }, [days]);

  const totalRevisions = days.reduce((s, d) => s + d.revisions, 0);

  if (!days.length) return null;

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="min-w-[640px]">
        {/* Month header */}
        <div className="relative mb-1 ml-7 h-4">
          {monthLabels.map((m) => (
            <span
              key={`${m.week}-${m.label}`}
              className="absolute text-[10px] text-slate-500"
              style={{ left: `${m.week * 14}px` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Day labels */}
          <div className="flex flex-col justify-between py-0.5 text-[9px] text-slate-600" style={{ height: 7 * 14 }}>
            <span />
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
          </div>

          <div className="flex gap-[3px]">
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) =>
                  day ? (
                    <button
                      key={di}
                      type="button"
                      onMouseEnter={() => setHover(day)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => onSelect?.(day.date)}
                      title={`${day.date} · ${day.revisions} revision${day.revisions === 1 ? '' : 's'} · ${day.solved} solved`}
                      className={`h-3 w-3 rounded-[3px] transition hover:ring-1 hover:ring-indigo-400 ${levelFor(day.revisions)} ${
                        onSelect ? 'cursor-pointer' : 'cursor-default'
                      }`}
                    />
                  ) : (
                    <span key={di} className="h-3 w-3" />
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {hover
              ? `${formatDate(`${hover.date}T00:00:00`)} — ${hover.revisions} revised, ${hover.solved} solved`
              : `${totalRevisions} revisions in the last ${days.length} days`}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>Less</span>
            {LEVEL_LEGEND.map((l) => (
              <span key={l.label} className={`h-2.5 w-2.5 rounded-[3px] ${l.cls}`} title={l.label} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
