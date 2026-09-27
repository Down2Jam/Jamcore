export type PreferenceFamily =
  | "tags"
  | "controls"
  | "platforms"
  | "duration"
  | "competition"
  | "creators";

export type PreferenceReason = {
  family: PreferenceFamily;
  label: string;
  contribution: number;
};

export type PreferenceGame = {
  tags?: Array<{ id: number; name: string; alwaysAdded?: boolean }>;
  inputMethods?: string[];
  downloadLinks?: Array<{ platform: string }>;
  playableBuildUrl?: string | null;
  itchEmbedUrl?: string | null;
  estOneRun?: string | null;
  achievements?: Array<{ id: number }>;
  leaderboards?: Array<{ id: number }>;
  team?: {
    ownerId: number;
    owner?: { id: number; name: string };
    users: Array<{ id: number; name?: string }>;
  } | null;
};

export type PreferenceExample = {
  game: PreferenceGame;
  value: number;
  updatedAt: Date;
  picked: boolean;
};

type Feature = { id: string; label: string };
type FeatureSet = Record<PreferenceFamily, Feature[]>;
type Evidence = { net: number; support: number };

const FAMILY_WEIGHTS: Record<PreferenceFamily, number> = {
  tags: 0.4,
  controls: 0.25,
  platforms: 0.2,
  duration: 0.075,
  competition: 0.075,
  creators: 0.5,
};
const PERSONAL_ADJUSTMENT_STRENGTH = 8;
const FAMILIES = Object.keys(FAMILY_WEIGHTS) as PreferenceFamily[];
const CONTROL_LABELS: Record<string, string> = {
  KeyboardMouse: "Keyboard and mouse",
  Gamepad: "Gamepad",
  Touch: "Touch",
  KeyboardOnly: "Keyboard only",
  MouseOnly: "Mouse only",
  Motion: "Motion controls",
  VR: "VR",
};
const PLATFORMS = new Set(["Web", "Windows", "MacOS", "Linux", "Mobile"]);
const DURATION_BUCKETS: Record<string, string> = {
  "Under 5 mins": "Under 10 minutes",
  "5–10 mins": "Under 10 minutes",
  "10–20 mins": "10–60 minutes",
  "20-30 mins": "10–60 minutes",
  "30–60 min": "10–60 minutes",
  "1–2 hours": "Over an hour",
  "2–3 hours": "Over an hour",
  "3–5 hours": "Over an hour",
  "5–10 hours": "Over an hour",
  "10+ hours": "Over an hour",
};

function uniqueFeatures(features: Feature[]) {
  return [...new Map(features.map((feature) => [feature.id, feature])).values()];
}

export function extractPreferenceFeatures(game: PreferenceGame): FeatureSet {
  const creators = new Map<number, string>();
  if (game.team?.ownerId) {
    creators.set(game.team.ownerId, game.team.owner?.name ?? `Creator ${game.team.ownerId}`);
  }
  game.team?.users.forEach((user) => {
    creators.set(user.id, user.name ?? `Creator ${user.id}`);
  });

  const platforms = (game.downloadLinks ?? [])
    .map((link) => link.platform)
    .filter((platform) => PLATFORMS.has(platform));
  if (game.playableBuildUrl || game.itchEmbedUrl) platforms.push("Web");

  const duration = game.estOneRun ? DURATION_BUCKETS[game.estOneRun] : undefined;

  return {
    tags: uniqueFeatures((game.tags ?? [])
      .filter((tag) => !tag.alwaysAdded)
      .map((tag) => ({ id: String(tag.id), label: tag.name }))),
    controls: uniqueFeatures((game.inputMethods ?? [])
      .filter((method) => method in CONTROL_LABELS)
      .map((method) => ({ id: method, label: CONTROL_LABELS[method] }))),
    platforms: uniqueFeatures(platforms.map((platform) => ({ id: platform, label: platform }))),
    duration: duration ? [{ id: duration, label: duration }] : [],
    competition: [
      ...((game.leaderboards?.length ?? 0) > 0 ? [{ id: "leaderboards", label: "Leaderboards" }] : []),
      ...((game.achievements?.length ?? 0) > 0 ? [{ id: "achievements", label: "Achievements" }] : []),
    ],
    creators: [...creators].map(([id, label]) => ({ id: String(id), label })),
  };
}

function exampleStrength(example: PreferenceExample, now: number) {
  if (example.picked) return 2 * 0.5 ** (Math.max(0, now - example.updatedAt.getTime()) / (18 * 30.4375 * 24 * 60 * 60_000));

  const value = example.value;
  const signed = value >= 8 ? Math.min((value - 7) / 3, 1)
    : value >= 1 && value <= 4 ? -(5 - value) / 4
    : 0;
  return signed * 0.5 ** (Math.max(0, now - example.updatedAt.getTime()) / (18 * 30.4375 * 24 * 60 * 60_000));
}

export function buildPreferenceScorer(
  examples: PreferenceExample[],
  candidates: PreferenceGame[],
  now = Date.now(),
) {
  const evidence = Object.fromEntries(FAMILIES.map((family) => [family, new Map<string, Evidence>()])) as Record<PreferenceFamily, Map<string, Evidence>>;
  const prevalence = Object.fromEntries(FAMILIES.map((family) => [family, new Map<string, number>()])) as Record<PreferenceFamily, Map<string, number>>;

  candidates.forEach((candidate) => {
    const features = extractPreferenceFeatures(candidate);
    FAMILIES.forEach((family) => features[family].forEach((feature) => {
      prevalence[family].set(feature.id, (prevalence[family].get(feature.id) ?? 0) + 1);
    }));
  });

  examples.forEach((example) => {
    const strength = exampleStrength(example, now);
    if (strength === 0) return;
    const features = extractPreferenceFeatures(example.game);
    FAMILIES.forEach((family) => {
      const share = family === "creators" ? 1 / Math.max(features.creators.length, 1) : 1;
      features[family].forEach((feature) => {
        const current = evidence[family].get(feature.id) ?? { net: 0, support: 0 };
        current.net += strength * share;
        current.support += Math.abs(strength) * share;
        evidence[family].set(feature.id, current);
      });
    });
  });

  return (candidate: PreferenceGame) => {
    const features = extractPreferenceFeatures(candidate);
    const reasons: PreferenceReason[] = [];
    let adjustment = 0;

    FAMILIES.forEach((family) => {
      const matched = features[family];
      if (matched.length === 0) return;

      matched.forEach((feature) => {
        const learned = evidence[family].get(feature.id);
        if (!learned) return;
        const commonness = (prevalence[family].get(feature.id) ?? 0) / Math.max(candidates.length, 1);
        const rarity = family === "creators" ? 1 : Math.max(0.2, 1 - commonness);
        const contribution = PERSONAL_ADJUSTMENT_STRENGTH * FAMILY_WEIGHTS[family] * learned.net / (learned.support + 1) * rarity / matched.length;
        adjustment += contribution;
        if (contribution !== 0) {
          reasons.push({ family, label: feature.label, contribution });
        }
      });
    });

    reasons.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    return { adjustment, reasons };
  };
}
