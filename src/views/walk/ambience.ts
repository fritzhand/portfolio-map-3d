/* The walk world's sound, made on the spot with the Web Audio API (no audio files, nothing
   fetched): a breeze, cicadas on a warm afternoon (crickets by moonlight), the sea when the
   walker is near the coast, now and then a bird, and footsteps that change with the ground (a
   dry tap on the road, a soft brush on grass).

   It is off until the visitor turns it on (the HUD's sound button; a browser only allows sound
   after a click anyway), and the choice is remembered. While off, nothing is created: no
   AudioContext, no nodes. update() runs once a frame and only nudges a few gains. */

export interface AmbienceState {
  /** Walking (or running) on foot, not leaping or driving. */
  stepping: boolean;
  running: boolean;
  /** On a road (a harder, brighter step). */
  road: boolean;
  /** 0 inland .. 1 on the beach. */
  shore: number;
  /** 0..1: how windy it is here (higher up, nearer the coast). */
  wind: number;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: GainNode | null = null;
  private sea: GainNode | null = null;
  private bugs: GainNode | null = null;
  private enabled = false;
  private night = false;
  private time = 0;
  private stepClock = 0;
  private birdClock = 4;
  private seed = 1;

  /** True once sound can play (the context exists and runs). */
  get playing(): boolean {
    return this.enabled && !!this.ctx && this.ctx.state === "running";
  }

  /** By moonlight the insects are crickets and the birds sleep (takes effect for sound made after this). */
  setNight(night: boolean): void {
    this.night = night;
  }

  /** Turn the sound on or off. Must be called from a click or key press the first time (the browser's rule). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      if (!this.ctx) this.create();
      void this.ctx?.resume();
      this.master?.gain.setTargetAtTime(0.9, this.ctx?.currentTime ?? 0, 0.3);
    } else {
      this.master?.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.15);
      // Free the audio hardware a moment after the fade.
      const ctx = this.ctx;
      window.setTimeout(() => {
        if (!this.enabled && ctx && ctx.state === "running") void ctx.suspend();
      }, 600);
    }
  }

  private rand(): number {
    // A small deterministic generator: the same afternoon every time.
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private create(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.master = master;
      // Two seconds of noise, softened toward pink by a running average, loops under every layer.
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = last * 0.82 + (this.rand() * 2 - 1) * 0.18;
        d[i] = last * 3.2;
      }
      this.noise = buf;
      this.wind = this.layer(master, "lowpass", 420, 0.7, 0.05);
      this.sea = this.layer(master, "lowpass", 900, 0.5, 0);
      this.rebuildBugs();
    } catch {
      this.ctx = null;
    }
  }

  /** A looping noise layer through one filter into its own gain. */
  private layer(out: AudioNode, type: BiquadFilterType, freq: number, q: number, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = this.rand();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start();
    return g;
  }

  /** Cicadas by day, crickets by night: a narrow band of noise, pulsed by a fast tremolo. */
  private rebuildBugs(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = this.night ? 4300 : 5600;
    band.Q.value = this.night ? 18 : 7;
    const out = ctx.createGain();
    out.gain.value = 0.0;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = this.night ? 9 : 31;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    src.connect(band).connect(trem).connect(out).connect(this.master);
    src.start();
    lfo.start();
    this.bugs = out;
  }

  update(dt: number, s: AmbienceState): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== "running") return;
    this.time += dt;
    const t = ctx.currentTime;
    const gust = 0.55 + 0.45 * Math.sin(this.time * 0.23) * Math.sin(this.time * 0.11 + 1);
    this.wind?.gain.setTargetAtTime(0.035 + 0.07 * s.wind * gust, t, 0.4);
    this.sea?.gain.setTargetAtTime(s.shore * (0.1 + 0.07 * Math.sin(this.time * 0.45)), t, 0.5);
    // The insects swell and fade like a chorus, and rest by the water.
    const chorus = 0.5 + 0.5 * Math.sin(this.time * 0.37);
    this.bugs?.gain.setTargetAtTime((this.night ? 0.028 : 0.022) * (0.25 + chorus) * (1 - 0.7 * s.shore), t, 0.6);

    // A bird now and then (a short run of rising chirps).
    this.birdClock -= dt;
    if (this.birdClock <= 0) {
      this.birdClock = 5 + this.rand() * 12;
      if (!this.night) this.chirp(2 + Math.floor(this.rand() * 3), 2200 + this.rand() * 1600);
    }

    // Footsteps: a tap about every third of a second walking, a quarter running.
    if (s.stepping) {
      this.stepClock -= dt;
      if (this.stepClock <= 0) {
        this.stepClock = s.running ? 0.25 : 0.37;
        this.step(s.road);
      }
    } else this.stepClock = 0.05;
  }

  private chirp(n: number, base: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    for (let i = 0; i < n; i++) {
      const at = ctx.currentTime + i * 0.13;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * 1.45, at + 0.09);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.035, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0005, at + 0.11);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 0.13);
    }
  }

  private step(road: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = (road ? 1900 : 650) * (0.85 + this.rand() * 0.3);
    f.Q.value = road ? 1.4 : 0.8;
    const g = ctx.createGain();
    const at = ctx.currentTime;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(road ? 0.2 : 0.14, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, at + (road ? 0.07 : 0.11));
    src.connect(f).connect(g).connect(this.master);
    src.start(at, this.rand() * 1.5);
    src.stop(at + 0.14);
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = this.wind = this.sea = this.bugs = null;
    if (ctx) void ctx.close().catch(() => {});
  }
}
