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
      {/* Toolbar — macOS-style centered title area */}
      <div className="flex items-center justify-center px-6 pt-4 pb-2">
        {isWizard && <StepIndicator current={currentStep} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col px-6 pb-5 overflow-y-auto">
        {appMode === "home" && <Step0_Welcome />}
        {appMode === "wizard" && <StepComponent />}
        {appMode === "manage" && <ManagePage />}
      </div>
    </div>
  );
}

export default App;
