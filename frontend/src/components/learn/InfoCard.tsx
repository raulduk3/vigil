interface InfoCardProps {
  title: string;
  description: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'critical' | 'neutral';
}

export function InfoCard({ title, description, variant = 'default' }: InfoCardProps) {
  const borderColors = {
    default: 'border-gray-200',
    primary: 'border-vigil-500',
    success: 'border-green-500',
    warning: 'border-amber-500',
    critical: 'border-red-500',
    neutral: 'border-gray-400',
  };

  return (
    <div className={`panel w-full p-5 border-l-2 ${borderColors[variant]}`}>
      <h3 className="font-semibold text-gray-900 mb-2 text-base">{title}</h3>
      <p className="text-[15px] text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}
