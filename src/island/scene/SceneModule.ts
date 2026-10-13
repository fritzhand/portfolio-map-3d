// @ts-nocheck
// Scene module base: construct with the scene, load assets, resolve `ready`.

import { deferred, type Deferred } from '../core/deferred';
import type { BaseScene } from '../engine/scene';

export abstract class SceneModule {
  readonly scene: BaseScene;
  readonly ready: Deferred<void> = deferred();

  constructor(scene: BaseScene) {
    this.scene = scene;
    this.init();
  }

  protected abstract init(): void;
}
