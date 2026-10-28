/**
 * Somatic Narrator: Audio & Speech Sequencer for Grounding Exercises
 * Guarantees zero audio cutoffs, sequential pacing, and soft gentle somatic tones.
 */

export type VoiceTone = 'soft_meditative' | 'gentle_calm' | 'clear_grounded';

export interface VoiceToneConfig {
  id: VoiceTone;
  name: string;
  description: string;
  rate: number;
  pitch: number;
  volume: number;
}

export const VOICE_TONES: Record<VoiceTone, VoiceToneConfig> = {
  soft_meditative: {
    id: 'soft_meditative',
    name: 'Soft & Meditative',
    description: 'Warm, slow, whispered pacing to calm the nervous system',
    rate: 0.80,
    pitch: 0.92,
    volume: 0.85,
  },
  gentle_calm: {
    id: 'gentle_calm',
    name: 'Gentle & Calm',
    description: 'Unhurried, soothing cadence for steady grounding',
    rate: 0.84,
    pitch: 0.96,
    volume: 0.90,
  },
  clear_grounded: {
    id: 'clear_grounded',
    name: 'Clear & Grounded',
    description: 'Warm somatic presence with crisp clarity',
    rate: 0.88,
    pitch: 1.0,
    volume: 0.95,
  },
};

class SomaticNarrator {
  private tone: VoiceTone = 'soft_meditative';
  private isEnabled: boolean = true;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private activeSequenceId: number = 0;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private onSpeakingChangeCallbacks: Set<(isSpeaking: boolean) => void> = new Set();
  private isSpeaking: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Pre-warm voices
      window.speechSynthesis.onvoiceschanged = () => {
        this.selectBestVoice();
      };
      this.selectBestVoice();
    }
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.cancel();
    }
  }

  public setTone(tone: VoiceTone) {
    if (VOICE_TONES[tone]) {
      this.tone = tone;
    }
  }

  public getTone(): VoiceTone {
    return this.tone;
  }

  public setVoice(voice: SpeechSynthesisVoice | null) {
    this.selectedVoice = voice;
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    const all = window.speechSynthesis.getVoices();
    return all.filter((v) => v.lang.startsWith('en'));
  }

  public getSelectedVoice(): SpeechSynthesisVoice | null {
    if (!this.selectedVoice) {
      this.selectBestVoice();
    }
    return this.selectedVoice;
  }

  public subscribeSpeaking(cb: (isSpeaking: boolean) => void): () => void {
    this.onSpeakingChangeCallbacks.add(cb);
    cb(this.isSpeaking);
    return () => this.onSpeakingChangeCallbacks.delete(cb);
  }

  private setSpeakingState(speaking: boolean) {
    this.isSpeaking = speaking;
    this.onSpeakingChangeCallbacks.forEach((cb) => {
      try {
        cb(speaking);
      } catch {
        // ignore
      }
    });
  }

  private selectBestVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // Prioritize natural, soothing, warm human voices
    const preferredPatterns = [
      'natural',
      'samantha',
      'karen',
      'moira',
      'victoria',
      'serena',
      'ava',
      'google us english',
      'daniel',
      'en-us',
      'en-gb',
    ];

    for (const pattern of preferredPatterns) {
      const match = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          v.name.toLowerCase().includes(pattern)
      );
      if (match) {
        this.selectedVoice = match;
        return match;
      }
    }

    const fallbackEn = voices.find((v) => v.lang.startsWith('en'));
    this.selectedVoice = fallbackEn || voices[0] || null;
    return this.selectedVoice;
  }

  /**
   * Cancel any ongoing speech cleanly
   */
  public cancel() {
    this.activeSequenceId++;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    this.setSpeakingState(false);
  }

  /**
   * Speaks a single phrase
   */
  public speak(
    text: string,
    options?: {
      onEnd?: () => void;
      pauseBeforeMs?: number;
      pauseAfterMs?: number;
      rateModifier?: number;
    }
  ): Promise<void> {
    if (!this.isEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      options?.onEnd?.();
      return Promise.resolve();
    }

    const sequenceId = ++this.activeSequenceId;

    return new Promise((resolve) => {
      const execute = () => {
        if (sequenceId !== this.activeSequenceId) {
          resolve();
          return;
        }

        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          this.currentUtterance = utterance;

          const toneConfig = VOICE_TONES[this.tone] || VOICE_TONES.soft_meditative;
          utterance.rate = toneConfig.rate * (options?.rateModifier || 1.0);
          utterance.pitch = toneConfig.pitch;
          utterance.volume = toneConfig.volume;

          const voice = this.getSelectedVoice();
          if (voice) {
            utterance.voice = voice;
          }

          utterance.onstart = () => {
            if (sequenceId === this.activeSequenceId) {
              this.setSpeakingState(true);
            }
          };

          const handleFinish = () => {
            if (sequenceId === this.activeSequenceId) {
              this.setSpeakingState(false);
              this.currentUtterance = null;
              if (options?.pauseAfterMs && options.pauseAfterMs > 0) {
                setTimeout(() => {
                  if (sequenceId === this.activeSequenceId) {
                    options?.onEnd?.();
                    resolve();
                  }
                }, options.pauseAfterMs);
              } else {
                options?.onEnd?.();
                resolve();
              }
            } else {
              resolve();
            }
          };

          utterance.onend = handleFinish;
          utterance.onerror = () => {
            handleFinish();
          };

          window.speechSynthesis.speak(utterance);
        } catch {
          this.setSpeakingState(false);
          options?.onEnd?.();
          resolve();
        }
      };

      if (options?.pauseBeforeMs && options.pauseBeforeMs > 0) {
        setTimeout(execute, options.pauseBeforeMs);
      } else {
        execute();
      }
    });
  }

  /**
   * Seamlessly chains a sequence of phrases without cutting any of them off.
   * e.g. [Step Introduction] -> (600ms breath pause) -> [Anchor 1 cue]
   */
  public async speakSequence(
    phrases: { text: string; pauseAfterMs?: number }[],
    onComplete?: () => void
  ): Promise<void> {
    if (!this.isEnabled || !phrases.length) {
      onComplete?.();
      return;
    }

    const seqId = ++this.activeSequenceId;

    for (let i = 0; i < phrases.length; i++) {
      if (seqId !== this.activeSequenceId) break;

      const { text, pauseAfterMs = 450 } = phrases[i];
      if (!text || !text.trim()) continue;

      await new Promise<void>((resolve) => {
        if (seqId !== this.activeSequenceId) {
          resolve();
          return;
        }

        try {
          // Do not cancel between sequence items; speech synthesis queue takes it or speak on previous end
          const utterance = new SpeechSynthesisUtterance(text);
          this.currentUtterance = utterance;

          const toneConfig = VOICE_TONES[this.tone] || VOICE_TONES.soft_meditative;
          utterance.rate = toneConfig.rate;
          utterance.pitch = toneConfig.pitch;
          utterance.volume = toneConfig.volume;

          const voice = this.getSelectedVoice();
          if (voice) {
            utterance.voice = voice;
          }

          utterance.onstart = () => {
            if (seqId === this.activeSequenceId) {
              this.setSpeakingState(true);
            }
          };

          const done = () => {
            if (seqId === this.activeSequenceId) {
              this.setSpeakingState(false);
              this.currentUtterance = null;
              if (pauseAfterMs > 0) {
                setTimeout(resolve, pauseAfterMs);
              } else {
                resolve();
              }
            } else {
              resolve();
            }
          };

          utterance.onend = done;
          utterance.onerror = done;

          window.speechSynthesis.speak(utterance);
        } catch {
          this.setSpeakingState(false);
          resolve();
        }
      });
    }

    if (seqId === this.activeSequenceId) {
      onComplete?.();
    }
  }

  /**
   * Preview a voice sample so the user can test the soft gentle tone in Settings
   */
  public previewVoice(sampleText = 'Take a slow, gentle breath. Notice your presence in this space.') {
    return this.speak(sampleText);
  }
}

export const somaticNarrator = new SomaticNarrator();
