import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, Hand, Volume2, Wind, Sparkles, Check, Sparkle } from 'lucide-react';
import { somaticNarrator } from '../logic/somaticNarrator';

export type GroundingSense = 5 | 4 | 3 | 2 | 1;

export interface SomaticCoreProps {
  sense: GroundingSense;
  onSenseComplete?: () => void;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  voiceEnabled?: boolean;
  onAnchorActivated?: (anchorIndex: number, cueText: string) => void;
}

const HOLD_DURATION_MS = 1200; // 1.2s mindful hold time to prevent rushing

export const SENSE_CONFIG: Record<
  GroundingSense,
  {
    title: string;
    subtitle: string;
    prompt: string;
    icon: React.ElementType;
    color: string;
    glowColor: string;
    targetCount: number;
    anchorCues: string[];
  }
> = {
  5: {
    title: 'Sight Awareness',
    subtitle: 'Anchor your vision outward',
    prompt: 'Look into your physical space. Rest your eyes on 5 distinct visual anchors.',
    icon: Eye,
    color: '#2DD4BF',
    glowColor: 'rgba(45, 212, 191, 0.35)',
    targetCount: 5,
    anchorCues: [
      'A distinct color contrast',
      'A pattern of light or shadow',
      'A clear edge or geometric shape',
      'Something resting far across the room',
      'An object within arm’s reach',
    ],
  },
  4: {
    title: 'Physical Touch',
    subtitle: 'Feel gravity, contact, and texture',
    prompt: 'Shift awareness to your body. Notice 4 tactile points of contact.',
    icon: Hand,
    color: '#38BDF8',
    glowColor: 'rgba(56, 189, 248, 0.35)',
    targetCount: 4,
    anchorCues: [
      'Feet pressing into the floor',
      'Weight of your body supported by the seat',
      'Texture of your clothes against skin',
      'Air temperature on hands or face',
    ],
  },
  3: {
    title: 'Ambient Sound',
    subtitle: 'Open your auditory awareness',
    prompt: 'Close your eyes slightly. Isolate 3 layers of ambient sound.',
    icon: Volume2,
    color: '#818CF8',
    glowColor: 'rgba(129, 140, 248, 0.35)',
    targetCount: 3,
    anchorCues: [
      'The quiet hum of the room or AC',
      'A faint sound outside your space',
      'The rhythmic sound of your own breath',
    ],
  },
  2: {
    title: 'Subtle Scent',
    subtitle: 'Gentle inhale of the immediate air',
    prompt: 'Take a soft, unhurried breath. Notice 2 subtle olfactory cues.',
    icon: Wind,
    color: '#34D399',
    glowColor: 'rgba(52, 211, 153, 0.35)',
    targetCount: 2,
    anchorCues: [
      'The crisp neutral temperature of the air',
      'A faint natural aroma or room scent',
    ],
  },
  1: {
    title: 'Presence & Taste',
    subtitle: 'Fully centered in the present moment',
    prompt: 'Rest your tongue softly and ground in 1 physical sensation.',
    icon: Sparkles,
    color: '#F472B6',
    glowColor: 'rgba(244, 114, 182, 0.35)',
    targetCount: 1,
    anchorCues: ['Neutral resting palate or a sip of water'],
  },
};

export const SomaticCore: React.FC<SomaticCoreProps> = ({
  sense,
  onSenseComplete,
  soundEnabled = true,
  vibrationEnabled = true,
  voiceEnabled = true,
  onAnchorActivated,
}) => {
  const [completedAnchors, setCompletedAnchors] = useState<number[]>([]);
  const [holdingTarget, setHoldingTarget] = useState<'center' | number | null>(null);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [activeCueIndex, setActiveCueIndex] = useState<number>(0);
  const [ripplePulse, setRipplePulse] = useState<boolean>(false);

  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartTimeRef = useRef<number>(0);
  const holdTriggeredRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const config = SENSE_CONFIG[sense];
  const IconComponent = config.icon;

  // Reset state on step / sense change
  useEffect(() => {
    setCompletedAnchors([]);
    setActiveCueIndex(0);
    setHoldingTarget(null);
    setHoldProgress(0);
    setRipplePulse(false);
    holdTriggeredRef.current = false;
  }, [sense]);

  // Harmonic chime synthesis
  const playHarmonicChime = (index: number) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const frequencies = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
      const freq = frequencies[index % frequencies.length];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(850, ctx.currentTime);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.8);
    } catch {
      // Fallback
    }
  };

  // Complete an anchor either via 1.2s hold or deliberate click/tap
  const completeAnchor = (index: number, mode: 'hold' | 'tap') => {
    if (completedAnchors.includes(index)) return;

    // Haptic feedback
    if (vibrationEnabled && typeof window !== 'undefined' && 'vibrate' in navigator) {
      if (mode === 'hold') {
        navigator.vibrate([24, 45, 30]);
      } else {
        navigator.vibrate([20, 30]);
      }
    }

    // Play harmonic chime
    playHarmonicChime(index);

    // Ripple effect on center core
    setRipplePulse(true);
    setTimeout(() => setRipplePulse(false), 500);

    const cueText = config.anchorCues[index] || '';
    onAnchorActivated?.(index, cueText);

    setCompletedAnchors((prev) => {
      if (prev.includes(index)) return prev;
      const updated = [...prev, index];

      if (updated.length === config.targetCount) {
        // All anchors for this sense completed!
        // Speak completion calmly, and transition ONLY after speech finishes smoothly
        if (voiceEnabled) {
          somaticNarrator.speak(`${config.title} grounded and complete.`, {
            pauseBeforeMs: 200,
            pauseAfterMs: 400,
            onEnd: () => {
              onSenseComplete?.();
            },
          });
        } else {
          setTimeout(() => {
            onSenseComplete?.();
          }, 600);
        }
      } else {
        // Find next incomplete anchor to advance active cue
        const next = config.anchorCues.findIndex((_, i) => !updated.includes(i));
        if (next !== -1) {
          setActiveCueIndex(next);
          // Read out next anchor cue aloud so user does not need to look at screen
          if (voiceEnabled) {
            somaticNarrator.speak(`Anchor ${next + 1}: ${config.anchorCues[next]}`, {
              pauseBeforeMs: 250,
            });
          }
        }
      }
      return updated;
    });
  };

  // Start hold for a specific target ('center' or node index)
  const startHold = (target: 'center' | number) => {
    let targetIndex: number;
    if (target === 'center') {
      const nextIncomplete = config.anchorCues.findIndex((_, i) => !completedAnchors.includes(i));
      if (nextIncomplete === -1) return; // All already complete
      targetIndex = nextIncomplete;
    } else {
      if (completedAnchors.includes(target)) return;
      targetIndex = target;
    }

    setHoldingTarget(target);
    setActiveCueIndex(targetIndex);
    setHoldProgress(0);
    holdTriggeredRef.current = false;
    holdStartTimeRef.current = Date.now();

    // Start progress interval
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(progress);
    }, 20);

    // Timer for hold completion
    holdTimerRef.current = setTimeout(() => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setHoldProgress(100);
      setHoldingTarget(null);
      holdTriggeredRef.current = true;
      completeAnchor(targetIndex, 'hold');
    }, HOLD_DURATION_MS);
  };

  // Release hold without firing an extra tap (cancels hold timer & resets animation)
  const releaseHold = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setHoldingTarget(null);
    setHoldProgress(0);
  };

  // Handle standard click/tap (fires once per tap, and ignores if already triggered by 1.2s hold)
  const handleAnchorClick = (target: 'center' | number) => {
    if (holdTriggeredRef.current) {
      // Hold has already completed this anchor; consume click event and reset flag
      holdTriggeredRef.current = false;
      return;
    }

    let targetIndex: number;
    if (target === 'center') {
      const nextIncomplete = config.anchorCues.findIndex((_, i) => !completedAnchors.includes(i));
      if (nextIncomplete === -1) return;
      targetIndex = nextIncomplete;
    } else {
      if (completedAnchors.includes(target)) return;
      targetIndex = target;
    }

    completeAnchor(targetIndex, 'tap');
  };

  const isHoldingCenter = holdingTarget === 'center';
  const allAnchorsCompleted = completedAnchors.length === config.targetCount;
  const currentActiveCue = config.anchorCues[activeCueIndex] || 'Look around your space';

  return (
    <div className="relative flex flex-col items-center justify-between w-full max-w-md h-[550px] px-3 py-1.5 mx-auto select-none overflow-hidden">
      {/* Top Context & Active Guiding Prompt */}
      <div className="text-center space-y-1.5 z-10 w-full px-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#0D2D44] border border-[#1A4666]">
          <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color }} />
          <span className="text-[11px] font-bold tracking-wider uppercase text-slate-200">
            Step {6 - sense} of 5 · {config.title}
          </span>
        </div>
        <p className="text-xs text-[#7E9EB8] max-w-xs mx-auto leading-relaxed">{config.prompt}</p>

        {/* Dynamic Focus Guidance Callout with Spoken Anchor Cue & Replay Action */}
        <div className="min-h-[46px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${sense}-${activeCueIndex}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="bg-[#081E2E]/95 border border-[#1A4666] px-3 py-1.5 rounded-xl shadow-inner inline-flex items-center gap-2 max-w-[94%]"
            >
              <span className="text-[10px] font-semibold text-[#1DBB8E] uppercase tracking-wider shrink-0">
                Anchor {activeCueIndex + 1}:
              </span>
              <span className="text-xs text-white font-medium truncate">{currentActiveCue}</span>

              {/* Replay voice button */}
              {voiceEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    somaticNarrator.speak(`Anchor ${activeCueIndex + 1}: ${currentActiveCue}`);
                  }}
                  className="p-1 -mr-1 rounded-lg hover:bg-[#1A4666] text-[#2DD4BF] hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Hear anchor prompt again"
                  aria-label="Hear anchor prompt again"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Central Interactive Radial Stage */}
      <div className="relative flex items-center justify-center w-80 h-80 my-auto">
        {/* Ambient Breathing Halo */}
        <motion.div
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.12, 0.32, 0.12],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full blur-2xl pointer-events-none"
          style={{ backgroundColor: config.glowColor }}
        />

        {/* Central Core: Pressable & Holdable for Eyes-Free Grounding */}
        <div className="relative z-20 flex items-center justify-center">
          {/* Radial SVG Hold Progress Ring around Central Core */}
          {isHoldingCenter && (
            <svg
              className="absolute -inset-2.5 w-[calc(100%+20px)] h-[calc(100%+20px)] -rotate-90 pointer-events-none z-30"
              viewBox="0 0 148 148"
            >
              <circle
                cx="74"
                cy="74"
                r="68"
                fill="none"
                stroke={config.color}
                strokeWidth="4"
                strokeDasharray="427.2"
                strokeDashoffset={427.2 - (427.2 * holdProgress) / 100}
                strokeLinecap="round"
                className="transition-all duration-75"
              />
            </svg>
          )}

          {/* Ripple pulse on successful anchor */}
          {ripplePulse && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0.8 }}
              animate={{ scale: 1.45, opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border-2 border-[#1DBB8E] pointer-events-none z-10"
            />
          )}

          {/* Central Interactive Button: EXACTLY ONE ANCHOR PER CLICK */}
          <button
            type="button"
            onPointerDown={() => startHold('center')}
            onPointerUp={releaseHold}
            onPointerLeave={releaseHold}
            onPointerCancel={releaseHold}
            onClick={() => handleAnchorClick('center')}
            className={`relative z-20 flex flex-col items-center justify-center w-36 h-36 rounded-full bg-gradient-to-br from-[#0D2D44] to-[#061826] border-2 shadow-2xl cursor-pointer focus:outline-none transition-all duration-200 active:scale-95 ${
              allAnchorsCompleted
                ? 'border-[#1DBB8E] text-[#1DBB8E]'
                : isHoldingCenter
                ? 'scale-95 border-[#2DD4BF] text-white ring-4 ring-[#2DD4BF]/20'
                : 'border-[#1A4666] hover:border-[#2DD4BF] text-slate-300'
            }`}
            style={{
              boxShadow: allAnchorsCompleted
                ? '0 0 35px rgba(29, 187, 142, 0.4)'
                : isHoldingCenter
                ? `0 0 40px ${config.glowColor}`
                : `0 0 24px ${config.glowColor}`,
            }}
            aria-label={
              allAnchorsCompleted
                ? 'All anchors complete'
                : `Anchor ${activeCueIndex + 1}: Hold or tap to anchor without looking at screen`
            }
          >
            {allAnchorsCompleted ? (
              <>
                <Check className="w-10 h-10 text-[#1DBB8E] stroke-[2.5]" />
                <span className="mt-1 text-[11px] font-bold text-[#1DBB8E] tracking-wider uppercase">
                  Anchored
                </span>
              </>
            ) : isHoldingCenter ? (
              <>
                <IconComponent className="w-8 h-8 animate-pulse" style={{ color: config.color }} />
                <span className="mt-1 text-[11px] font-bold tracking-wider text-white uppercase">
                  {Math.round(holdProgress)}%
                </span>
                <span className="text-[9px] text-[#7E9EB8] tracking-tight">Anchoring...</span>
              </>
            ) : (
              <>
                <div className="relative">
                  <IconComponent className="w-8 h-8" style={{ color: config.color }} />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#1DBB8E] animate-ping" />
                </div>
                <span className="mt-1.5 text-xs font-bold tracking-wider text-white">
                  Anchor {activeCueIndex + 1}
                </span>
                <span className="text-[10px] text-[#2DD4BF] font-semibold tracking-tight">
                  Hold or Tap
                </span>
              </>
            )}
          </button>
        </div>

        {/* Orbital Nodes with Hold-to-Anchor Progress */}
        {config.anchorCues.map((cue, index) => {
          const total = config.targetCount;
          const angle = (index / total) * (2 * Math.PI) - Math.PI / 2;
          const radius = 124;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          const isCompleted = completedAnchors.includes(index);
          const isHoldingThis = holdingTarget === index;
          const isTargetActive = activeCueIndex === index;

          return (
            <motion.div
              key={`${sense}-${index}`}
              className="absolute z-30"
              style={{ x, y }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.05, type: 'spring' }}
            >
              <button
                type="button"
                onPointerDown={() => startHold(index)}
                onPointerUp={releaseHold}
                onPointerLeave={releaseHold}
                onPointerCancel={releaseHold}
                onClick={() => handleAnchorClick(index)}
                className={`relative flex items-center justify-center w-12 h-12 rounded-full focus:outline-none transition-transform active:scale-95 cursor-pointer ${
                  isTargetActive && !isCompleted
                    ? 'ring-2 ring-[#2DD4BF] ring-offset-2 ring-offset-[#061826]'
                    : ''
                }`}
                aria-label={`Anchor ${index + 1}: ${cue}`}
              >
                {/* Hold Progress SVG Ring */}
                {isHoldingThis && (
                  <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 48 48">
                    <circle
                      cx="24"
                      cy="24"
                      r="22"
                      fill="none"
                      stroke="#1DBB8E"
                      strokeWidth="3.5"
                      strokeDasharray="138.2"
                      strokeDashoffset={138.2 - (138.2 * holdProgress) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                )}

                {/* Node Body */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-xs transition-all ${
                    isCompleted
                      ? 'bg-[#1DBB8E] border-[#1DBB8E] text-[#061826] shadow-md shadow-[#1DBB8E]/30'
                      : isTargetActive
                      ? 'bg-[#0D2D44] border-[#2DD4BF] text-white shadow-md shadow-[#2DD4BF]/20'
                      : 'bg-[#081E2E] border-[#1A4666] text-[#7E9EB8] hover:border-slate-400 hover:text-white'
                  }`}
                >
                  {isCompleted ? <Check className="w-5 h-5 stroke-[2.5]" /> : index + 1}
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Eyes-Free Grounding Callout & Progress Footer */}
      <div className="w-full max-w-xs space-y-2 text-center z-10">
        {/* Eyes-free indicator */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#081E2E]/85 border border-[#1A4666]/70 text-[11px] text-[#7E9EB8]">
          <Sparkle className="w-3 h-3 text-[#2DD4BF] animate-pulse" />
          <span>Eyes-Free: Look at surroundings &amp; press center</span>
        </div>

        <div className="flex items-center justify-between text-xs text-[#7E9EB8]">
          <span className="text-[11px]">Hold or tap to ground</span>
          <span className="font-mono text-white text-[11px]">
            {completedAnchors.length} of {config.targetCount}
          </span>
        </div>
        <div className="w-full h-1.5 bg-[#0D2D44] rounded-full overflow-hidden border border-[#1A4666]/50">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(completedAnchors.length / config.targetCount) * 100}%` }}
            className="h-full rounded-full"
            style={{ backgroundColor: config.color }}
          />
        </div>
      </div>
    </div>
  );
};