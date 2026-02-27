interface ProgressBarProps {
  currentStep: number;
  totalSteps?: number;
  labels?: string[];
}

export default function ProgressBar({ currentStep, totalSteps = 4, labels = ['Connect', 'Graph', 'Configure', 'Launch'] }: ProgressBarProps) {
  return (
    <div className="w-full bg-muted border-b border-border px-4 py-3">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full transition-colors ${
                  i + 1 < currentStep
                    ? 'bg-primary'
                    : i + 1 === currentStep
                    ? 'bg-primary glow-teal-sm'
                    : 'bg-accent'
                }`}
              />
              <span className={`text-[10px] font-mono mt-1 hidden sm:block ${
                i + 1 <= currentStep ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {labels[i]}
              </span>
            </div>
            {i < totalSteps - 1 && (
              <div className={`w-12 sm:w-20 h-px mx-2 ${
                i + 1 < currentStep ? 'bg-primary' : 'bg-accent'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
