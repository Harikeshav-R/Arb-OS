import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  currentStep: number;
  totalSteps?: number;
  labels?: string[];
}

export default function ProgressBar({
  currentStep,
  totalSteps = 4,
  labels = ["Connect", "Graph", "Configure", "Launch"],
}: ProgressBarProps) {
  const progressValue =
    totalSteps > 1 ? ((currentStep - 1) / (totalSteps - 1)) * 100 : currentStep === 1 ? 0 : 100;

  return (
    <div className="w-full bg-muted border-b border-border px-4 py-3">
      <div className="max-w-2xl mx-auto space-y-3">
        <Progress value={progressValue} max={100} type="default" />
        <div className="flex items-center justify-between">
          {labels.map((label, i) => (
            <span
              key={i}
              className={`text-[10px] font-mono hidden sm:block transition-colors duration-300 ${
                i + 1 <= currentStep ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
