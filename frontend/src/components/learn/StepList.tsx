interface Step {
  title: string;
  description: string;
}

interface StepListProps {
  steps: Step[];
}

export function StepList({ steps }: StepListProps) {
  return (
    <div className="space-y-5">
      {steps.map((step, index) => (
        <div key={step.title} className="flex gap-4">
          <span className="flex-shrink-0 w-9 h-9 rounded-full bg-vigil-900 text-white text-sm font-semibold flex items-center justify-center">
            {index + 1}
          </span>
          <div className="flex-1 pt-0.5">
            <h3 className="font-semibold text-gray-900 mb-1.5 text-base">{step.title}</h3>
            <p className="text-[15px] text-gray-600 leading-relaxed">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
