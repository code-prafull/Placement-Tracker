import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Activity, Award, Brain, CalendarCheck2, Clock, Flame, Target, TrendingUp } from 'lucide-react';
import { getAnalytics } from '../services/statsService';
import { LoadingState } from '../components/common/Loading';
import { ErrorState, EmptyState } from '../components/common/States';
import { Card, PageHeader, SectionTitle } from '../components/common/Layout';
import { RESULT_META } from '../utils/constants';
import { formatShortDate, formatMinutes } from '../utils/dates';

const MEMORY_COLORS = {
  Forgotten: '#f43f5e',
  Weak: '#fb923c',
  Learning: '#fbbf24',
  Strong: '#34d399',
  Mastered: '#67e8f9',
};

const RESULT_COLORS = {
  forgot: '#f43f5e',
  hard: '#fb923c',
  good: '#34d399',
  easy: '#67e8f9',
};

const tooltipStyle = {
  backgroundColor: '#0b1220',
  border: '1px solid #1e293b',
  borderRadius: '10px',
  color: '#e2e8f0',
  fontSize: 12,
};

function StatTile({ icon: Icon, label, value, hint, accent = 'text-indigo-300' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon size={15} className={accent} />
      </div>
      <div className={`mt-1.5 text-2xl font-extrabold ${accent}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </Card>
  );
}

function ChartCard({ title, action, children, empty, emptyHint }) {
  return (
    <Card className="p-5">
      <SectionTitle action={action}>{title}</SectionTitle>
      {empty ? (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-slate-400">{empty}</p>
          {emptyHint && <p className="mt-1 text-xs text-slate-600">{emptyHint}</p>}
        </div>
      ) : (
        <div className="h-56 w-full">{children}</div>
      )}
    </Card>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getAnalytics());
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Crunching 374 revisions… no wait — YOUR revisions…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const t = data.totals;
  const hasRevisions = t.totalRevisions > 0;

  const activity = (data.revisionActivity || []).map((d) => ({
    ...d,
    day: formatShortDate(`${d.date}T00:00:00`),
  }));
  const activityEmpty = activity.every((d) => d.revisions === 0 && d.solved === 0);

  const freq = (data.revisionFrequency || []).map((w) => ({
    ...w,
    day: formatShortDate(`${w.week}T00:00:00`),
  }));

  const topicMemory = (data.topicMemory || []).slice(0, 10).map((x) => ({ ...x, name: x.topic }));
  const forgotten = (data.forgottenOverTime || []).map((d) => ({
    ...d,
    day: formatShortDate(`${d.date}T00:00:00`),
  }));

  return (
    <div className="animate-in">
      <PageHeader
        title="Analytics"
        subtitle="Everything aggregated from immutable revision history — computed on the server."
        actions={
          <Link
            to="/habit"
            className="rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            Habit tracker →
          </Link>
        }
      />

      {/* Headline numbers */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Target} label="Questions solved" value={t.totalQuestions} hint="in your bank" />
        <StatTile icon={Activity} label="Total revisions" value={t.totalRevisions} accent="text-indigo-300" hint={`avg interval ${t.avgInterval}d`} />
        <StatTile icon={Brain} label="Avg recall" value={`${t.avgRecall}%`} accent="text-emerald-400" hint="weighted across all ratings" />
        <StatTile icon={Award} label="Mastered" value={t.mastered} accent="text-cyan-300" hint={`${t.weak} weak · ${t.forgotten} forgotten`} />
        <StatTile icon={Flame} label="Current streak" value={`${t.revisionStreak}d`} accent="text-amber-400" hint={`longest ${t.longestStreak}d`} />
        <StatTile icon={CalendarCheck2} label="Active days" value={t.totalRevisionDays} accent="text-emerald-400" hint="days with ≥1 revision" />
        <StatTile icon={Clock} label="Time in revision" value={formatMinutes(t.totalRevisionMinutes)} accent="text-sky-400" hint="self-tracked per session" />
        <StatTile icon={TrendingUp} label="Weekly cadence" value={freq.length ? Math.round(freq.reduce((s, w) => s + w.revisions, 0) / 12) : 0} accent="text-rose-400" hint="revisions / week (12w avg)" />
      </div>

      {!hasRevisions && (
        <Card className="mb-6">
          <EmptyState
            icon={Activity}
            title="No revision history yet"
            message="Analytics come alive once you complete your first revision. The dashboard will show exactly how to start."
          />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Daily activity */}
        <ChartCard
          title="Revision activity — last 30 days"
          empty={activityEmpty ? 'No activity in the last 30 days' : null}
          emptyHint="Complete a revision or solve a question today."
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={activity} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b33' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revisions" name="Revised" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="solved" name="Solved" fill="#34d399" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Memory distribution */}
        <ChartCard
          title="Memory strength distribution"
          empty={t.totalQuestions === 0 ? 'No solved questions yet' : null}
        >
          <div className="flex h-full items-center">
            <ResponsiveContainer width="60%" height="100%">
              <PieChart>
                <Pie
                  data={data.memoryDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  stroke="#0b1220"
                >
                  {data.memoryDistribution.map((d) => (
                    <Cell key={d.name} fill={MEMORY_COLORS[d.name]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5 pl-2">
              {data.memoryDistribution.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MEMORY_COLORS[d.name] }} />
                  <span className="text-slate-400">{d.name}</span>
                  <span className="ml-auto font-bold text-slate-200">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Recall result split */}
        <ChartCard title="How you rate yourself" empty={!hasRevisions ? 'No ratings yet' : null}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.resultSplit} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b33' }} />
              <Bar dataKey="value" name="Ratings" radius={[5, 5, 0, 0]}>
                {data.resultSplit.map((d) => (
                  <Cell key={d.name} fill={RESULT_COLORS[d.name] || '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Weekly cadence */}
        <ChartCard title="Weekly revision cadence — 12 weeks" empty={freq.every((w) => w.revisions === 0) ? 'No weekly data yet' : null}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={freq} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b33' }} />
              <Bar dataKey="revisions" name="Revisions" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Topic memory */}
        <ChartCard
          title="Weakest topics first"
          action={
            <Link to="/roadmap" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
              Roadmap →
            </Link>
          }
          empty={topicMemory.length === 0 ? 'No revised questions per topic yet' : null}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topicMemory} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b33' }} />
              <Bar dataKey="memory" name="Memory %" radius={[0, 4, 4, 0]} barSize={13}>
                {topicMemory.map((d) => (
                  <Cell
                    key={d.topic}
                    fill={d.memory < 45 ? '#f43f5e' : d.memory < 65 ? '#fbbf24' : '#34d399'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Forgotten over time */}
        <ChartCard
          title="Forgotten questions over time"
          empty={forgotten.every((d) => d.forgotten === 0) ? 'Nothing forgotten — clean retention' : null}
          emptyHint="A question counts as forgotten from a “Forgot” rating until its next revision."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forgotten} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="forgotten"
                name="Forgotten"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Interval distribution */}
      <div className="mt-5">
        <ChartCard
          title="Interval distribution — how far apart your reviews actually happen"
          empty={data.intervalDistribution.length === 0 ? 'No completed intervals yet' : null}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.intervalDistribution} margin={{ top: 5, right: 5, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b33' }} />
              <Bar dataKey="value" name="Reviews" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Rating values: Forgot 0% · Hard 35% · Good 75% · Easy 100% — recall average is computed across every
        immutable revision row.
      </p>
    </div>
  );
}
