import { useWizard } from "@/store/wizard";
import { StepIndicator } from "@/components/StepIndicator";
import { Step0_Welcome } from "@/steps/Step0_Welcome";
import { Step1_Environment } from "@/steps/Step1_Environment";
import { Step2_Model } from "@/steps/Step2_Model";
import { Step3_Channel } from "@/steps/Step3_Channel";
import { Step4_Complete } from "@/steps/Step4_Complete";
import { ManagePage } from "@/pages/ManagePage";

const WIZARD_STEPS = [
  Step0_Welcome,   // never rendered in wizard mode (step 0 = home)
  Step1_Environment,
  Step2_Model,
  Step3_Channel,
  Step4_Complete,
];

function App() {
  const { appMode, currentStep } = useWizard();

  const isWizard = appMode === "wizard";
  const StepComponent = WIZARD_STEPS[currentStep];

  return (
    <div className="flex flex-col h-screen bg-[hsl(var(--background))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-[hsl(var(--primary))]">
            OPENCLAW
          </span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
            OC1
          </span>
        </div>
        {isWizard && <StepIndicator current={currentStep} />}
        <div className="w-24" />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col px-4 py-4">
        {appMode === "home" && <Step0_Welcome />}
        {appMode === "wizard" && <StepComponent />}
        {appMode === "manage" && <ManagePage />}
      </div>
    </div>
  );
}

export default App;
