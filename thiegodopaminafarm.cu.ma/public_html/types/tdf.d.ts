/* ============================================================
   THIEGO DOPAMINA FARM — types/tdf.d.ts
   Contratos globais dos módulos do jogo (documentação + tipos
   para migração futura a TypeScript). Não compila nada: o jogo
   roda em JS puro; estes tipos apenas descrevem o que existe.
   ============================================================ */

/* ---------- números gigantes {m, e} ---------- */
interface TDFBigNum {
  m: number;
  e: number;
}

interface TDFNum {
  zero: TDFBigNum;
  one: TDFBigNum;
  fromF(x: number | string | { m: number; e?: number }): TDFBigNum;
  fromLog10(l: number): TDFBigNum;
  parse(s: string | number): TDFBigNum;
  toF(a: TDFBigNum | number): number;
  add(a: TDFBigNum, b: TDFBigNum): TDFBigNum;
  sub(a: TDFBigNum, b: TDFBigNum): TDFBigNum;
  mul(a: TDFBigNum, b: TDFBigNum): TDFBigNum;
  div(a: TDFBigNum, b: TDFBigNum): TDFBigNum;
  pow(a: TDFBigNum, p: number): TDFBigNum;
  log10(a: TDFBigNum): number;
  floor(a: TDFBigNum): TDFBigNum;
  cmp(a: TDFBigNum, b: TDFBigNum): number;
  lt(a: TDFBigNum, b: TDFBigNum): boolean;
  lte(a: TDFBigNum, b: TDFBigNum): boolean;
  gt(a: TDFBigNum, b: TDFBigNum): boolean;
  gte(a: TDFBigNum, b: TDFBigNum): boolean;
  eq(a: TDFBigNum, b: TDFBigNum): boolean;
  min(a: TDFBigNum, b: TDFBigNum): TDFBigNum;
  max(a: TDFBigNum, b: TDFBigNum): TDFBigNum;
  fmt(a: TDFBigNum | number, opts?: { space?: boolean }): string;
  fmtNice(a: TDFBigNum | number): string;
  ser(a: TDFBigNum): string;
}

/* ---------- registro de conteúdo ---------- */
interface TDFGenerator {
  name: string;
  icon: string;
  desc: string;
  baseCost: number;
  growth: number;
  baseProd: number;
}

interface TDFEffect {
  type: string;
  value: number;
  maxLevel?: number;
}

interface TDFUpgrade {
  id: string;
  cat: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  effect: TDFEffect;
}

interface TDFTreeItem {
  id: string;
  max: number;
  [k: string]: unknown;
}

interface TDFMilestone {
  id: string;
  log10: number;
  reward: number;
}

interface TDFData {
  GENERATORS: TDFGenerator[];
  MILESTONES: number[];
  MILESTONE_MULT: number;
  DOPAMINE_MILESTONES: TDFMilestone[];
  UPGRADES: TDFUpgrade[];
  PRESTIGE_TREE: TDFTreeItem[];
  TRANSCENDENCE_TREE: TDFTreeItem[];
  EVOLUTIONS: { name: string; icon?: string }[];
  ACHIEVEMENTS: { id: string }[];
  asset(name: string): string;
  [k: string]: unknown;
}

/* ---------- state (save v4) ---------- */
interface TDFState {
  version: number;
  dopamine: TDFBigNum;
  totalEarned: TDFBigNum;
  runEarned: TDFBigNum;
  bestRun: TDFBigNum;
  gens: number[];
  upgrades: Record<string, number>;
  tree: Record<string, number>;
  tier: number;
  prestige: number;
  points: number;
  pointsSpent: number;
  transcends: number;
  tPoints: number;
  tPointsSpent: number;
  transTree: Record<string, number>;
  achievements: string[];
  title: string | null;
  secrets: Record<string, boolean>;
  milestones: string[];
  dayStreak: number;
  lastActiveDay: string;
  counters: Record<string, number | TDFBigNum>;
  offlineTime: number;
  playTime: number;
  missionClaims: number;
  stats: Record<string, TDFBigNum>;
  missions: unknown;
  settings: Record<string, unknown>;
  timestamps: { startedAt: number; savedAt: number };
  migrated: boolean;
}

/* ---------- módulos globais ---------- */
interface Window {
  Num: TDFNum;
  TDF: TDFData;
  Game: {
    state: TDFState;
    s: TDFState;
    load(): unknown;
    save(): void;
    tick(dt: number): void;
    click(): { gain: TDFBigNum; crit: boolean; combo: number; critStreak: number };
    buyGen(i: number, n: number): boolean;
    buyUpgrade(id: string): boolean;
    applyOffline(state: TDFState, elapsed: number): unknown;
    tickDayStreak(): void;
    checkMilestones(initial?: boolean): void;
    isFreshSave(): boolean;
    addSecret(id: string): void;
    [k: string]: unknown;
  };
  Save: {
    KEY: string;
    ADMIN_KEY: string;
    sanitize(d: unknown): TDFState | null;
    save(state: TDFState): void;
    load(): TDFState | { _tooNew: true };
    export(state: TDFState): string;
    import(txt: string): boolean;
    reset(): void;
    fresh(): TDFState;
    setAdminSave(on: boolean): void;
    activeKey(): string;
  };
  Econ: Record<string, unknown>;
  UI: {
    init(): void;
    tick(dt: number): void;
    flush(): void;
    toast(msg: string, kind?: string, dur?: number): void;
    selectedTab?: string;
    touchSaveStatus?(): void;
    [k: string]: unknown;
  };
  Fx: {
    init(host: HTMLElement): void;
    update(dt: number): void;
    draw(): void;
    flash(color: string, ms: number): void;
    setParticles(on: boolean): void;
    setAnimations(on: boolean): void;
    [k: string]: unknown;
  };
  AC: { flags: number; warned: boolean; sample(log10: number): boolean; clickRate(): number; flag(): void; saneLog10(t: number): number };
  TDFNet: {
    logged: boolean;
    user: { username: string; admin_mode?: number } | null;
    progress: unknown;
    csrf: string | null;
    restore(): Promise<unknown>;
    login(i: string, p: string): Promise<unknown>;
    register(u: string, e: string, p: string): Promise<unknown>;
    logout(): Promise<unknown>;
    get(file: string, route: string): Promise<unknown>;
    post(file: string, route: string, body?: unknown): Promise<unknown>;
    [k: string]: unknown;
  };
  Expansion: {
    booted: boolean;
    netReady: boolean;
    state: unknown;
    boot(): void;
    tick(dt: number): void;
    sync(force?: boolean): Promise<unknown>;
    [k: string]: unknown;
  };
  Leaderboard: {
    online: boolean;
    logged: boolean;
    refresh(): Promise<unknown>;
    submit(force: boolean): Promise<unknown>;
    submitSave(force: boolean): Promise<unknown>;
    restoreSave(): Promise<unknown>;
    bestRankFromStorage(): void;
    saveRevision?: number;
    saveOwner?: string;
    [k: string]: unknown;
  };
  AudioFX: {
    unlock(): void;
    setVolume(v: number): void;
    setMusic(on: boolean): void;
    enabled: boolean;
    sfx: Record<string, () => void>;
  };
  DB: {
    pushSample(state: TDFState): void;
    getHistory(hours?: number): Promise<unknown[]>;
    saveBackup(state: TDFState): Promise<void>;
    loadBackup(): Promise<TDFState | null>;
    cacheSet(key: string, data: unknown, ttlMs?: number): Promise<void>;
    cacheGet(key: string): Promise<unknown>;
    tick(dt: number, state: TDFState): void;
  };
  BG3D: { enabled: boolean; tier: number; init(): void; destroy(): void; sync(): void };
  PWA: {
    swReady: boolean;
    pushSubscribed: boolean;
    subscribe(vapidKey: string): Promise<boolean>;
    unsubscribe(): Promise<boolean>;
  };
  Realtime: {
    connected: boolean;
    init(): void;
    destroy(): void;
    on(event: string, cb: (data: unknown) => void): void;
    send(type: string, data?: unknown): void;
  };
  AI: {
    enabled: boolean;
    init(): void;
    fetchDaily(): Promise<unknown>;
    [k: string]: unknown;
  };
  RestoreServerSave?: () => Promise<unknown>;
  SaveNow?: (force: boolean) => Promise<unknown>;
}>