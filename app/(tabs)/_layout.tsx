import { useAuth } from '@/context/AuthContext';
import { isBehaviorV1Experience } from '@/lib/experience';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
    const { profile } = useAuth();
    const isBehaviorV1 = isBehaviorV1Experience(profile?.experience_variant);

    return (
        <NativeTabs backgroundColor="transparent">
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
            <NativeTabs.Trigger name="chat">
                <Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />
                <Label>Chat</Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
