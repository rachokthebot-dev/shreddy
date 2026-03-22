declare module "soundtouchjs" {
  export class PitchShifter {
    constructor(
      context: AudioContext,
      buffer: AudioBuffer,
      bufferSize: number,
      onEnd?: () => void
    );
    get timePlayed(): number;
    get percentagePlayed(): number;
    set percentagePlayed(perc: number);
    set pitch(pitch: number);
    set pitchSemitones(semitone: number);
    set rate(rate: number);
    set tempo(tempo: number);
    get node(): ScriptProcessorNode;
    connect(toNode: AudioNode): void;
    disconnect(): void;
    on(eventName: string, cb: (detail: unknown) => void): void;
    off(eventName?: string): void;
    duration: number;
    sampleRate: number;
    sourcePosition: number;
  }

  export class SoundTouch {
    pitch: number;
    pitchSemitones: number;
    rate: number;
    tempo: number;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
  }

  export class SimpleFilter {
    constructor(
      source: WebAudioBufferSource,
      soundtouch: SoundTouch,
      onEnd?: () => void
    );
    sourcePosition: number;
  }

  export function getWebAudioNode(
    context: AudioContext,
    filter: SimpleFilter,
    onUpdate?: (sourcePosition: number) => void,
    bufferSize?: number
  ): ScriptProcessorNode;
}
