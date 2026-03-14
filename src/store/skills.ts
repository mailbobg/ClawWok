import { create } from "zustand";

export interface MissingRequirements {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface InstallOption {
  id: string;
  kind: string;
  label: string;
  bins?: string[];
  formula?: string;
  cask?: string;
  package?: string;
}

export interface SkillDetail {
  name: string;
  install: InstallOption[];
}

export interface SkillItem {
  name: string;
  description: string;
  emoji?: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  source: string;
  bundled: boolean;
  homepage?: string;
  missing: MissingRequirements;
  installedAt?: number;
  dirName?: string;
}

export interface SkillsListResult {
  skills: SkillItem[];
  total: number;
  eligibleCount: number;
}

export type SkillFilter = "all" | "eligible" | "disabled" | "missing";

interface SkillsState {
  skills: SkillItem[];
  total: number;
  eligibleCount: number;
  loading: boolean;
  error: string | null;
  filter: SkillFilter;
  searchQuery: string;
  expandedSkill: string | null;
  togglingSkill: string | null;
  installingSkill: string | null;
  installDone: boolean;
  installLogs: string[];
  skillDetails: Record<string, SkillDetail>;

  setSkills: (result: SkillsListResult) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setFilter: (f: SkillFilter) => void;
  setSearchQuery: (q: string) => void;
  setExpandedSkill: (name: string | null) => void;
  setTogglingSkill: (name: string | null) => void;
  updateSkillDisabled: (name: string, disabled: boolean) => void;
  setInstallingSkill: (name: string | null) => void;
  setInstallDone: (v: boolean) => void;
  appendInstallLog: (text: string) => void;
  clearInstallLogs: () => void;
  setSkillDetail: (name: string, detail: SkillDetail) => void;
  clearSkillDetail: (name: string) => void;
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: [],
  total: 0,
  eligibleCount: 0,
  loading: false,
  error: null,
  filter: "all",
  searchQuery: "",
  expandedSkill: null,
  togglingSkill: null,
  installingSkill: null,
  installDone: false,
  installLogs: [],
  skillDetails: {},

  setSkills: (result) =>
    set({
      skills: result.skills,
      total: result.total,
      eligibleCount: result.eligibleCount,
      error: null,
    }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  setFilter: (f) => set({ filter: f }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setExpandedSkill: (name) =>
    set((s) => ({ expandedSkill: s.expandedSkill === name ? null : name })),
  setTogglingSkill: (name) => set({ togglingSkill: name }),
  updateSkillDisabled: (name, disabled) =>
    set((s) => ({
      skills: s.skills.map((sk) =>
        sk.name === name ? { ...sk, disabled } : sk
      ),
    })),
  setInstallingSkill: (name) => set({ installingSkill: name }),
  setInstallDone: (v) => set({ installDone: v }),
  appendInstallLog: (text) =>
    set((s) => ({ installLogs: [...s.installLogs, text] })),
  clearInstallLogs: () => set({ installLogs: [], installDone: false }),
  setSkillDetail: (name, detail) =>
    set((s) => ({
      skillDetails: { ...s.skillDetails, [name]: detail },
    })),
  clearSkillDetail: (name) =>
    set((s) => {
      const { [name]: _, ...rest } = s.skillDetails;
      return { skillDetails: rest };
    }),
}));
