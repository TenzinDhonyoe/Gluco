import { useAddMenu } from '@/context/AddMenuContext';
import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';

export default function AddScreen() {
    const navigation = useNavigation();
    const { toggle } = useAddMenu();

    useEffect(() => {
        const unsubscribe = navigation.addListener('tabPress' as any, (e: any) => {
            e.preventDefault();
            toggle();
        });
        return unsubscribe;
    }, [navigation, toggle]);

    return null;
}
