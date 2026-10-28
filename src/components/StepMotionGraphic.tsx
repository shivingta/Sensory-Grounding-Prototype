import React from 'react';
import { motion } from 'motion/react';
import { Eye, Hand, Ear, Wind, Sparkles } from 'lucide-react';
import { SenseKey } from '../logic/groundingMachine';

interface StepMotionGraphicProps {
  senseKey: SenseKey;
  stepNumber: number;
  senseName: string;
  leadInTitle: string;
  leadInSubtitle: string;
  audioScript: string;
  isSpeaking: boolean;
  onSkipLeadIn: () => void;
}

export function StepMotionGraphic({
  senseKey,
  stepNumber,
  senseName,
  leadInTitle,
  leadInSubtitle,
  audioScript,
  isSpeaking,
  onSkipLeadIn,
}: StepMotionGraphicProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative flex-1 flex flex-col items-center justify-between py-6 px-4 text-center overflow-hidden"
    >
      {/* Top Step Pill */}
      <div className="z-10 flex items-center gap-2">
        <span className="px-3 py-1 rounded-full bg-[#0D2D44] border border-[#1A4666] text-xs font-semibold text-[#2DD4BF] uppercase tracking-wider">
          Step {5 - stepNumber + 1} • {stepNumber} {senseName}
        </span>
      </div>

      {/* Center Motion Graphic Canvas */}
      <div className="relative w-64 h-64 flex items-center justify-center my-auto">
        {/* Ambient backdrop glow */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#20A88D]/15 to-[#38BDF8]/15 blur-2xl" />

        {/* SIGHT (Step 5) Motion Graphic: Concentric Expanding Iris */}
        {senseKey === 'sight' && (
          <div className="relative w-full h-full flex items-center justify-center">
            {[1, 2, 3, 4].map(idx => (
              <motion.div
                key={idx}
                className="absolute rounded-full border border-[#2DD4BF]/30"
                style={{ width: `${idx * 56}px`, height: `${idx * 56}px` }}
                animate={{
                  scale: [0.9, 1.15, 0.9],
                  opacity: [0.2, 0.7, 0.2],
                  rotate: [0, 90, 180],
                }}
                transition={{
                  duration: 4 + idx,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: idx * 0.4,
                }}
              />
            ))}
            <motion.div
              className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#1EB496] to-[#38BDF8] flex items-center justify-center text-[#061826] shadow-lg shadow-[#1EB496]/30 z-10"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Eye className="w-9 h-9 stroke-[2.2]" />
            </motion.div>
          </div>
        )}

        {/* TOUCH (Step 4) Motion Graphic: Tactile Radial Ripple */}
        {senseKey === 'touch' && (
          <div className="relative w-full h-full flex items-center justify-center">
            {[1, 2, 3].map(idx => (
              <motion.div
                key={idx}
                className="absolute rounded-3xl border border-[#20A88D]/40"
                style={{ width: `${idx * 70}px`, height: `${idx * 70}px` }}
                animate={{
                  scale: [0.85, 1.25, 0.85],
                  opacity: [0.3, 0.8, 0.3],
                  borderRadius: ['28%', '45%', '28%'],
                }}
                transition={{
                  duration: 4.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: idx * 0.5,
                }}
              />
            ))}
            <motion.div
              className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#20A88D] to-[#2DD4BF] flex items-center justify-center text-[#061826] shadow-lg shadow-[#20A88D]/30 z-10"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Hand className="w-9 h-9 stroke-[2.2]" />
            </motion.div>
          </div>
        )}

        {/* SOUND (Step 3) Motion Graphic: Harmonious Sound Waves */}
        {senseKey === 'sound' && (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="absolute flex items-center gap-1.5 justify-center">
              {[12, 28, 54, 78, 96, 78, 54, 28, 12].map((height, i) => (
                <motion.div
                  key={i}
                  className="w-2 bg-gradient-to-t from-[#20A88D] to-[#38BDF8] rounded-full"
                  animate={{
                    height: [height * 0.4, height, height * 0.4],
                    opacity: [0.4, 0.9, 0.4],
                  }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.12,
                  }}
                />
              ))}
            </div>
            <motion.div
              className="w-16 h-16 rounded-full bg-[#0D2D44] border-2 border-[#2DD4BF] flex items-center justify-center text-[#2DD4BF] shadow-lg shadow-[#20A88D]/25 z-10 backdrop-blur-md"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              <Ear className="w-7 h-7 stroke-[2.2]" />
            </motion.div>
          </div>
        )}

        {/* SMELL (Step 2) Motion Graphic: Upward Floating Ethereal Mist */}
        {senseKey === 'smell' && (
          <div className="relative w-full h-full flex items-center justify-center">
            {[0, 1, 2, 3].map(idx => (
              <motion.div
                key={idx}
                className="absolute w-28 h-28 rounded-full border border-[#2DD4BF]/30 bg-[#2DD4BF]/5"
                animate={{
                  y: [20, -50],
                  scale: [0.6, 1.3],
                  opacity: [0, 0.6, 0],
                  x: [idx % 2 === 0 ? -15 : 15, idx % 2 === 0 ? 15 : -15],
                }}
                transition={{
                  duration: 3.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: idx * 0.8,
                }}
              />
            ))}
            <motion.div
              className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#1EB496] to-[#2DD4BF] flex items-center justify-center text-[#061826] shadow-lg shadow-[#1EB496]/30 z-10"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Wind className="w-9 h-9 stroke-[2.2]" />
            </motion.div>
          </div>
        )}

        {/* TASTE (Step 1) Motion Graphic: Centering Still Droplet */}
        {senseKey === 'taste' && (
          <div className="relative w-full h-full flex items-center justify-center">
            {[1, 2, 3].map(idx => (
              <motion.div
                key={idx}
                className="absolute rounded-full border border-[#38BDF8]/40"
                style={{ width: `${idx * 64}px`, height: `${idx * 64}px` }}
                animate={{
                  scale: [0.6, 1.25],
                  opacity: [0.8, 0],
                }}
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: idx * 0.7,
                }}
              />
            ))}
            <motion.div
              className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#38BDF8] to-[#2DD4BF] flex items-center justify-center text-[#061826] shadow-lg shadow-[#38BDF8]/30 z-10"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="w-9 h-9 stroke-[2.2]" />
            </motion.div>
          </div>
        )}
      </div>

      {/* Voice Guide Prompt & Human Cue */}
      <div className="z-10 space-y-3 max-w-xs">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{leadInTitle}</h2>
          <p className="text-xs text-[#7E9EB8] mt-0.5">{leadInSubtitle}</p>
        </div>

        {/* Natural spoken transcript quote */}
        <div className="bg-[#0D2D44]/90 border border-[#1A4666] p-3 rounded-2xl shadow-lg backdrop-blur-md">
          <p className="text-sm font-medium text-slate-100 leading-relaxed italic">
            "{audioScript}"
          </p>
          {isSpeaking && (
            <div className="flex items-center justify-center gap-1.5 mt-2 text-[11px] text-[#2DD4BF] font-semibold">
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-3 bg-[#2DD4BF] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-4 bg-[#38BDF8] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-2 bg-[#20A88D] rounded-full animate-bounce" />
              </span>
              <span>Guiding your awareness...</span>
            </div>
          )}
        </div>

        {/* Enter Step Button */}
        <button
          type="button"
          onClick={onSkipLeadIn}
          className="w-full py-3.5 px-6 rounded-full bg-[#20A88D] hover:bg-[#25BFA0] active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-[#20A88D]/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Begin {senseName} Exercise</span>
        </button>
      </div>
    </motion.div>
  );
}
