/**
 * Síntese de um baixo dedilhado com Web Audio API, sem samples nem rede.
 *
 * Voz: dente-de-serra + seno na fundamental, passando por um passa-baixa com
 * envelope (o "plec" do ataque que escurece), mais harmônicos 2 e 3 em seno
 * para que as notas graves continuem audíveis em alto-falantes de celular,
 * que quase não reproduzem abaixo de ~150 Hz.
 */

const ATTACK_S = 0.005;
const DECAY_S = 1.6;
const STOP_AFTER_S = 1.9;
const RELEASE_ON_CUT_S = 0.03;
const SILENCE = 0.0001;
const START_DELAY_S = 0.02;
/** Intervalo entre o início de cada nota de uma sequência. */
export const NOTE_SPACING_S = 0.8;

/** Instantes (s) em que cada nota de uma sequência começa, a partir de 0. */
export function sequenceOnsets(count: number, spacing: number = NOTE_SPACING_S): number[] {
  return Array.from({ length: count }, (_, i) => i * spacing);
}

/** Nível do envelope `elapsed` segundos depois do pico (decaimento exponencial). */
export function decayLevel(peak: number, elapsed: number): number {
  const t = Math.min(1, Math.max(0, elapsed / DECAY_S));
  return peak * (SILENCE / peak) ** t;
}

/**
 * Compensação de volume entre graves e agudos: frequências baixas soam mais
 * fracas ao ouvido (e nos alto-falantes), então recebem um pouco mais de ganho.
 * Referência: A1 (55 Hz) = 1.
 */
export function loudnessCompensation(frequency: number): number {
  const gain = (55 / frequency) ** 0.3;
  return Math.min(1.3, Math.max(0.75, gain));
}

/** Frequência de corte inicial do filtro (decai até ~2× a fundamental). */
export function filterStartCutoff(frequency: number): number {
  return Math.min(5000, frequency * 18);
}

interface Voice {
  output: GainNode;
  sources: OscillatorNode[];
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  // Safari antigo (iOS < 14.5) só expõe webkitAudioContext.
  const g = globalThis as Partial<typeof globalThis> & { webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export class BassSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  private unlocked = false;

  get supported(): boolean {
    return getAudioContextCtor() !== null;
  }

  /**
   * Cria/retoma o AudioContext. Precisa ser chamado dentro de um gesto do
   * usuário (clique/toque); no iOS também toca um buffer mudo para destravar.
   */
  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* alguns navegadores rejeitam fora de um gesto; tenta de novo no próximo */
      }
    }
    if (!this.unlocked) {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      this.unlocked = true;
    }
    return ctx.state === 'running';
  }

  /** Toca uma nota (monofônico: corta o que estiver soando com um release curto). */
  play(frequency: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.stopAll(ctx.currentTime);
    this.scheduleVoice(ctx, frequency, ctx.currentTime + START_DELAY_S);
  }

  /**
   * Toca uma sequência, uma nota depois da outra, agendada no relógio do
   * áudio (sem setTimeout). Cada nota é abafada quando a seguinte começa,
   * como faria o baixista; a última soa até o fim.
   * Retorna a duração total em segundos.
   */
  playSequence(frequencies: readonly number[], spacing: number = NOTE_SPACING_S): number {
    const ctx = this.ready();
    if (!ctx || frequencies.length === 0) return 0;
    this.stopAll(ctx.currentTime);
    const start = ctx.currentTime + START_DELAY_S;
    const onsets = sequenceOnsets(frequencies.length, spacing);
    frequencies.forEach((f, i) => {
      const next = onsets[i + 1];
      this.scheduleVoice(ctx, f, start + onsets[i], next === undefined ? undefined : start + next);
    });
    return onsets[onsets.length - 1] + DECAY_S;
  }

  private ready(): AudioContext | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return null;
    if (ctx.state !== 'running') void ctx.resume();
    return ctx;
  }

  private scheduleVoice(ctx: AudioContext, frequency: number, t0: number, cutAt?: number): void {
    const peak = 0.55 * loudnessCompensation(frequency);
    const tPeak = t0 + ATTACK_S;

    const output = ctx.createGain();
    output.gain.setValueAtTime(0, t0);
    output.gain.linearRampToValueAtTime(peak, tPeak);
    let end: number;
    if (cutAt === undefined) {
      output.gain.exponentialRampToValueAtTime(SILENCE, tPeak + DECAY_S);
      end = t0 + STOP_AFTER_S;
    } else {
      // Segue a mesma curva de decaimento até o corte e então abafa rápido.
      output.gain.exponentialRampToValueAtTime(decayLevel(peak, cutAt - tPeak), cutAt);
      output.gain.exponentialRampToValueAtTime(SILENCE, cutAt + RELEASE_ON_CUT_S);
      end = cutAt + RELEASE_ON_CUT_S + 0.02;
    }
    output.connect(this.master!);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(filterStartCutoff(frequency), t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, frequency * 2), t0 + 0.6);
    filter.connect(output);

    const sources: OscillatorNode[] = [];
    const addPartial = (type: OscillatorType, ratio: number, level: number, dest: AudioNode) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency * ratio;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(dest);
      osc.start(t0);
      osc.stop(end);
      sources.push(osc);
    };

    // Corpo: passa pelo filtro com envelope.
    addPartial('sawtooth', 1, 0.45, filter);
    addPartial('sine', 1, 0.7, filter);
    // Harmônicos para alto-falantes pequenos (fora do filtro, volume baixo).
    addPartial('sine', 2, 0.28, output);
    addPartial('sine', 3, 0.12, output);

    const voice: Voice = { output, sources };
    this.voices.add(voice);
    sources[0].onended = () => {
      output.disconnect();
      this.voices.delete(voice);
    };
  }

  /** Abafa tudo que está soando ou agendado (inclusive notas futuras de uma sequência). */
  private stopAll(now: number): void {
    for (const voice of this.voices) {
      const g = voice.output.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(g.value, SILENCE), now);
      g.exponentialRampToValueAtTime(SILENCE, now + RELEASE_ON_CUT_S);
      for (const osc of voice.sources) {
        try {
          osc.stop(now + RELEASE_ON_CUT_S + 0.01);
        } catch {
          /* já parado */
        }
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.8;
    // Compressor leve para evitar clipping quando os harmônicos somam.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }
}
