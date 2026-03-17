import type { ExperienceVariant } from './supabase';

export const FORCE_BEHAVIOR_V1 = process.env.EXPO_PUBLIC_FORCE_BEHAVIOR_V1 === '1';
export const SKIP_FRAMEWORK_RESET_GATE = process.env.EXPO_PUBLIC_SKIP_FRAMEWORK_RESET_GATE === '1';

export function isBehaviorV1Experience(
    experienceVariant: ExperienceVariant | null | undefined
): boolean {
    return FORCE_BEHAVIOR_V1 || experienceVariant === 'behavior_v1';
}
