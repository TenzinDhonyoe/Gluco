import { PAYWALL_ENABLED } from '@/app/index';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { isBehaviorV1Experience } from '@/lib/experience';
import { Redirect } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

// iOS 26+ paints the tab bar with Liquid Glass natively, so we keep it fully
// transparent. On older iOS the same props produce a bar with no background at
// all (tabs floating over content), so we render a frosted material with a tint
// matching ForestGlassBackground for a Liquid-Glass-like fallback.
const isIOS26Plus =
    Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

const tabBarProps = isIOS26Plus
    ? {
        backgroundColor: 'transparent',
        blurEffect: 'none' as const,
        shadowColor: 'transparent',
    }
    : {
        backgroundColor: 'rgba(242, 242, 247, 0.80)',
        blurEffect: 'systemThinMaterial' as const,
        shadowColor: 'rgba(0, 0, 0, 0.08)',
    };

export default function TabLayout() {
    const { user, profile, loading } = useAuth();
    const { isProUser, loading: subLoading } = useSubscription();
    const isBehaviorV1 = isBehaviorV1Experience(profile?.experience_variant);

    // Redirect to welcome screen if user signed out
    if (!loading && !user) {
        return <Redirect href="/" />;
    }

    // Hard paywall gate — no path into the tabs without an active subscription.
    // Guards against swipe-back/re-entry from any auth or paywall screen.
    if (
        PAYWALL_ENABLED &&
        !loading &&
        !subLoading &&
        user &&
        profile?.onboarding_completed &&
        !isProUser
    ) {
        return <Redirect href="/paywall" />;
    }

    return (
        <NativeTabs {...tabBarProps}>
            <NativeTabs.Trigger name="index">
                <Icon sf={{ default: 'house', selected: 'house.fill' }} />
                <Label>Home</Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="log">
                <Icon sf={{ default: 'book', selected: 'book.fill' }} />
                <Label>Log</Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="insights">
                <Icon
                    sf={
                        isBehaviorV1
                            ? { default: 'target', selected: 'target' }
                            : { default: 'chart.bar', selected: 'chart.bar.fill' }
                    }
                />
                <Label>{isBehaviorV1 ? 'Actions' : 'Insights'}</Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
