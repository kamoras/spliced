// One Player per board, plus the console's sound effects. The player drives
// every VU meter on screen while this board is mounted, and is torn down with
// it. `playing` is the UI's view of what's sounding right now.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '../../audio/player.js';
import { getAudioContext } from '../../audio/slicer.js';
import { getSfx } from '../../audio/sfx.js';
import type { SfxKind } from '../../audio/sfx.js';
import { setLevelSource } from '../../audio/meter.js';
import type { Piece } from '../../types.js';

export type Playing =
  | { kind: 'clip'; id: string }
  | { kind: 'seam'; row: number; seam: number }
  | { kind: 'row'; row: number; id: string | null }
  | { kind: 'song'; trackId: string; id: string | null }
  | null;

export function useBoardAudio({
  sfx,
  volume,
  pieceIds,
}: {
  sfx: boolean;
  volume: number;
  pieceIds: string[];
}) {
  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) playerRef.current = new Player(getAudioContext());
  const player = playerRef.current;
  const fxRef = useRef<ReturnType<typeof getSfx> | null>(null);
  if (!fxRef.current) fxRef.current = getSfx(getAudioContext());
  const fx = fxRef.current;

  const sfxOn = useRef(sfx);
  sfxOn.current = sfx;
  const cue = useCallback(
    (kind: SfxKind) => {
      if (sfxOn.current) fx.play(kind);
    },
    [fx]
  );
  useEffect(() => {
    player.setVolume(volume);
    fx.setVolume(volume);
  }, [player, fx, volume]);
  // This board's output drives every meter on screen.
  useEffect(() => {
    setLevelSource(
      () => player.getLevel(),
      () => player.isBusy()
    );
    return () => setLevelSource(null);
  }, [player]);

  const [playing, setPlaying] = useState<Playing>(null);
  useEffect(() => {
    // Nothing else will clear "playing" if the context can't start or an
    // interruption ends the take.
    player.onHalt = () => setPlaying(null);
    return () => {
      player.onHalt = null;
      player.dispose();
    };
  }, [player]);

  const progressGetters = useMemo(() => {
    const map = new Map<string, () => number | null>();
    pieceIds.forEach((id) => map.set(id, () => player.getClipProgress(id)));
    return map;
  }, [pieceIds, player]);

  const stopAll = useCallback(
    (tapeStop = false) => {
      player.stop(tapeStop);
      setPlaying(null);
    },
    [player]
  );

  const playPiece = useCallback(
    (piece: Piece, fromFraction: number) => {
      setPlaying({ kind: 'clip', id: piece.id });
      player.playPiece(
        piece,
        () =>
          setPlaying((p) =>
            p?.kind === 'clip' && p.id === piece.id ? null : p
          ),
        fromFraction
      );
    },
    [player]
  );

  return {
    player,
    cue,
    playing,
    setPlaying,
    stopAll,
    playPiece,
    progressGetters,
  };
}
