interface StatusItem {
  label: string;
  description: string;
  status: 'ok' | 'warning' | 'critical' | 'neutral';
}

interface StatusListProps {
  items: StatusItem[];
}

export function StatusList({ items }: StatusListProps) {
  const statusColors = {
    ok: 'bg-status-ok',
    warning: 'bg-status-warning',
    critical: 'bg-status-critical',
    neutral: 'bg-gray-400',
  };

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="panel p-5 flex gap-4 items-start">
          <span className={`w-3 h-3 rounded-full ${statusColors[item.status]} mt-1.5 flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 mb-1.5 text-base">{item.label}</p>
            <p className="text-[15px] text-gray-600 leading-relaxed">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
