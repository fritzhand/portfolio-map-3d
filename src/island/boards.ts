// @ts-nocheck
/* Names on the island's boards (a gateway's, a pylon's screen, a landmark's fascia): a white pill
   with the name in the site's ink, sized into the board's anchor (campus.ts), drawn unlit so it reads
   as a lit sign in the dark theme too. */
import { Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { labelTexture } from '../three/logoTexture';

const INK = '#16202b';

/** A board's name as a plane fitted into a w x h anchor whose world matrix is `matrix`. */
export function boardMesh(text: string, matrix: Matrix4, w: number, h: number): Mesh {
  const label = labelTexture(text, { bg: '#ffffff', color: INK, size: 64, weight: 650, padX: 40 });
  (label.texture as any).encoding = 3001;
  const fitW = Math.min(w, h * label.aspect);
  const fitH = fitW / label.aspect;
  const mesh = new Mesh(new PlaneGeometry(fitW, fitH), new MeshBasicMaterial({ map: label.texture, transparent: true, toneMapped: false }));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.renderOrder = 2;
  return mesh;
}
