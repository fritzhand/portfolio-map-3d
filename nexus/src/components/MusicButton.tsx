/* The floating music button, bottom right on both pages (base.css): plays the site's music or
   pauses it (hooks/useMusic.ts). Its state is the audio's, so the landing page's button and the
   Nexus's agree. None when MUSIC is null. */
import type { Ref } from "react";
import { MUSIC } from "../config.ts";
import { toggleMusic, useMusicPlaying } from "../hooks/useMusic.ts";
import { MusicNote, SoundBars } from "./Icons.tsx";

export function MusicButton({ ref }: { ref?: Ref<HTMLButtonElement> }) {
  const playing = useMusicPlaying();
  if (!MUSIC) return null;
  return (
    <button ref={ref} type="button" className="music-fab" aria-label="Music" aria-pressed={playing} title={playing ? "Pause the music" : "Play music"} onClick={toggleMusic}>
      {playing ? <SoundBars size={20} /> : <MusicNote size={20} />}
    </button>
  );
}
