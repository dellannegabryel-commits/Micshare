import { useState, useEffect } from 'react';
import { beaconListener, PCInfo } from './beaconListener';

export function useDiscoveredPCs(): { pcs: PCInfo[]; refreshing: boolean; refresh: () => void } {
  const [pcs, setPCs] = useState<PCInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = beaconListener.subscribe(setPCs);
    beaconListener.start().catch((err) => console.error('[beacon] start failed:', err));
    return () => {
      unsubscribe();
      beaconListener.stop();
    };
  }, []);

  const refresh = () => {
    setRefreshing(true);
    // beaconListener already listens continuously; just trigger a re-render
    setTimeout(() => setRefreshing(false), 500);
  };

  return { pcs, refreshing, refresh };
}