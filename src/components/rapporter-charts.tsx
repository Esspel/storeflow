import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"];

interface TaskTrendItem { week: string; completed: number; created: number }
interface IncidentCategoryItem { category: string; count: number }

export function TaskTrendChart({ data }: { data: TaskTrendItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="week" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
        <YAxis tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
        <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", fontSize: 12 }} />
        <Bar dataKey="created" name="Skapade" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="completed" name="Klara" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IncidentsPieChart({ data }: { data: IncidentCategoryItem[] }) {
  return (
    <div className="flex flex-col md:flex-row gap-4 items-center">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={({ category, percent }: { category: string; percent: number }) => `${category} ${Math.round(percent * 100)}%`}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 shrink-0">
        {data.map((item, i) => (
          <div key={item.category} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-foreground">{item.category}</span>
            <span className="text-muted-foreground ml-auto pl-4">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
