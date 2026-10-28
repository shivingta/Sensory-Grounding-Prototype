/**
 * Web Audio API Ambient Sound Generator
 * Generates continuous soothing background sounds (Water Waves, Gentle Rain, Twilight Ambient)
 * completely client-side without external asset dependencies.
 */

export type AmbientSoundType = 'water_waves' | 'gentle_rain' | 'twilight_ambient';

class AmbientSoundEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private currentType: AmbientSoundType = 'water_waves';
  private masterGain: GainNode | null = null;
  private nodes: (AudioNode | number)[] = [];
  private volume = 0.4;

  private initContext() {
    if (this.ctx) return this.ctx;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    this.ctx = new AudioContextClass();
    return this.ctx;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getCurrentType(): AmbientSoundType {
    return this.currentType;
  }

  public isSoundPlaying(): boolean {
    return this.isPlaying;
  }

  public start(type: AmbientSoundType = 'water_waves') {
    this.stop();
    const ctx = this.initContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.currentType = type;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    if (type === 'water_waves') {
      this.createWaterWaves(ctx, this.masterGain);
    } else if (type === 'gentle_rain') {
      this.createGentleRain(ctx, this.masterGain);
    } else {
      this.createTwilightAmbient(ctx, this.masterGain);
    }

    this.isPlaying = true;
  }

  public stop() {
    if (this.ctx) {
      try {
        this.nodes.forEach(node => {
          if (typeof node === 'number') {
            window.clearInterval(node);
          } else if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
            (node as AudioScheduledSourceNode).stop();
          } else if ('disconnect' in node) {
            node.disconnect();
          }
        });
      } catch {
        // ignore cleanup errors
      }
      this.nodes = [];
    }
    this.isPlaying = false;
  }

  private createWaterWaves(ctx: AudioContext, destination: GainNode) {
    // Generate pink noise buffer for warm rolling ocean swell
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
      b6 = white * 0.115926;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Ocean filter with slow oscillating frequency (waves rolling in and out)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, ctx.currentTime);
    filter.Q.setValueAtTime(1.8, ctx.currentTime);

    // LFO for periodic wave rhythm (0.12 Hz ~ 8 seconds per wave cycle)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.12, ctx.currentTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(180, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Wave volume surge
    const waveGain = ctx.createGain();
    waveGain.gain.setValueAtTime(0.4, ctx.currentTime);
    const volumeLfo = ctx.createOscillator();
    volumeLfo.type = 'sine';
    volumeLfo.frequency.setValueAtTime(0.12, ctx.currentTime);
    const volumeLfoGain = ctx.createGain();
    volumeLfoGain.gain.setValueAtTime(0.25, ctx.currentTime);
    volumeLfo.connect(volumeLfoGain);
    volumeLfoGain.connect(waveGain.gain);

    whiteNoise.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(destination);

    whiteNoise.start();
    lfo.start();
    volumeLfo.start();

    this.nodes.push(whiteNoise, filter, lfo, lfoGain, waveGain, volumeLfo, volumeLfoGain);
  }

  private createGentleRain(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.05;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.Q.setValueAtTime(0.6, ctx.currentTime);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.35, ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(destination);

    noiseSource.start();
    this.nodes.push(noiseSource, filter, rainGain);
  }

  private createTwilightAmbient(ctx: AudioContext, destination: GainNode) {
    // 528Hz warm meditative Solfeggio frequency + sub-octaves
    const freqs = [132, 264, 396, 528];
    const gains = [0.15, 0.12, 0.08, 0.05];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Subtle slow detune for shimmer
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.08 + idx * 0.02, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(1.5, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(gains[idx] || 0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(destination);

      osc.start();
      lfo.start();
      this.nodes.push(osc, gain, lfo, lfoGain);
    });
  }
}

export const ambientSound = new AmbientSoundEngine();
