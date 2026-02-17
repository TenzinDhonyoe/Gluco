import { useAddMenu } from '@/context/AddMenuContext';
import { useAuth } from '@/context/AuthContext';
import { isBehaviorV1Experience } from '@/lib/experience';
import { setTabBarRightInset } from '@/modules/tab-bar-insets';
import { useEffect } from 'react';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

// Right inset to push the Liquid Glass pill left, making room for the FAB.
const TAB_BAR_RIGHT_INSET = 62;

export default function TabLayout() {
    const { profile } = useAuth();
    const { setIsOnTabScreen } = useAddMenu();
    const isBehaviorV1 = isBehaviorV1Experience(profile?.experience_variant);

    useEffect(() => {
        setIsOnTabScreen(true);
        return () => setIsOnTabScreen(false);
    }, [setIsOnTabScreen]);

    // After the native tab bar mounts, push its safe area right inset
    // so the compact Liquid Glass pill shifts left.
    useEffect(() => {
        const timer = setTimeout(() => {
            setTabBarRightInset(TAB_BAR_RIGHT_INSET).catch(() => {});
        }, 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <NativeTabs>
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
