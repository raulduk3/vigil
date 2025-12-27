interface ExampleBoxProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function ExampleBox({ title, children, className = '' }: ExampleBoxProps) {
  return (
    <div className={`panel-inset w-full p-5 ${className}`}>
      {title && (
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
          {title}
        </p>
      )}
      <div className="text-[15px] text-gray-700 leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}
