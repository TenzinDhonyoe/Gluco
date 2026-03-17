import React, { createContext, useCallback, useContext, useState } from 'react';

interface AddMenuContextType {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
}

const AddMenuContext = createContext<AddMenuContextType | undefined>(undefined);

export function AddMenuProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
    const close = useCallback(() => setIsOpen(false), []);

    return (
        <AddMenuContext.Provider value={{ isOpen, toggle, close }}>
            {children}
        </AddMenuContext.Provider>
    );
}

export function useAddMenu() {
    const context = useContext(AddMenuContext);
    if (!context) throw new Error('useAddMenu must be used within AddMenuProvider');
    return context;
}
