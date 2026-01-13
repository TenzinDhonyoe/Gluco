import { getUserProfile, GlucoseUnit, supabase, UserProfile } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

// Default glucose unit when user hasn't set a preference
const DEFAULT_GLUCOSE_UNIT: GlucoseUnit = 'mmol/L';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: UserProfile | null;
    loading: boolean;
    signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signInWithApple: () => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSession(session);
                setUser(session.user);
                loadProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (__DEV__) console.log('Auth state changed:', event);

                if (event === 'TOKEN_REFRESHED') {
                    // Just update session, no need to reload profile
                    setSession(session);
                    setUser(session?.user ?? null);
                    return;
                }

                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user) {
                    // Only reload profile if we don't have it or if it's a SIGN_IN event
                    if (!profile || event === 'SIGNED_IN') {
                        await loadProfile(session.user.id);
                    }
                } else {
                    setProfile(null);
                    setLoading(false);
                }
            }
        );

        // Listen for AppState changes to refresh session when returning to app
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                if (__DEV__) console.log('App came to foreground, checking session...');
                supabase.auth.getSession().then(({ data: { session }, error }) => {
                    if (error) {
                        console.error('Error refreshing session:', error);
                    }
                    if (session) {
                        // Session is valid, ensure local state matches
                        if (!user) {
                            setUser(session.user);
                            setSession(session);
                            loadProfile(session.user.id);
                        }
                    }
                });
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.unsubscribe();
            appStateSubscription.remove();
        };
    }, []);

    const loadProfile = async (userId: string) => {
        try {
            const userProfile = await getUserProfile(userId);
            setProfile(userProfile);
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const refreshProfile = async () => {
        if (user) {
            await loadProfile(user.id);
        }
    };

    const signUp = async (email: string, password: string): Promise<{ error: Error | null }> => {
        try {
            setLoading(true);
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                return { error };
            }

            // Profile will be created automatically by database trigger
            // when the user confirms their email

            return { error: null };
        } catch (error) {
            return { error: error as Error };
        } finally {
            setLoading(false);
        }
    };

    const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
        try {
            setLoading(true);
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                return { error };
            }

            // Load the user's profile immediately after sign in
            if (data.user) {
                await loadProfile(data.user.id);
            }

            return { error: null };
        } catch (error) {
            return { error: error as Error };
        } finally {
            setLoading(false);
        }
    };

    const signInWithApple = async (): Promise<{ error: Error | null }> => {
        // Only available on iOS
        if (Platform.OS !== 'ios') {
            return { error: new Error('Apple Sign-In is only available on iOS') };
        }

        try {
            setLoading(true);

            // Request Apple authentication
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            // Check if we got the identity token
            if (!credential.identityToken) {
                return { error: new Error('No identity token received from Apple') };
            }

            // Sign in with Supabase using the Apple identity token
            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'apple',
                token: credential.identityToken,
            });

            if (error) {
                return { error };
            }

            // Load the user's profile
            if (data.user) {
                await loadProfile(data.user.id);
            }

            return { error: null };
        } catch (error: any) {
            // Handle user cancellation
            if (error.code === 'ERR_REQUEST_CANCELED') {
                return { error: null }; // User cancelled, not an error
            }
            console.error('Apple Sign-In error:', error);
            return { error: error as Error };
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        try {
            setLoading(true);
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            setProfile(null);
        } catch (error) {
            console.error('Error signing out:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'glucofigma://reset-password',
            });

            if (error) {
                return { error };
            }

            return { error: null };
        } catch (error) {
            return { error: error as Error };
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                profile,
                loading,
                signUp,
                signIn,
                signInWithApple,
                signOut,
                refreshProfile,
                resetPassword,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

/**
 * Hook to get the user's preferred glucose unit
 * Returns mmol/L as the safe default if profile is not loaded or unit not set
 */
export function useGlucoseUnit(): GlucoseUnit {
    const { profile } = useAuth();
    return profile?.glucose_unit ?? DEFAULT_GLUCOSE_UNIT;
}
