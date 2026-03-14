import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  status: "ok" | "rate_limited" | "region_blocked" | "error";
}

export interface FeishuVerifyResult {
  ok: boolean;
  error: string | null;
  bot_name: string | null;
}

export type LlmProvider = "claude" | "deepseek" | "deepseek_or" | "minimax";
export type Channel = "feishu" | "whatsapp" | "qq" | "clawin";

let logId = 0;

export type AppMode = "home" | "wizard" | "manage" | "skills";

interface WizardState {
  appMode: AppMode;
  currentStep: number;
  editingFromManage: boolean; // true = jumped from manage page, hide step bar

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
  qqAppId: string;
  qqAppSecret: string;
  qqRelayUrl: string;
  qqRelayToken: string;
  qqSaved: boolean;
  clawinRoomId: string;
  clawinRelayUrl: string;
  clawinSaved: boolean;

  // Step 4: Complete
  gatewayToken: string | null;

  // Actions
  setAppMode: (m: AppMode) => void;
  goTo: (step: number) => void;
  editStep: (step: number) => void; // jump from manage to a specific step
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
  setQqAppId: (v: string) => void;
  setQqAppSecret: (v: string) => void;
  setQqRelayUrl: (v: string) => void;
  setQqRelayToken: (v: string) => void;
  setQqSaved: (v: boolean) => void;
  setClawinRoomId: (v: string) => void;
  setClawinRelayUrl: (v: string) => void;
  setClawinSaved: (v: boolean) => void;
  setGatewayToken: (t: string) => void;
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  claude: "claude-sonnet-4-6",
  deepseek: "deepseek-chat",        // vllm → api.deepseek.com/v1
  deepseek_or: "deepseek/deepseek-chat",  // openrouter
  minimax: "minimax-m2.5:free",
};

export const useWizard = create<WizardState>()(persist((set) => ({
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
  activeChannel: "clawin",
  feishuAppId: "",
  feishuAppSecret: "",
  feishuVerified: null,
  feishuVerifying: false,
  whatsappReady: false,
  qqAppId: "",
  qqAppSecret: "",
  qqRelayUrl: "",
  qqRelayToken: "",
  qqSaved: false,
  clawinRoomId: "",
  clawinRelayUrl: "wss://openclaw.rewen.org",
  clawinSaved: false,
  gatewayToken: null,
  editingFromManage: false,

  setAppMode: (m) => set({ appMode: m, editingFromManage: false }),
  goTo: (step) => set({ currentStep: step }),
  editStep: (step) => set({ appMode: "wizard", currentStep: step, editingFromManage: true }),
  advance: () => set((s) => {
    if (s.editingFromManage) return { appMode: "manage", editingFromManage: false };
    return { currentStep: Math.min(s.currentStep + 1, 4) };
  }),
  back: () => set((s) => {
    if (s.editingFromManage) return { appMode: "manage", editingFromManage: false };
    return { currentStep: Math.max(s.currentStep - 1, 0) };
  }),

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
  setQqAppId: (v) => set({ qqAppId: v, qqSaved: false }),
  setQqAppSecret: (v) => set({ qqAppSecret: v, qqSaved: false }),
  setQqRelayUrl: (v) => set({ qqRelayUrl: v, qqSaved: false }),
  setQqRelayToken: (v) => set({ qqRelayToken: v, qqSaved: false }),
  setQqSaved: (v) => set({ qqSaved: v }),
  setClawinRoomId: (v) => set({ clawinRoomId: v, clawinSaved: false }),
  setClawinRelayUrl: (v) => set({ clawinRelayUrl: v, clawinSaved: false }),
  setClawinSaved: (v) => set({ clawinSaved: v }),
  setGatewayToken: (t) => set({ gatewayToken: t }),
}), {
  name: "openclaw-channel-config",
  partialize: (state) => ({
    // Only persist channel configuration fields
    feishuAppId: state.feishuAppId,
    feishuAppSecret: state.feishuAppSecret,
    feishuVerified: state.feishuVerified,
    whatsappReady: state.whatsappReady,
    qqAppId: state.qqAppId,
    qqAppSecret: state.qqAppSecret,
    qqRelayUrl: state.qqRelayUrl,
    qqRelayToken: state.qqRelayToken,
    qqSaved: state.qqSaved,
    clawinRoomId: state.clawinRoomId,
    clawinRelayUrl: state.clawinRelayUrl,
    clawinSaved: state.clawinSaved,
    // Also persist LLM config
    llmProvider: state.llmProvider,
    llmApiKey: state.llmApiKey,
    llmModel: state.llmModel,
  }),
}));

export const DEFAULT_MODELS_MAP = DEFAULT_MODELS;
