interface Feature {
  title: string;
  description: string;
}

interface FeatureGridProps {
  features: Feature[];
}

export function FeatureGrid({ features }: FeatureGridProps) {
  return (
    <div className="grid md:grid-cols-2 gap-5">
      {features.map((feature) => (
        <div key={feature.title} className="panel p-5">
          <h3 className="font-semibold text-gray-900 mb-2 text-base">{feature.title}</h3>
          <p className="text-[15px] text-gray-600 leading-relaxed">{feature.description}</p>
        </div>
      ))}
    </div>
  );
}
