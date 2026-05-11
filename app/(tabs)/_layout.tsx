import { PAYWALL_ENABLED } from '@/app/index';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { isBehaviorV1Experience } from '@/lib/experience';
import { Redirect } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

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
        <NativeTabs backgroundColor="transparent" blurEffect="none" shadowColor="transparent">
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
