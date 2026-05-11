/**
 * useAppForeground
 *
 * Invokes a callback when the app comes back from background. React Navigation's
 * useFocusEffect only fires on screen focus, not when the whole app returns —
 * so a user who synced data overnight in Apple Health and re-opens the app
 * would otherwise see stale numbers until they navigate away and back.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function useAppForeground(callback: () => void, enabled: boolean = true): void {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!enabled) return;

        let lastState: AppStateStatus = AppState.currentState;

        const subscription = AppState.addEventListener('change', (next) => {
            // Only fire on transitions from background/inactive → active.
            // Avoids firing for permission sheets, control center, etc. that
            // briefly inactivate the app without backgrounding it.
            if ((lastState === 'background' || lastState === 'inactive') && next === 'active') {
                try {
                    callbackRef.current();
                } catch (e) {
                    if (__DEV__) console.warn('useAppForeground callback threw:', e);
                }
            }
            lastState = next;
        });

        return () => subscription.remove();
    }, [enabled]);
}
