export type DistressRating = 1 | 2 | 3 | 4 | 5;

export type PostFeeling = 'Calmer 🌿' | 'Same ⚖️' | 'Still Overwhelmed 🌊';

export type SenseKey = 'sight' | 'touch' | 'sound' | 'smell' | 'taste';

export interface GroundingStepConfig {
  stepNumber: number;
  senseKey: SenseKey;
  senseName: string;
  iconName: string;
  targetCount: number;
  prompt: string;
  clinicalCue: string;
  guidedAudioScript: string;
  defaultSuggestions: string[];
}

export const GUIDED_AUDIO_SCRIPTS: Record<number, string> = {
  5: 'Gently look around you. Notice 5 things you can see.',
  4: 'Feel your body supported. Notice 4 things you can physically feel.',
  3: 'Listen into your space. Notice 3 sounds around you.',
  2: 'Take a calm breath in. Notice 2 scents in the air.',
  1: 'Notice 1 sensation or taste resting in your mouth.',
};

export const HAPTIC_PATTERNS = {
  tap: [15],
  chipToggle: [18],
  buttonPress: [25],
  stepComplete: [25, 45, 25],
  sessionComplete: [30, 40, 30, 50, 40],
} as const;

export type HapticType = keyof typeof HAPTIC_PATTERNS;

export function triggerHaptic(type: HapticType, enabled = true): boolean {
  if (!enabled || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      const pattern = HAPTIC_PATTERNS[type] || [15];
      return navigator.vibrate(pattern as unknown as number[]);
    }
  } catch {
    // Graceful fallback if vibration permission restricted
  }
  return false;
}

export const GROUNDING_STEPS: GroundingStepConfig[] = [
  {
    stepNumber: 5,
    senseKey: 'sight',
    senseName: 'Sight',
    iconName: 'Eye',
    targetCount: 5,
    prompt: 'Notice 5 things you can see around you.',
    clinicalCue: 'Scan your space slowly. Acknowledge shapes, light reflections, or small details.',
    guidedAudioScript: GUIDED_AUDIO_SCRIPTS[5],
    defaultSuggestions: ['Lamp', 'Window', 'Hands', 'Wall', 'Desk'],
  },
  {
    stepNumber: 4,
    senseKey: 'touch',
    senseName: 'Touch',
    iconName: 'Hand',
    targetCount: 4,
    prompt: 'Notice 4 things you can physically feel.',
    clinicalCue: 'Feel your contact points. Feet on floor, fabric texture, or cool air.',
    guidedAudioScript: GUIDED_AUDIO_SCRIPTS[4],
    defaultSuggestions: ['Feet on floor', 'Chair support', 'Texture of clothes', 'Air temperature'],
  },
  {
    stepNumber: 3,
    senseKey: 'sound',
    senseName: 'Sound',
    iconName: 'Ear',
    targetCount: 3,
    prompt: 'Notice 3 things you can hear.',
    clinicalCue: 'Listen past the loudest sound into the ambient room layers.',
    guidedAudioScript: GUIDED_AUDIO_SCRIPTS[3],
    defaultSuggestions: ['Distant hum', 'Breathing', 'Room ambience'],
  },
  {
    stepNumber: 2,
    senseKey: 'smell',
    senseName: 'Smell',
    iconName: 'Wind',
    targetCount: 2,
    prompt: 'Notice 2 scents or comforting smells.',
    clinicalCue: 'Inhale gently through your nose. Notice the air or scents nearby.',
    guidedAudioScript: GUIDED_AUDIO_SCRIPTS[2],
    defaultSuggestions: ['Fresh air', 'Coffee or tea aroma'],
  },
  {
    stepNumber: 1,
    senseKey: 'taste',
    senseName: 'Taste',
    iconName: 'Sparkles',
    targetCount: 1,
    prompt: 'Notice 1 sensation or taste in your mouth.',
    clinicalCue: 'Notice where your tongue is resting, or the clean taste of your breath.',
    guidedAudioScript: GUIDED_AUDIO_SCRIPTS[1],
    defaultSuggestions: ['Current taste / breath'],
  },
];

export interface AnchorActivation {
  stepNumber: number;
  nodeIndex: number;
  timestamp: number;
  dwellSeconds?: number;
  note?: string;
}

export interface StepRecord {
  stepNumber: number;
  senseKey: SenseKey;
  senseName: string;
  targetCount: number;
  itemsNoticed: string[];
  skipped: boolean;
  durationSeconds: number;
  guidedAudioPlayed?: boolean;
}

export interface SomaticShiftDelta {
  initialDistress: DistressRating;
  postFeeling: PostFeeling;
  estimatedPostScore: number;
  deltaReduction: number;
  percentShift: number;
  vagalStatusBadge: string;
  averageDwellSeconds: number;
  dwellPacingLabel: 'Optimal Mindful Dwell (4-6s)' | 'Gentle Grounding' | 'Rapid Activation';
  isPacingOptimal: boolean;
}

export interface PostHogEvent {
  event: 'grounding_tool_started' | 'grounding_step_completed' | 'grounding_tool_completed' | 'guided_audio_played';
  timestamp: string;
  properties: Record<string, unknown>;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remainingSecs = Math.round(seconds % 60);
  return `${mins}m ${remainingSecs}s`;
}

export function calculateAverageDwellTime(
  activations: AnchorActivation[],
  totalActiveTimeSeconds: number,
  fallbackAnchorCount: number
): number {
  if (activations.length >= 2) {
    // Measure intervals between successive anchor activations
    let totalDwells = 0;
    let count = 0;
    for (let i = 1; i < activations.length; i++) {
      const diffSecs = (activations[i].timestamp - activations[i - 1].timestamp) / 1000;
      if (diffSecs > 0.5 && diffSecs < 60) {
        totalDwells += diffSecs;
        count++;
      }
    }
    if (count > 0) {
      return Math.round((totalDwells / count) * 10) / 10;
    }
  }

  // Fallback: total session duration divided by anchors grounded
  const anchorCount = Math.max(1, fallbackAnchorCount);
  const avg = Math.min(15, Math.max(1.5, totalActiveTimeSeconds / anchorCount));
  return Math.round(avg * 10) / 10;
}

export function calculateSomaticShift(
  initialDistress: DistressRating,
  postFeeling: PostFeeling,
  activations: AnchorActivation[],
  totalDurationSeconds: number,
  anchorsGroundedCount: number
): SomaticShiftDelta {
  let estimatedPostScore = 2.0;
  let vagalStatusBadge = 'Vagal Tone Restored';

  if (postFeeling === 'Calmer 🌿') {
    estimatedPostScore = Math.max(1.0, Math.min(2.0, initialDistress - 1.8));
    vagalStatusBadge = 'Parasympathetic Downregulation';
  } else if (postFeeling === 'Same ⚖️') {
    estimatedPostScore = Math.max(1.5, initialDistress - 0.5);
    vagalStatusBadge = 'Autonomic Stabilization';
  } else {
    estimatedPostScore = Math.max(2.5, initialDistress);
    vagalStatusBadge = 'Gentle Compassionate Reset';
  }

  const deltaReduction = Math.max(0, Math.round((initialDistress - estimatedPostScore) * 10) / 10);
  const percentShift = Math.max(0, Math.min(100, Math.round((deltaReduction / initialDistress) * 100)));

  const avgDwell = calculateAverageDwellTime(
    activations,
    totalDurationSeconds,
    anchorsGroundedCount
  );

  const isPacingOptimal = avgDwell >= 3.8 && avgDwell <= 8.5;
  let dwellPacingLabel: SomaticShiftDelta['dwellPacingLabel'] = 'Gentle Grounding';
  if (isPacingOptimal) {
    dwellPacingLabel = 'Optimal Mindful Dwell (4-6s)';
  } else if (avgDwell < 3.8) {
    dwellPacingLabel = 'Rapid Activation';
  }

  return {
    initialDistress,
    postFeeling,
    estimatedPostScore: Math.round(estimatedPostScore * 10) / 10,
    deltaReduction,
    percentShift,
    vagalStatusBadge,
    averageDwellSeconds: avgDwell,
    dwellPacingLabel,
    isPacingOptimal,
  };
}

export function createStartedEvent(
  preDistressRating: DistressRating,
  audioGuidanceEnabled = true,
  hapticsEnabled = true
): PostHogEvent {
  return {
    event: 'grounding_tool_started',
    timestamp: new Date().toISOString(),
    properties: {
      pre_distress_rating: preDistressRating,
      pre_distress_label: getDistressLabel(preDistressRating),
      audio_guidance_enabled: audioGuidanceEnabled,
      haptics_enabled: hapticsEnabled,
      flow_architecture: 'streamlined_7_stage_somatic',
      tool_name: '5-4-3-2-1_sensory_grounding',
      screen: 'pre_check_in',
    },
  };
}

export function createStepCompletedEvent(record: StepRecord): PostHogEvent {
  return {
    event: 'grounding_step_completed',
    timestamp: new Date().toISOString(),
    properties: {
      step_number: record.stepNumber,
      sense_key: record.senseKey,
      sense_name: record.senseName,
      target_count: record.targetCount,
      items_noticed_count: record.itemsNoticed.length,
      items_noticed: record.itemsNoticed,
      skipped: record.skipped,
      step_duration_seconds: record.durationSeconds,
      guided_audio_played: !!record.guidedAudioPlayed,
    },
  };
}

export function createAudioPlayedEvent(stepNumber: number, senseName: string): PostHogEvent {
  return {
    event: 'guided_audio_played',
    timestamp: new Date().toISOString(),
    properties: {
      step_number: stepNumber,
      sense_name: senseName,
      audio_type: 'spoken_prompt_guidance',
    },
  };
}

export function createToolCompletedEvent(
  preDistressRating: DistressRating,
  postFeeling: PostFeeling,
  totalDurationSeconds: number,
  records: StepRecord[],
  shiftDelta?: SomaticShiftDelta,
  audioGuidanceUsed = false
): PostHogEvent {
  const completedCount = records.filter(r => !r.skipped).length;
  const skippedCount = records.filter(r => r.skipped).length;
  const totalItemsCount = records.reduce((sum, r) => sum + r.itemsNoticed.length, 0);

  return {
    event: 'grounding_tool_completed',
    timestamp: new Date().toISOString(),
    properties: {
      pre_distress_rating: preDistressRating,
      post_feeling: postFeeling,
      total_duration_seconds: Math.round(totalDurationSeconds),
      completed_senses: completedCount,
      skipped_senses: skippedCount,
      total_items_noticed: totalItemsCount,
      guided_audio_used: audioGuidanceUsed,
      somatic_shift_delta: shiftDelta,
      breakdown: records.map(r => ({
        sense: r.senseName,
        itemsCount: r.itemsNoticed.length,
        skipped: r.skipped,
        guidedAudioPlayed: !!r.guidedAudioPlayed,
      })),
    },
  };
}

export function getDistressLabel(rating: DistressRating): string {
  switch (rating) {
    case 1:
      return 'Mild (Gentle unease)';
    case 2:
      return 'Moderate (Restless thoughts)';
    case 3:
      return 'Noticeable (Tension in body)';
    case 4:
      return 'High (Rapid heartbeat / anxious)';
    case 5:
      return 'Overwhelming (Panic / sensory overload)';
  }
}

export function calculateSummaryMetrics(records: StepRecord[]) {
  const completedCount = records.filter(r => !r.skipped).length;
  const skippedCount = records.filter(r => r.skipped).length;
  const totalItems = records.reduce((sum, r) => sum + r.itemsNoticed.length, 0);
  const audioGuidedStepsCount = records.filter(r => r.guidedAudioPlayed).length;
  return {
    completedCount,
    skippedCount,
    totalItems,
    audioGuidedStepsCount,
    allStepsCount: records.length,
  };
}
