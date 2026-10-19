export interface ShelfLifeCategoryData {
  label: string;
  withShelfLife: number;
  withoutShelfLife: number;
  total: number;
}

interface ReplacementChartProps {
  data: ShelfLifeCategoryData[];
}

export default function ReplacementChart({ data }: ReplacementChartProps) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="w-full rounded-xl bg-white/80 p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Ersättningsstatus per kategori</h3>
      <div className="space-y-3">
        {data.map((item, i) => {
          const percentTotal = ((item.withShelfLife + item.withoutShelfLife) / max) * 100;
          const percentWith = (item.withShelfLife / max) * 100;
          const percentWithout = (item.withoutShelfLife / max) * 100;
          const delay = i * 80; // ms
          return (
            <div key={item.label} className="animate-fade-in">
              <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                <span>{item.label}</span>
                <span>Totalt {item.total}</span>
              </div>
              <div className="relative h-4 w-full rounded-full overflow-hidden bg-gray-100/60 shadow-inner">
                {/* Genomskinlig bakgrund: det som är kvar */}
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-amber-200/40"
                  style={{ width: `${percentTotal}%`, transition: `width 0.7s ease ${delay}ms` }}
                />
                {/* Gjort: med shelf-life (lägre, grönt) */}
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-emerald-400/70"
                  style={{ width: `${percentWith}%`, transition: `width 0.7s ease ${delay + 150}ms` }}
                />
                {/* Gjort: utan shelf-life (övre, rött) ovanpå */}
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-rose-400/70 mix-blend-multiply"
                  style={{ width: `${percentWithout}%`, transition: `width 0.7s ease ${delay + 300}ms` }}
                />
              </div>
              <div className="flex gap-3 mt-0.5 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Med shelf-life {item.withShelfLife}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Utan shelf-life {item.withoutShelfLife}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-200/70" />
                  Kvar {Math.max(0, item.total - item.withShelfLife - item.withoutShelfLife)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}