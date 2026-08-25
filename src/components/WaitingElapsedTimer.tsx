import { useEffect, useState } from 'react';
import { Text } from 'react-native';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

type WaitingElapsedTimerProps = Readonly<{
  sinceIso: string;
  className?: string;
}>;

export function WaitingElapsedTimer({
  sinceIso,
  className,
}: WaitingElapsedTimerProps) {
  const [label, setLabel] = useState('00:00');

  useEffect(() => {
    const started = new Date(sinceIso).getTime();
    if (!Number.isFinite(started)) {
      setLabel('00:00');
      return;
    }

    const tick = () => {
      setLabel(formatElapsed(Date.now() - started));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sinceIso]);

  return (
    <Text className={className ?? 'text-amber-300 font-black text-2xl tabular-nums'}>
      {label}
    </Text>
  );
}
