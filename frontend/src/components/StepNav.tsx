import { Link, useNavigate } from 'react-router-dom';

interface StepNavProps {
  backTo?: string;
  backLabel?: string;
  nextTo?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext?: () => void;
  centerContent?: React.ReactNode;
}

export default function StepNav({ backTo, backLabel = '← Back', nextTo, nextLabel = 'Continue →', nextDisabled = false, onNext, centerContent }: StepNavProps) {
  const navigate = useNavigate();

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else if (nextTo) {
      navigate(nextTo);
    }
  };

  return (
    <div className="border-t border-border bg-muted px-4 sm:px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {backTo ? (
          <Link to={backTo} className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors">
            {backLabel}
          </Link>
        ) : <div />}
        {centerContent && <div className="hidden sm:block">{centerContent}</div>}
        {(nextTo || onNext) ? (
          <button
            onClick={handleNext}
            disabled={nextDisabled}
            className={`font-mono text-sm px-5 py-2.5 rounded-md transition-all ${
              nextDisabled
                ? 'bg-accent text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground glow-teal hover:opacity-90'
            }`}
          >
            {nextLabel}
          </button>
        ) : <div />}
      </div>
    </div>
  );
}
