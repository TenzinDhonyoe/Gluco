import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type TransitionDirection = 'left' | 'right' | 'none';

interface TabTransitionContextType {
    direction: TransitionDirection;
    currentIndex: number;
    setCurrentTab: (routeName: string) => void;
}

const TabTransitionContext = createContext<TabTransitionContextType>({
    direction: 'none',
    currentIndex: 0,
    setCurrentTab: () => {},
});

// Map route names to indices
const TAB_INDEX_MAP: Record<string, number> = {
    'index': 0,
    'log': 1,
    'insights': 2,
    'coach': 3,
};

export function TabTransitionProvider({ children }: { children: React.ReactNode }) {
    const [direction, setDirection] = useState<TransitionDirection>('none');
    const [currentIndex, setCurrentIndex] = useState(0);
    const previousIndexRef = useRef(0);

    const setCurrentTab = useCallback((routeName: string) => {
        const newIndex = TAB_INDEX_MAP[routeName] ?? 0;
        const prevIndex = previousIndexRef.current;

        if (newIndex !== prevIndex) {
            // Determine direction: moving right in tabs = slide content left
            const newDirection: TransitionDirection = newIndex > prevIndex ? 'left' : 'right';
            setDirection(newDirection);
            setCurrentIndex(newIndex);
            previousIndexRef.current = newIndex;
        }
    }, []);

    return (
        <TabTransitionContext.Provider value={{ direction, currentIndex, setCurrentTab }}>
            {children}
        </TabTransitionContext.Provider>
    );
}

export function useTabTransition() {
    return useContext(TabTransitionContext);
}
