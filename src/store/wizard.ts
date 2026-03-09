import { create } from "zustand";

export interface LogLine {
  id: number;
  text: string;
  ts: number;
}

export interface EnvReport {
  os: string;
  arch: string;
  node_version: string | null;
  npm_version: string | null;
  brew_installed: boolean;
  git_installed: boolean;
  needs_node: boolean;
  needs_brew: boolean;
}

export interface TestResult {
  ok: boolean;
  latency_ms: number;
  error: string | null;
  model_name: string | null;
}

export interface FeishuVerifyResult {
  ok: boolean;
  error: string | null;
  bot_name: string | null;
}

export type LlmProvider = "claude" | "deepseek" | "deepseek_or" | "minimax";
export type Channel = "feishu" | "whatsapp";

let logId = 0;

export type AppMode = "home" | "wizard" | "manage";

interface WizardState {
  appMode: AppMode;
  currentStep: number;

  // Step 1: Environment
  envReport: EnvReport | null;
  envLogs: LogLine[];
  envReady: boolean;
  envLoading: boolean;

  // Step 2: LLM
  llmProvider: LlmProvider;
  llmApiKey: string;
  llmModel: string;
  llmTestResult: TestResult | null;
  llmTesting: boolean;

  // Step 3: Channel
  activeChannel: Channel;
  feishuAppId: string;
  feishuAppSecret: string;
  feishuVerified: FeishuVerifyResult | null;
  feishuVerifying: boolean;
  whatsappReady: boolean;

  // Step 4: Complete
  gatewayToken: string | null;

  // Actions
  setAppMode: (m: AppMode) => void;
  goTo: (step: number) => void;
  advance: () => void;
  back: () => void;
  appendLog: (text: string) => void;
  clearLogs: () => void;
  setEnvReport: (r: EnvReport) => void;
  setEnvReady: (v: boolean) => void;
  setEnvLoading: (v: boolean) => void;
  setLlmProvider: (p: LlmProvider) => void;
  setLlmApiKey: (k: string) => void;
  setLlmModel: (m: string) => void;
  setLlmTestResult: (r: TestResult | null) => void;
  setLlmTesting: (v: boolean) => void;
  setActiveChannel: (c: Channel) => void;
  setFeishuAppId: (v: string) => void;
  setFeishuAppSecret: (v: string) => void;
  setFeishuVerified: (r: FeishuVerifyResult | null) => void;
  setFeishuVerifying: (v: boolean) => void;
  setWhatsappReady: (v: boolean) => void;
  setGatewayToken: (t: string) => void;
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  claude: "claude-sonnet-4-6",
  deepseek: "deepseek-chat",        // vllm → api.deepseek.com/v1
  deepseek_or: "deepseek/deepseek-chat-v3-0324",  // openrouter
  minimax: "minimax-m2.5:free",
};

export const useWizard = create<WizardState>((set) => ({
  appMode: "home",
  currentStep: 0,
  envReport: null,
  envLogs: [],
  envReady: false,
  envLoading: false,
  llmProvider: "deepseek",
  llmApiKey: "",
  llmModel: DEFAULT_MODELS["deepseek"],
  llmTestResult: null,
  llmTesting: false,
  activeChannel: "feishu",
  feishuAppId: "",
  feishuAppSecret: "",
  feishuVerified: null,
  feishuVerifying: false,
  whatsappReady: false,
  gatewayToken: null,

  setAppMode: (m) => set({ appMode: m }),
  goTo: (step) => set({ currentStep: step }),
  advance: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 4) })),
  back: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),

  appendLog: (text) =>
    set((s) => ({
      envLogs: [...s.envLogs, { id: logId++, text, ts: Date.now() }],
    })),
  clearLogs: () => set({ envLogs: [] }),

  setEnvReport: (r) => set({ envReport: r }),
  setEnvReady: (v) => set({ envReady: v }),
  setEnvLoading: (v) => set({ envLoading: v }),

  setLlmProvider: (p) =>
    set({ llmProvider: p, llmModel: DEFAULT_MODELS[p], llmTestResult: null }),
  setLlmApiKey: (k) => set({ llmApiKey: k, llmTestResult: null }),
  setLlmModel: (m) => set({ llmModel: m }),
  setLlmTestResult: (r) => set({ llmTestResult: r }),
  setLlmTesting: (v) => set({ llmTesting: v }),

  setActiveChannel: (c) => set({ activeChannel: c }),
  setFeishuAppId: (v) => set({ feishuAppId: v, feishuVerified: null }),
  setFeishuAppSecret: (v) => set({ feishuAppSecret: v, feishuVerified: null }),
  setFeishuVerified: (r) => set({ feishuVerified: r }),
  setFeishuVerifying: (v) => set({ feishuVerifying: v }),
  setWhatsappReady: (v) => set({ whatsappReady: v }),
  setGatewayToken: (t) => set({ gatewayToken: t }),
}));

export const DEFAULT_MODELS_MAP = DEFAULT_MODELS;
