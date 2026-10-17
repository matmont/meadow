import { Howler } from "howler";
import type GUI from "lil-gui";
import DebugManager from "./DebugManager";
import LoaderManager from "./LoaderManager";
import type { SoundId } from "./LoaderManager";

export interface PlayOptions {
  loop?: boolean;
  volume?: number;
  rate?: number;
}

export default class AudioManager {
  static #muted = false;
  static #debugFolder: GUI | null = null;

  private constructor() {}

  static init(): void {
    if (DebugManager.isEnabled) AudioManager.#createDebugFolder();
  }

  static get muted(): boolean {
    return AudioManager.#muted;
  }

  static set muted(value: boolean) {
    AudioManager.#muted = value;
    Howler.mute(value);
  }

  // Returns the playback id, to stop this playback only instead of every playback of the sound
  static play(
    id: SoundId,
    { loop = false, volume, rate }: PlayOptions = {},
  ): number {
    const sound = LoaderManager.sound(id);
    const playbackId = sound.play();
    sound.loop(loop, playbackId);
    if (volume !== undefined) sound.volume(volume, playbackId);
    if (rate !== undefined) sound.rate(rate, playbackId);
    return playbackId;
  }

  static setRate(id: SoundId, rate: number, playbackId?: number): void {
    LoaderManager.sound(id).rate(rate, playbackId);
  }

  static stop(id: SoundId, playbackId?: number): void {
    LoaderManager.sound(id).stop(playbackId);
  }

  static dispose(): void {
    Howler.stop();
    AudioManager.#debugFolder?.destroy();
    AudioManager.#debugFolder = null;
  }

  static #createDebugFolder(): void {
    if (AudioManager.#debugFolder) return;

    const folder = DebugManager.gui.addFolder("Audio");
    const master = { volume: Howler.volume() };
    folder
      .add(master, "volume", 0, 1, 0.01)
      .name("master volume")
      .onChange((value: number) => Howler.volume(value));
    folder.add(AudioManager, "muted");

    for (const id of LoaderManager.soundIds) {
      const sound = LoaderManager.sound(id);
      const soundFolder = folder.addFolder(id).close();
      soundFolder
        .add({ volume: sound.volume() }, "volume", 0, 1, 0.01)
        .onChange((value: number) => sound.volume(value));
      soundFolder.add({ play: () => AudioManager.play(id) }, "play");
      soundFolder.add({ stop: () => AudioManager.stop(id) }, "stop");
    }

    AudioManager.#debugFolder = folder;
  }
}
