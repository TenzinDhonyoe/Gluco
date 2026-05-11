/**
 * DataSyncContext
 *
 * Lightweight error bus for data-sync failures. Hooks/services that fetch user
 * data (HealthKit, Supabase queries, edge-function calls) can record errors
 * here so the UI has somewhere to surface them — instead of every failure ending
 * at console.warn and the user seeing an empty card with no explanation.
 *
 * Errors auto-expire after 60s. A scope ("healthkit", "glucose", "meals", ...)
 * lets the UI group/dedupe.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type DataSyncErrorScope =
    | 'healthkit'
    | 'glucose'
    | 'meals'
    | 'activity'
    | 'weight'
    | 'sleep'
    | 'insights'
    | 'profile'
    | 'metabolic_score'
    | 'other';

export interface DataSyncError {
    id: string;
    scope: DataSyncErrorScope;
    message: string;
    at: number;
}

interface DataSyncContextType {
    errors: DataSyncError[];
    recordError: (scope: DataSyncErrorScope, error: unknown) => void;
    clearScope: (scope: DataSyncErrorScope) => void;
    clearAll: () => void;
}

const TTL_MS = 60_000;
const MAX_ERRORS = 8;

const DataSyncContext = createContext<DataSyncContextType | undefined>(undefined);

function describe(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return 'Unknown error';
    }
}

export function DataSyncProvider({ children }: { children: React.ReactNode }) {
    const [errors, setErrors] = useState<DataSyncError[]>([]);
    const counterRef = useRef(0);

    const recordError = useCallback((scope: DataSyncErrorScope, error: unknown) => {
        const now = Date.now();
        const id = `${now}-${counterRef.current++}`;
        const message = describe(error);
        setErrors((prev) => {
            // Drop expired entries and same-scope duplicates so the banner stays sane.
            const kept = prev.filter((e) => now - e.at < TTL_MS && e.scope !== scope);
            const next = [...kept, { id, scope, message, at: now }];
            return next.length > MAX_ERRORS ? next.slice(-MAX_ERRORS) : next;
        });
    }, []);

    const clearScope = useCallback((scope: DataSyncErrorScope) => {
        setErrors((prev) => prev.filter((e) => e.scope !== scope));
    }, []);

    const clearAll = useCallback(() => {
        setErrors([]);
    }, []);

    const value = useMemo<DataSyncContextType>(
        () => ({ errors, recordError, clearScope, clearAll }),
        [errors, recordError, clearScope, clearAll]
    );

    return <DataSyncContext.Provider value={value}>{children}</DataSyncContext.Provider>;
}

export function useDataSync(): DataSyncContextType {
    const ctx = useContext(DataSyncContext);
    if (!ctx) {
        // Soft fallback: services that call recordError shouldn't crash if the
        // provider isn't mounted (e.g. unit tests). Return a no-op stub.
        return {
            errors: [],
            recordError: () => {},
            clearScope: () => {},
            clearAll: () => {},
        };
    }
    return ctx;
}
