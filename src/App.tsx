import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SomaticCore, GroundingSense, SENSE_CONFIG } from './components/SomaticCore';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  Clock,
  Home,
  Calendar,
  Flower2,
  Menu,
  Waves,
  CloudRain,
  Vibrate,
  Mic,
  Bell,
  Sparkle,
  Activity,
  ShieldCheck,
  Play,
  Square,
  Sparkles,
} from 'lucide-react';
import {
  GROUNDING_STEPS,
  formatDuration,
  createStartedEvent,
  createStepCompletedEvent,
  createAudioPlayedEvent,
  createToolCompletedEvent,
  calculateSummaryMetrics,
  calculateSomaticShift,
  getDistressLabel,
  triggerHaptic,
  HapticType,
  DistressRating,
  PostFeeling,
  StepRecord,
  AnchorActivation,
  SomaticShiftDelta,
  PostHogEvent,
} from './logic/groundingMachine';
import { ambientSound, AmbientSoundType } from './logic/ambientAudio';
import { somaticNarrator, VoiceTone, VOICE_TONES } from './logic/somaticNarrator';

// Harmonic chime synthesizer
function playSoftChime(freq = 528, isMuted = false) {
  if (isMuted || typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.75);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.75);
  } catch {
    // Ignore autoplay restriction
  }
}

export default function App() {
  // Navigation Flow: 7 streamlined stages:
  // 'pre_checkin' (Baseline) -> 'stepper' (Steps 5, 4, 3, 2, 1) -> 'post_summary' (Shift Summary)
  const [screen, setScreen] = useState<'pre_checkin' | 'stepper' | 'post_summary'>('pre_checkin');

  // Baseline Distress (1 to 5)
  const [distressRating, setDistressRating] = useState<DistressRating>(3);

  // Stepper index: 0 = Sight (5), 1 = Touch (4), 2 = Sound (3), 3 = Smell (2), 4 = Taste (1)
  const [stepIndex, setStepIndex] = useState<number>(0);
  const currentStep = GROUNDING_STEPS[stepIndex] || GROUNDING_STEPS[0];

  // Somatic tracking: anchor activation timestamps
  const [anchorActivations, setAnchorActivations] = useState<AnchorActivation[]>([]);

  // Step completion history
  const [stepRecords, setStepRecords] = useState<StepRecord[]>([]);

  // Post-Session state
  const [postFeeling, setPostFeeling] = useState<PostFeeling | null>(null);

  // Settings & Audio preferences
  const [isGuidedVoiceEnabled, setIsGuidedVoiceEnabled] = useState<boolean>(true);
  const [selectedVoiceTone, setSelectedVoiceTone] = useState<VoiceTone>('soft_meditative');
  const [isBackgroundSoundEnabled, setIsBackgroundSoundEnabled] = useState<boolean>(true);
  const [ambientType, setAmbientType] = useState<AmbientSoundType>('water_waves');
  const [isVibrationEnabled, setIsVibrationEnabled] = useState<boolean>(true);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);

  // Speech narrator state
  const [isNarratorSpeaking, setIsNarratorSpeaking] = useState<boolean>(false);

  // Session timer
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState<number>(0);
  const stepStartTimeRef = useRef<number>(Date.now());

  // PostHog event logging
  const [eventLogs, setEventLogs] = useState<PostHogEvent[]>([]);

  // Subscribe to narrator speaking state
  useEffect(() => {
    const unsubscribe = somaticNarrator.subscribeSpeaking((speaking) => {
      setIsNarratorSpeaking(speaking);
    });
    return unsubscribe;
  }, []);

  // Sync settings with somaticNarrator
  useEffect(() => {
    somaticNarrator.setEnabled(isGuidedVoiceEnabled);
  }, [isGuidedVoiceEnabled]);

  useEffect(() => {
    somaticNarrator.setTone(selectedVoiceTone);
  }, [selectedVoiceTone]);

  // Subtle haptic trigger
  const triggerAppHaptic = useCallback(
    (type: HapticType) => {
      if (!isVibrationEnabled) return;
      triggerHaptic(type, true);
    },
    [isVibrationEnabled]
  );

  // PostHog logger
  const trackEvent = (event: PostHogEvent) => {
    console.log(`[PostHog Event: ${event.event}]`, JSON.stringify(event, null, 2));
    setEventLogs((prev) => [event, ...prev]);
  };

  // Background Ambient Sound Engine
  useEffect(() => {
    if (isBackgroundSoundEnabled && screen === 'stepper' && !isSoundMuted) {
      ambientSound.start(ambientType);
    } else {
      ambientSound.stop();
    }
    return () => {
      ambientSound.stop();
    };
  }, [isBackgroundSoundEnabled, screen, ambientType, isSoundMuted]);

  // Non-interrupting sequential voice guidance on step change
  // Seamlessly speaks step description FIRST, followed by Anchor 1 cue after a gentle breath gap
  useEffect(() => {
    if (screen === 'stepper' && isGuidedVoiceEnabled) {
      const stepSense = currentStep.stepNumber as GroundingSense;
      const firstAnchorCue = SENSE_CONFIG[stepSense]?.anchorCues[0];

      // Delay start slightly to let the stage transition animation finish
      const timer = setTimeout(() => {
        somaticNarrator.speakSequence([
          { text: currentStep.guidedAudioScript, pauseAfterMs: 650 },
          { text: firstAnchorCue ? `Anchor 1: ${firstAnchorCue}` : '', pauseAfterMs: 400 },
        ]);
        trackEvent(createAudioPlayedEvent(currentStep.stepNumber, currentStep.senseName));
      }, 350);

      return () => {
        clearTimeout(timer);
        somaticNarrator.cancel();
      };
    } else {
      somaticNarrator.cancel();
    }
  }, [stepIndex, screen, currentStep, isGuidedVoiceEnabled]);

  // Session Stopwatch
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (screen === 'stepper' && sessionStartTime) {
      interval = setInterval(() => {
        setSessionDurationSeconds((Date.now() - sessionStartTime) / 1000);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [screen, sessionStartTime]);

  // Stage 1: Begin Reset from Baseline
  const handleBeginReset = () => {
    triggerAppHaptic('buttonPress');
    trackEvent(createStartedEvent(distressRating, isGuidedVoiceEnabled, isVibrationEnabled));

    const now = Date.now();
    setSessionStartTime(now);
    setSessionDurationSeconds(0);
    stepStartTimeRef.current = now;
    setStepIndex(0);
    setAnchorActivations([]);
    setStepRecords([]);
    setPostFeeling(null);
    setScreen('stepper');
    playSoftChime(440, isSoundMuted);
  };

  // Advance Stage (5 -> 4 -> 3 -> 2 -> 1 -> Summary)
  const advanceStep = (skipped = false) => {
    somaticNarrator.cancel();
    triggerAppHaptic('stepComplete');

    const now = Date.now();
    const duration = Math.max(1, Math.round((now - stepStartTimeRef.current) / 1000));
    stepStartTimeRef.current = now;

    const recordedItems = currentStep.defaultSuggestions.slice(0, currentStep.targetCount);

    const record: StepRecord = {
      stepNumber: currentStep.stepNumber,
      senseKey: currentStep.senseKey,
      senseName: currentStep.senseName,
      targetCount: currentStep.targetCount,
      itemsNoticed: skipped ? [] : recordedItems,
      skipped,
      durationSeconds: duration,
      guidedAudioPlayed: isGuidedVoiceEnabled,
    };

    const updatedRecords = [...stepRecords, record];
    setStepRecords(updatedRecords);
    trackEvent(createStepCompletedEvent(record));

    if (stepIndex < GROUNDING_STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
      playSoftChime(480, isSoundMuted);
    } else {
      // Completed all 5 senses -> Transition directly to Summary
      const finalDuration = sessionStartTime ? (now - sessionStartTime) / 1000 : duration;
      setSessionDurationSeconds(finalDuration);
      setScreen('post_summary');
      playSoftChime(784, isSoundMuted);
    }
  };

  // Replay current step audio cleanly without cutting off
  const handleReplayCurrentStep = () => {
    triggerAppHaptic('tap');
    const stepSense = currentStep.stepNumber as GroundingSense;
    const firstAnchorCue = SENSE_CONFIG[stepSense]?.anchorCues[0];

    somaticNarrator.speakSequence([
      { text: currentStep.guidedAudioScript, pauseAfterMs: 650 },
      { text: firstAnchorCue ? `Anchor 1: ${firstAnchorCue}` : '', pauseAfterMs: 400 },
    ]);
  };

  // Select Post Feeling & compute Somatic Shift Delta
  const handleSelectPostFeeling = (feeling: PostFeeling) => {
    triggerAppHaptic('sessionComplete');
    setPostFeeling(feeling);

    const shiftDelta = calculateSomaticShift(
      distressRating,
      feeling,
      anchorActivations,
      sessionDurationSeconds,
      summaryMetrics.totalItems
    );

    const audioUsed = stepRecords.some((r) => r.guidedAudioPlayed) || isGuidedVoiceEnabled;
    trackEvent(
      createToolCompletedEvent(
        distressRating,
        feeling,
        sessionDurationSeconds,
        stepRecords,
        shiftDelta,
        audioUsed
      )
    );
    playSoftChime(587, isSoundMuted);
  };

  // Reset to Self Care
  const handleResetToSelfCare = () => {
    somaticNarrator.cancel();
    ambientSound.stop();
    triggerAppHaptic('buttonPress');
    setScreen('pre_checkin');
    setStepIndex(0);
    setPostFeeling(null);
    setAnchorActivations([]);
    setStepRecords([]);
  };

  const summaryMetrics = useMemo(() => calculateSummaryMetrics(stepRecords), [stepRecords]);

  // Derived Somatic Shift Delta for Summary
  const somaticShiftDelta: SomaticShiftDelta | null = useMemo(() => {
    if (!postFeeling) return null;
    return calculateSomaticShift(
      distressRating,
      postFeeling,
      anchorActivations,
      sessionDurationSeconds,
      summaryMetrics.totalItems
    );
  }, [postFeeling, distressRating, anchorActivations, sessionDurationSeconds, summaryMetrics.totalItems]);

  return (
    <div className="min-h-screen bg-[#061826] text-white flex flex-col justify-center items-center antialiased font-sans select-none sm:py-6">
      {/* Mobile Device Canvas Frame */}
      <div className="relative w-full max-w-[390px] h-full min-h-screen sm:min-h-[844px] sm:max-h-[844px] bg-gradient-to-b from-[#061826] via-[#082033] to-[#0A263D] sm:rounded-[44px] sm:border-[8px] sm:border-[#1E3B52] sm:shadow-2xl overflow-hidden flex flex-col justify-between">
        
        {/* Subtle Organic Background Ambient Gradient Wave */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <svg
            className="absolute bottom-16 left-0 right-0 w-full opacity-20"
            viewBox="0 0 390 280"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 120C80 70 140 160 220 110C300 60 350 140 390 100V280H0V120Z"
              fill="url(#somatic-wave-gradient)"
            />
            <defs>
              <linearGradient id="somatic-wave-gradient" x1="195" y1="60" x2="195" y2="280" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1DBB8E" stopOpacity="0.4" />
                <stop offset="1" stopColor="#082033" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* 1. iOS Status Bar */}
        <div className="relative z-20 pt-3 px-7 flex items-center justify-between text-xs font-semibold text-white/90">
          <span>12:22</span>
          <div className="w-20 h-4 bg-black/40 rounded-full mx-auto" />
          <div className="flex items-center gap-1.5">
            <div className="flex items-end gap-0.5 h-2.5">
              <span className="w-0.5 h-1 bg-white rounded-full" />
              <span className="w-0.5 h-1.5 bg-white rounded-full" />
              <span className="w-0.5 h-2 bg-white rounded-full" />
              <span className="w-0.5 h-2.5 bg-white rounded-full" />
            </div>
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98C20.93 5.9 16.69 4 12 4zm0 3.5c3.78 0 7.22 1.48 9.77 3.89L12 19.14 2.23 11.39C4.78 8.98 8.22 7.5 12 7.5z" />
            </svg>
            <div className="w-5 h-2.5 border border-white/80 rounded-sm p-0.5 flex items-center">
              <div className="w-full h-full bg-white rounded-2xs" />
            </div>
          </div>
        </div>

        {/* 2. Top Header Navigation */}
        <header className="relative z-20 px-5 pt-2 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerAppHaptic('buttonPress');
                if (screen === 'stepper') {
                  setShowExitModal(true);
                } else if (screen === 'post_summary') {
                  handleResetToSelfCare();
                }
              }}
              className="w-8 h-8 rounded-full bg-[#0D2D44]/80 border border-[#1A4666] flex items-center justify-center text-white hover:bg-[#153D5C] transition-colors cursor-pointer"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            <div>
              <h1 className="text-base font-bold text-white tracking-tight leading-tight">
                {screen === 'pre_checkin'
                  ? '5-4-3-2-1 Grounding'
                  : screen === 'stepper'
                  ? `${currentStep.senseName} (${currentStep.stepNumber})`
                  : 'Somatic Shift Summary'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Replay voice guidance in stepper */}
            {screen === 'stepper' && isGuidedVoiceEnabled && (
              <button
                type="button"
                onClick={handleReplayCurrentStep}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isNarratorSpeaking
                    ? 'bg-[#1DBB8E] text-[#061826] shadow-md shadow-[#1DBB8E]/40 animate-pulse'
                    : 'bg-[#0D2D44] text-[#2DD4BF] border border-[#1A4666] hover:border-[#1DBB8E]'
                }`}
                title="Replay Voice Guidance"
                aria-label="Replay Voice Guidance"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            {/* Ambient Sound toggle */}
            {isBackgroundSoundEnabled && screen === 'stepper' && (
              <button
                type="button"
                onClick={() => {
                  triggerAppHaptic('tap');
                  setIsSoundMuted((prev) => !prev);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isSoundMuted
                    ? 'bg-[#0D2D44] text-slate-500 border border-[#1A4666]'
                    : 'bg-[#0D2D44] text-[#2DD4BF] border border-[#1A4666]'
                }`}
                title={isSoundMuted ? 'Unmute Ambient Sound' : 'Mute Ambient Sound'}
                aria-label={isSoundMuted ? 'Unmute Ambient Sound' : 'Mute Ambient Sound'}
              >
                {isSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}

            {/* Settings Modal Button */}
            <button
              type="button"
              onClick={() => {
                triggerAppHaptic('buttonPress');
                setShowSettingsModal(true);
              }}
              className="w-8 h-8 rounded-full bg-[#0D2D44]/80 border border-[#1A4666] flex items-center justify-center text-[#7E9EB8] hover:text-white transition-colors cursor-pointer"
              aria-label="Settings"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 3. Main Stage Container (7-Stage Flow) */}
        <main className="relative z-10 flex-1 flex flex-col px-5 overflow-hidden">
          <AnimatePresence mode="wait">
            {/* STAGE 1: BASELINE DISTRESS CHECK-IN */}
            {screen === 'pre_checkin' && (
              <motion.div
                key="stage-pre-checkin"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex-1 flex flex-col justify-between py-1"
              >
                <div className="space-y-3.5">
                  {/* Hero Intro */}
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0D2D44] border border-[#1A4666]">
                      <Sparkles className="w-3.5 h-3.5 text-[#2DD4BF]" />
                      <span className="text-[11px] font-bold tracking-wider uppercase text-[#2DD4BF]">
                        Somatic Grounding Reset
                      </span>
                    </div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight">
                      Anchor to Here &amp; Now
                    </h2>
                    <p className="text-xs text-[#7E9EB8] leading-relaxed">
                      Somatic sensory immersion down-regulates the sympathetic nervous system through bilateral physical cues.
                    </p>
                  </div>

                  {/* Clinical Orientation / Heads-Up Card */}
                  <div className="bg-[#081E2E]/90 rounded-2xl border border-[#1A4666] p-3.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkle className="w-4 h-4 text-[#2DD4BF]" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        How Somatic Anchoring Works
                      </span>
                    </div>
                    <p className="text-[11px] text-[#7E9EB8] leading-relaxed">
                      During this reset, <strong className="text-white">turn your physical gaze away from the glass screen</strong>. The gentle voice guide reads each anchor, and you can hold or press the center orb without looking down.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-slate-300">
                      <div className="bg-[#0D2D44]/70 p-2 rounded-xl border border-[#1A4666]/60 flex items-center gap-1.5">
                        <span className="text-[#1DBB8E] font-bold">1.</span>
                        <span>Look outward &amp; listen</span>
                      </div>
                      <div className="bg-[#0D2D44]/70 p-2 rounded-xl border border-[#1A4666]/60 flex items-center gap-1.5">
                        <span className="text-[#1DBB8E] font-bold">2.</span>
                        <span>Hold or tap center orb</span>
                      </div>
                    </div>
                  </div>

                  {/* Baseline Rating Card */}
                  <div className="bg-[#0D2D44] rounded-2xl border border-[#1A4666] p-4 shadow-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#2DD4BF] tracking-wide uppercase">
                        Distress Baseline
                      </span>
                      <span className="text-[11px] text-[#7E9EB8]">Stage 1 of 7</span>
                    </div>

                    <h3 className="text-sm font-semibold text-white">
                      How intense is your distress right now?
                    </h3>

                    {/* 1-5 Scale Pills */}
                    <div className="grid grid-cols-5 gap-2 pt-1" role="radiogroup" aria-label="Distress rating 1 to 5">
                      {([1, 2, 3, 4, 5] as DistressRating[]).map((val) => {
                        const isSelected = distressRating === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              triggerAppHaptic('buttonPress');
                              setDistressRating(val);
                              playSoftChime(360 + val * 55, isSoundMuted);
                            }}
                            role="radio"
                            aria-checked={isSelected}
                            className={`flex flex-col items-center justify-center py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#09354E] border-[#1DBB8E] text-white shadow-md shadow-[#1DBB8E]/30 ring-2 ring-[#1DBB8E]/40'
                                : 'bg-[#081E2E] border-[#1A4666] text-[#7E9EB8] hover:border-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="text-base leading-none">{val}</span>
                            <span className="text-[9px] mt-1 opacity-75 font-normal">
                              {val === 1 ? 'Mild' : val === 5 ? 'High' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Explainer card */}
                    <div className="bg-[#081E2E]/80 rounded-xl p-2.5 border border-[#1A4666]/70 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#1DBB8E] animate-ping" />
                      <span className="text-xs font-medium text-slate-200">
                        {getDistressLabel(distressRating)}
                      </span>
                    </div>

                    {/* Somatic ambient audio details */}
                    <div className="flex items-center justify-between text-[11px] text-[#7E9EB8] pt-1 border-t border-[#1A4666]/50">
                      <div className="flex items-center gap-1.5">
                        <Waves className="w-3.5 h-3.5 text-[#2DD4BF]" />
                        <span>Background: {ambientType === 'water_waves' ? 'Ocean Waves' : 'Rain Waves'}</span>
                      </div>
                      <span className="text-[#1DBB8E] font-medium">Soft Voice Guide</span>
                    </div>
                  </div>
                </div>

                {/* Begin Reset CTA */}
                <div className="pt-3 pb-2">
                  <button
                    type="button"
                    onClick={handleBeginReset}
                    className="w-full py-3.5 px-6 rounded-full bg-[#1DBB8E] hover:bg-[#25BFA0] active:scale-[0.98] text-white font-bold text-base shadow-lg shadow-[#1DBB8E]/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Begin Grounding Reset</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STAGES 2 TO 6: SINGLE COHESIVE CANVAS PER SENSE */}
            {screen === 'stepper' && (
              <motion.div
                key={`stage-sense-${currentStep.stepNumber}`}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.03 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex-1 flex flex-col justify-between py-1"
              >
                {/* Stepper Progress bar & Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 bg-[#0D2D44] px-3 py-1 rounded-full border border-[#1A4666]">
                      <span className="text-xs font-bold text-[#2DD4BF]">
                        Step {5 - currentStep.stepNumber + 1} of 5
                      </span>
                      <span className="text-xs text-[#7E9EB8]">• {formatDuration(sessionDurationSeconds)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => advanceStep(true)}
                      className="text-xs font-semibold text-[#7E9EB8] hover:text-[#2DD4BF] transition-colors py-1 px-2.5 rounded-lg bg-[#0D2D44] border border-[#1A4666] cursor-pointer"
                    >
                      Skip this sense
                    </button>
                  </div>

                  {/* 5 Dots Progress Bar */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {GROUNDING_STEPS.map((s, idx) => {
                      const isDone = stepRecords.some((r) => r.stepNumber === s.stepNumber && !r.skipped);
                      const isCurrent = idx === stepIndex;
                      return (
                        <div
                          key={s.stepNumber}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            isCurrent
                              ? 'bg-[#2DD4BF] shadow-sm shadow-[#2DD4BF]/50'
                              : isDone
                              ? 'bg-[#1DBB8E]'
                              : 'bg-[#0D2D44] border border-[#1A4666]'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Central Canvas: SomaticCore Breathing Orb + Tactile Anchor Nodes */}
                <div className="flex-1 flex items-center justify-center py-1">
                  <SomaticCore
                    sense={currentStep.stepNumber as GroundingSense}
                    soundEnabled={!isSoundMuted}
                    vibrationEnabled={isVibrationEnabled}
                    voiceEnabled={isGuidedVoiceEnabled}
                    onAnchorActivated={(index, cue) => {
                      setAnchorActivations((prev) => [
                        ...prev,
                        {
                          stepNumber: currentStep.stepNumber,
                          nodeIndex: index,
                          timestamp: Date.now(),
                          dwellSeconds: 4.5,
                          note: cue,
                        },
                      ]);
                    }}
                    onSenseComplete={() => advanceStep(false)}
                  />
                </div>

                {/* Bottom Action CTA: Next Stage or Finish */}
                <div className="pt-2 pb-1">
                  <button
                    type="button"
                    onClick={() => advanceStep(false)}
                    className="w-full py-3 px-6 rounded-full font-bold text-xs bg-[#0D2D44] border border-[#1DBB8E]/50 text-[#2DD4BF] hover:bg-[#123A57] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>
                      {stepIndex < GROUNDING_STEPS.length - 1
                        ? `Skip to Step ${5 - currentStep.stepNumber + 2} (${GROUNDING_STEPS[stepIndex + 1].senseName})`
                        : 'Finish Grounding'}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STAGE 7: SESSION SHIFT SUMMARY */}
            {screen === 'post_summary' && (
              <motion.div
                key="stage-summary"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex-1 flex flex-col justify-between py-1"
              >
                <div className="space-y-3.5">
                  {/* Status header */}
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-bold text-[#1DBB8E] uppercase tracking-wider">
                      Stage 7 of 7 • Completed
                    </span>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight">Somatic Shift Summary</h2>
                    <p className="text-xs text-[#7E9EB8]">
                      Notice the calm equilibrium your nervous system has restored.
                    </p>
                  </div>

                  {/* Question: 3 Large Pills for Post-State */}
                  <div className="bg-[#0D2D44] rounded-2xl border border-[#1A4666] p-4 shadow-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">How are you feeling now?</h3>
                      <span className="text-[11px] text-[#2DD4BF] font-semibold">Post-Check</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Post-session feeling">
                      {(['Calmer 🌿', 'Same ⚖️', 'Still Overwhelmed 🌊'] as PostFeeling[]).map((feeling) => {
                        const isSelected = postFeeling === feeling;
                        return (
                          <button
                            key={feeling}
                            type="button"
                            onClick={() => handleSelectPostFeeling(feeling)}
                            role="radio"
                            aria-checked={isSelected}
                            className={`py-3 px-2 rounded-xl border font-bold text-xs transition-all text-center cursor-pointer ${
                              isSelected
                                ? 'bg-[#09354E] border-[#1DBB8E] text-white shadow-md shadow-[#1DBB8E]/30 ring-2 ring-[#1DBB8E]/40'
                                : 'bg-[#081E2E] border-[#1A4666] text-[#7E9EB8] hover:border-slate-400 hover:text-white'
                            }`}
                          >
                            <span>{feeling}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Somatic Shift Delta Card */}
                  {somaticShiftDelta && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-br from-[#0D2D44] to-[#0A2436] rounded-2xl border border-[#1DBB8E]/50 p-4 shadow-xl space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-[#1A4666]/60">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-[#1DBB8E]" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Somatic Shift Delta
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-[#061826] bg-gradient-to-r from-[#1DBB8E] to-[#2DD4BF] px-2.5 py-0.5 rounded-full shadow-sm">
                          {somaticShiftDelta.vagalStatusBadge}
                        </span>
                      </div>

                      {/* Delta Comparison Metric */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-[#081E2E] rounded-xl p-3 border border-[#1A4666]">
                          <span className="text-[10px] text-[#7E9EB8] block uppercase tracking-wider font-semibold">
                            Distress Shift
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-lg font-bold text-slate-300">
                              {somaticShiftDelta.initialDistress}/5
                            </span>
                            <span className="text-xs text-[#1DBB8E] font-bold">→</span>
                            <span className="text-xl font-extrabold text-[#1DBB8E]">
                              {somaticShiftDelta.estimatedPostScore}/5
                            </span>
                          </div>
                          <span className="text-[10px] text-[#2DD4BF] font-medium block mt-0.5">
                            {somaticShiftDelta.percentShift}% downregulation
                          </span>
                        </div>

                        {/* Average Dwell Time per Anchor */}
                        <div className="bg-[#081E2E] rounded-xl p-3 border border-[#1A4666]">
                          <span className="text-[10px] text-[#7E9EB8] block uppercase tracking-wider font-semibold">
                            Mindful Dwell Time
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-xl font-extrabold text-white">
                              {somaticShiftDelta.averageDwellSeconds}s
                            </span>
                            <span className="text-xs text-[#7E9EB8]">/ anchor</span>
                          </div>
                          <span
                            className={`text-[10px] font-medium block mt-0.5 ${
                              somaticShiftDelta.isPacingOptimal ? 'text-[#1DBB8E]' : 'text-[#7E9EB8]'
                            }`}
                          >
                            {somaticShiftDelta.dwellPacingLabel}
                          </span>
                        </div>
                      </div>

                      {/* Clinical Reflection Note */}
                      <div className="bg-[#081E2E]/60 rounded-xl p-2.5 border border-[#1A4666]/50 text-xs text-[#7E9EB8] flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#1DBB8E] shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed">
                          {somaticShiftDelta.isPacingOptimal
                            ? 'Optimal pacing maintained: Spending intentional time with each anchor activates the vagal brake and grounds the autonomic nervous system.'
                            : 'Mindful practice complete. Grounding brings cognitive attention back into your physical environment.'}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Standard Grounding Metrics summary */}
                  <div className="bg-[#0D2D44] rounded-2xl border border-[#1A4666] p-4 shadow-xl space-y-2.5">
                    <div className="flex items-center justify-between border-b border-[#1A4666]/60 pb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#2DD4BF]">
                        Session Metrics
                      </span>
                      <div className="flex items-center gap-1 text-xs text-[#7E9EB8]">
                        <Clock className="w-3.5 h-3.5 text-[#1DBB8E]" />
                        <span>{formatDuration(sessionDurationSeconds)} total</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-[#081E2E] p-2.5 rounded-xl border border-[#1A4666]">
                        <span className="text-[#7E9EB8] block text-[10px]">Senses Explored</span>
                        <span className="text-base font-bold text-white">
                          {summaryMetrics.completedCount} / 5 completed
                        </span>
                      </div>
                      <div className="bg-[#081E2E] p-2.5 rounded-xl border border-[#1A4666]">
                        <span className="text-[#7E9EB8] block text-[10px]">Anchors Noticed</span>
                        <span className="text-base font-bold text-[#1DBB8E]">
                          {summaryMetrics.totalItems} sensory points
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Back to Self Care CTA */}
                <div className="pt-3 pb-2">
                  <button
                    type="button"
                    onClick={handleResetToSelfCare}
                    className="w-full py-3.5 px-6 rounded-full bg-[#1DBB8E] hover:bg-[#25BFA0] active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-[#1DBB8E]/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                    <span>Back to Self Care</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* 4. Bottom Navigation Bar */}
        <nav className="relative z-20 bg-[#0A2436] border-t border-[#1A4666] px-4 py-2 flex items-center justify-around text-xs">
          <button
            type="button"
            onClick={() => handleResetToSelfCare()}
            className="flex flex-col items-center gap-1 text-[#7E9EB8] hover:text-white transition-colors cursor-pointer"
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px]">Home</span>
          </button>

          <button
            type="button"
            className="flex flex-col items-center gap-1 text-[#7E9EB8] hover:text-white transition-colors cursor-pointer"
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px]">Sessions</span>
          </button>

          <button
            type="button"
            onClick={() => handleResetToSelfCare()}
            className="flex flex-col items-center gap-1 text-[#1DBB8E] font-bold cursor-pointer"
          >
            <div className="relative">
              <Flower2 className="w-5 h-5 stroke-[2.4]" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#1DBB8E] rounded-full" />
            </div>
            <span className="text-[10px]">Self-Care</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="flex flex-col items-center gap-1 text-[#7E9EB8] hover:text-white transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px]">Menu</span>
          </button>
        </nav>
      </div>

      {/* MODAL: SETTINGS */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[360px] max-h-[90vh] overflow-y-auto bg-[#0A2436] border border-[#1A4666] rounded-3xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1A4666]">
                <h3 className="text-base font-bold text-white">Settings</h3>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="w-7 h-7 rounded-full bg-[#081E2E] border border-[#1A4666] flex items-center justify-center text-[#7E9EB8] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Daily Reminder matching Figma design */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0D2D44] border border-[#1A4666]">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-[#2DD4BF]" />
                    <span className="text-sm font-semibold text-white">Daily Reminder</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#7E9EB8]" />
                </div>

                {/* Guided Voice Toggle & Voice Tone Config */}
                <div className="p-3 rounded-2xl bg-[#0D2D44] border border-[#1A4666] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mic className="w-5 h-5 text-[#2DD4BF]" />
                      <div>
                        <span className="text-sm font-semibold text-white block">Guided Voice</span>
                        <span className="text-[10px] text-[#7E9EB8]">Soft unhurried narration</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerAppHaptic('tap');
                        setIsGuidedVoiceEnabled((prev) => !prev);
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                        isGuidedVoiceEnabled ? 'bg-[#1DBB8E]' : 'bg-[#081E2E] border border-[#1A4666]'
                      }`}
                      aria-label="Toggle Guided Voice"
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          isGuidedVoiceEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {isGuidedVoiceEnabled && (
                    <div className="pt-2 border-t border-[#1A4666]/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] font-semibold text-[#2DD4BF] uppercase tracking-wider">
                          Voice Tone &amp; Pacing
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            triggerAppHaptic('tap');
                            somaticNarrator.previewVoice();
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-[#1DBB8E] hover:underline cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Test Voice</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5">
                        {(Object.keys(VOICE_TONES) as VoiceTone[]).map((toneKey) => {
                          const config = VOICE_TONES[toneKey];
                          const isSelected = selectedVoiceTone === toneKey;
                          return (
                            <button
                              key={toneKey}
                              type="button"
                              onClick={() => {
                                triggerAppHaptic('tap');
                                setSelectedVoiceTone(toneKey);
                                somaticNarrator.setTone(toneKey);
                                somaticNarrator.previewVoice();
                              }}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                                isSelected
                                  ? 'bg-[#09354E] border-[#1DBB8E] text-white shadow-sm'
                                  : 'bg-[#081E2E] border-[#1A4666] text-[#7E9EB8] hover:border-slate-400 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white">{config.name}</span>
                                {isSelected && (
                                  <span className="w-2 h-2 rounded-full bg-[#1DBB8E]" />
                                )}
                              </div>
                              <span className="text-[10px] text-[#7E9EB8] leading-tight">
                                {config.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Background Sound Configuration */}
                <div className="p-3 rounded-2xl bg-[#0D2D44] border border-[#1A4666] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Waves className="w-5 h-5 text-[#2DD4BF]" />
                      <div>
                        <span className="text-sm font-semibold text-white block">Background Sound</span>
                        <span className="text-[10px] text-[#7E9EB8]">Calming ambient audio</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerAppHaptic('tap');
                        setIsBackgroundSoundEnabled((prev) => !prev);
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                        isBackgroundSoundEnabled ? 'bg-[#1DBB8E]' : 'bg-[#081E2E] border border-[#1A4666]'
                      }`}
                      aria-label="Toggle Background Sound"
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          isBackgroundSoundEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {isBackgroundSoundEnabled && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAmbientType('water_waves');
                          triggerAppHaptic('tap');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                          ambientType === 'water_waves'
                            ? 'bg-[#09354E] border-[#1DBB8E] text-white shadow-sm'
                            : 'bg-[#081E2E] border-[#1A4666] text-[#7E9EB8]'
                        }`}
                      >
                        <Waves className="w-3.5 h-3.5 text-[#2DD4BF]" />
                        <span>Ocean Waves</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAmbientType('gentle_rain');
                          triggerAppHaptic('tap');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                          ambientType === 'gentle_rain'
                            ? 'bg-[#09354E] border-[#1DBB8E] text-white shadow-sm'
                            : 'bg-[#081E2E] border-[#1A4666] text-[#7E9EB8]'
                        }`}
                      >
                        <CloudRain className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>Gentle Rain</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Subtle Vibration Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0D2D44] border border-[#1A4666]">
                  <div className="flex items-center gap-3">
                    <Vibrate className="w-5 h-5 text-[#2DD4BF]" />
                    <div>
                      <span className="text-sm font-semibold text-white block">Somatic Haptics</span>
                      <span className="text-[10px] text-[#7E9EB8]">Gentle tactile feedback</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsVibrationEnabled((prev) => {
                        const next = !prev;
                        if (next) triggerHaptic('tap', true);
                        return next;
                      });
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      isVibrationEnabled ? 'bg-[#1DBB8E]' : 'bg-[#081E2E] border border-[#1A4666]'
                    }`}
                    aria-label="Toggle Haptics"
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        isVibrationEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="w-full py-3 rounded-full bg-[#1DBB8E] hover:bg-[#25BFA0] text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  Save &amp; Return
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: EXIT CONFIRMATION */}
      <AnimatePresence>
        {showExitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[340px] bg-[#0A2436] border border-[#1A4666] rounded-3xl p-5 shadow-2xl space-y-4"
            >
              <h3 className="text-base font-bold text-white">Pause Grounding Reset?</h3>
              <p className="text-xs text-[#7E9EB8] leading-relaxed">
                You can step away at any time. Your body is always safe to pause and return when ready.
              </p>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExitModal(false)}
                  className="flex-1 py-3 rounded-full bg-[#081E2E] border border-[#1A4666] text-[#7E9EB8] hover:text-white font-semibold text-xs cursor-pointer"
                >
                  Continue Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExitModal(false);
                    handleResetToSelfCare();
                  }}
                  className="flex-1 py-3 rounded-full bg-[#1DBB8E] hover:bg-[#25BFA0] text-white font-bold text-xs cursor-pointer"
                >
                  Exit Safely
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}