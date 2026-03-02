import { ChatBlockRenderer } from '@/components/chat/ChatBlockRenderer';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useChat, type ChatMessage, type SuggestedPrompt } from '@/hooks/useChat';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    FadeInDown,
    FadeInUp,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    withDelay,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GLUCO_AVATAR = require('@/assets/images/mascots/gluco_app_mascott/gluco_splash.png');

// ============================================
// Typing Indicator
// ============================================

function TypingDot({ delay }: { delay: number }) {
    const translateY = useSharedValue(0);

    useEffect(() => {
        translateY.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(-6, { duration: 300 }),
                    withTiming(0, { duration: 300 })
                ),
                -1,
                false
            )
        );
    }, [delay, translateY]);

    const style = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return <Animated.View style={[styles.dot, style]} />;
}

function TypingIndicator() {
    return (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.typingRow}>
            <View style={styles.avatarContainer}>
                <Image source={GLUCO_AVATAR} style={styles.avatar} />
            </View>
            <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
                <TypingDot delay={0} />
                <TypingDot delay={150} />
                <TypingDot delay={300} />
            </View>
        </Animated.View>
    );
}

// ============================================
// Message Bubble
// ============================================

function MessageBubble({
    message,
    onRetry,
}: {
    message: ChatMessage;
    onRetry?: (id: string) => void;
}) {
    const isUser = message.role === 'user';
    const isError = message.status === 'error';
    const hasBlocks = !isUser && message.blocks && message.blocks.length > 0;

    return (
        <Animated.View
            entering={FadeInDown.duration(250).springify().damping(18)}
            style={[styles.messageRow, isUser ? styles.messageRowRight : styles.messageRowLeft]}
        >
            {!isUser && (
                <View style={styles.avatarContainer}>
                    <Image source={GLUCO_AVATAR} style={styles.avatar} />
                </View>
            )}
            <View style={hasBlocks ? styles.bubbleWithBlocks : undefined}>
                <View
                    style={[
                        styles.bubble,
                        isUser ? styles.userBubble : styles.aiBubble,
                        isError && styles.errorBubble,
                    ]}
                >
                    <Text
                        style={[
                            styles.bubbleText,
                            isUser ? styles.userBubbleText : styles.aiBubbleText,
                        ]}
                    >
                        {message.content}
                    </Text>
                    {isError && (
                        <Pressable onPress={() => onRetry?.(message.id)}>
                            <Text style={styles.errorHint}>Tap to retry</Text>
                        </Pressable>
                    )}
                </View>
                {hasBlocks && <ChatBlockRenderer blocks={message.blocks} />}
            </View>
        </Animated.View>
    );
}

// ============================================
// Suggested Chips
// ============================================

function SuggestedChips({
    prompts,
    onSelect,
}: {
    prompts: SuggestedPrompt[];
    onSelect: (msg: string) => void;
}) {
    if (prompts.length === 0) return null;

    return (
        <View>
            <Animated.Text entering={FadeInUp.duration(250).delay(100)} style={styles.chipsTitle}>
                Try asking
            </Animated.Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContainer}
            >
                {prompts.map((prompt, index) => (
                    <Animated.View
                        key={prompt.label}
                        entering={FadeInUp.delay(index * 60 + 150).duration(250).springify().damping(16)}
                    >
                        <Pressable
                            style={({ pressed }) => [
                                styles.chip,
                                pressed && styles.chipPressed,
                            ]}
                            onPress={() => {
                                triggerHaptic('light');
                                onSelect(prompt.message);
                            }}
                        >
                            <Ionicons
                                name={prompt.icon as any}
                                size={16}
                                color={Colors.primary}
                            />
                            <Text style={styles.chipText}>{prompt.label}</Text>
                        </Pressable>
                    </Animated.View>
                ))}
            </ScrollView>
        </View>
    );
}

// ============================================
// Chat Input
// ============================================

function ChatInput({
    onSend,
    disabled,
}: {
    onSend: (text: string) => void;
    disabled: boolean;
}) {
    const [text, setText] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    // Send button animation
    const sendProgress = useSharedValue(0);

    useEffect(() => {
        sendProgress.value = withTiming(text.trim().length > 0 ? 1 : 0, {
            duration: 180,
        });
    }, [text, sendProgress]);

    const sendButtonStyle = useAnimatedStyle(() => ({
        transform: [{ scale: sendProgress.value }],
        opacity: sendProgress.value,
        width: sendProgress.value * 36,
        marginLeft: sendProgress.value * 8,
    }));

    // Input focus animation
    const focusBorder = useSharedValue(0);

    useEffect(() => {
        focusBorder.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
    }, [isFocused, focusBorder]);

    const inputFieldStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            focusBorder.value,
            [0, 1],
            ['transparent', 'rgba(45, 212, 191, 0.4)']
        ),
        backgroundColor: interpolateColor(
            focusBorder.value,
            [0, 1],
            ['rgba(120, 120, 128, 0.12)', 'rgba(255, 255, 255, 0.95)']
        ),
    }));

    const handleSend = useCallback(() => {
        if (!text.trim() || disabled) return;
        triggerHaptic('light');
        onSend(text);
        setText('');
    }, [text, disabled, onSend]);

    return (
        <View style={styles.inputRow}>
            <Animated.View style={[styles.inputFieldWrapper, inputFieldStyle]}>
                <TextInput
                    style={styles.textInput}
                    placeholder="Ask me anything..."
                    placeholderTextColor={Colors.textPlaceholder}
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={500}
                    editable={!disabled}
                    onSubmitEditing={handleSend}
                    blurOnSubmit={false}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                />
            </Animated.View>
            <Animated.View style={[styles.sendButton, sendButtonStyle]}>
                <Pressable
                    onPress={handleSend}
                    disabled={!text.trim() || disabled}
                    style={styles.sendCircle}
                >
                    <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                </Pressable>
            </Animated.View>
        </View>
    );
}

// ============================================
// AI Disabled State
// ============================================

function AiDisabledView() {
    return (
        <View style={styles.disabledContainer}>
            <View style={styles.disabledIconCircle}>
                <Ionicons name="sparkles-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.disabledTitle}>AI Chat is Off</Text>
            <Text style={styles.disabledText}>
                Enable AI features to get personalized wellness tips and have conversations
                about your health patterns.
            </Text>
            <Pressable
                style={styles.enableButton}
                onPress={() => router.push('/account-privacy')}
            >
                <Text style={styles.enableButtonText}>Enable in Settings</Text>
            </Pressable>
        </View>
    );
}

// ============================================
// Main Screen
// ============================================

export default function ChatScreen() {
    const insets = useSafeAreaInsets();
    const { user, profile } = useAuth();
    const aiEnabled = profile?.ai_enabled ?? false;
    const flatListRef = useRef<FlatList>(null);

    const { messages, isTyping, isLoading, error, sendMessage, retryMessage, clearChat, suggestedPrompts } =
        useChat(user?.id, aiEnabled, profile?.first_name ?? null);

    // Scroll to bottom when new messages arrive or typing starts
    useEffect(() => {
        if (messages.length > 1 || isTyping) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages.length, isTyping]);

    const renderMessage = useCallback(
        ({ item }: { item: ChatMessage }) => (
            <MessageBubble message={item} onRetry={retryMessage} />
        ),
        [retryMessage]
    );

    const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

    const hasMessages = messages.length > 1;

    return (
        <View
            style={[styles.container, { paddingTop: insets.top }]}
        >
            {/* Teal gradient background */}
            <LinearGradient
                colors={[
                    'rgba(45, 212, 191, 0.18)',
                    'rgba(45, 212, 191, 0.06)',
                    'rgba(45, 212, 191, 0)',
                ]}
                locations={[0, 0.4, 0.75]}
                style={StyleSheet.absoluteFill}
            />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <Text style={styles.headerTitle}>GLUCOAI</Text>
                    <View style={styles.betaPill}>
                        <Text style={styles.betaPillText}>BETA</Text>
                    </View>
                </View>
                {hasMessages && (
                    <Pressable onPress={clearChat} style={styles.clearButton}>
                        <Ionicons name="refresh-outline" size={20} color={Colors.textSecondary} />
                        <Text style={styles.clearText}>New chat</Text>
                    </Pressable>
                )}
            </View>

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={insets.top + 60}
            >
                {/* Messages */}
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={Colors.primary} />
                        <Text style={styles.loadingText}>Loading conversation...</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={[
                            styles.messageList,
                            !hasMessages && styles.messageListCentered,
                        ]}
                        keyboardDismissMode="interactive"
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        ListFooterComponent={
                            <>
                                {isTyping && <TypingIndicator />}
                                {error && (
                                    <Text style={styles.errorText}>{error}</Text>
                                )}
                            </>
                        }
                    />
                )}

                {/* Suggested chips */}
                {suggestedPrompts.length > 0 && (
                    <SuggestedChips prompts={suggestedPrompts} onSelect={sendMessage} />
                )}

                {/* AI Disabled state or Input */}
                {!aiEnabled ? (
                    <AiDisabledView />
                ) : (
                    <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) + 60 }]}>
                        <ChatInput onSend={sendMessage} disabled={isTyping} />
                    </View>
                )}
            </KeyboardAvoidingView>
        </View>
    );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    flex: {
        flex: 1,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 1,
    },
    betaPill: {
        backgroundColor: 'rgba(45, 212, 191, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.30)',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    betaPillText: {
        fontFamily: fonts.semiBold,
        fontSize: 11,
        color: Colors.primary,
        letterSpacing: 0.5,
    },
    clearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: Colors.borderCard,
    },
    clearText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textSecondary,
    },

    // Message List
    messageList: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
    },
    messageListCentered: {
        flexGrow: 1,
        justifyContent: 'flex-end',
    },

    // Message Row
    messageRow: {
        flexDirection: 'row',
        marginVertical: 6,
        maxWidth: '88%',
    },
    messageRowLeft: {
        alignSelf: 'flex-start',
    },
    messageRowRight: {
        alignSelf: 'flex-end',
    },

    // Avatar
    avatarContainer: {
        width: 30,
        height: 30,
        borderRadius: 15,
        overflow: 'hidden',
        marginRight: 8,
        marginTop: 4,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: Colors.borderCard,
    },
    avatar: {
        width: 30,
        height: 30,
        resizeMode: 'contain',
    },

    // Bubbles
    bubbleWithBlocks: {
        flexShrink: 1,
        maxWidth: '100%',
    },
    bubble: {
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        maxWidth: '100%',
        flexShrink: 1,
    },
    userBubble: {
        backgroundColor: 'rgba(45, 212, 191, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.30)',
        borderTopRightRadius: 6,
    },
    aiBubble: {
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        borderTopLeftRadius: 6,
    },
    errorBubble: {
        borderColor: Colors.error,
        opacity: 0.7,
    },
    bubbleText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        lineHeight: 22,
    },
    userBubbleText: {
        color: Colors.textPrimary,
    },
    aiBubbleText: {
        color: Colors.textPrimary,
    },
    errorHint: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.error,
        marginTop: 4,
    },
    errorText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.error,
        textAlign: 'center',
        marginVertical: 8,
        paddingHorizontal: 20,
    },

    // Typing Indicator
    typingRow: {
        flexDirection: 'row',
        alignSelf: 'flex-start',
        marginVertical: 4,
    },
    typingBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 18,
        paddingVertical: 14,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: Colors.textTertiary,
    },

    // Suggested Chips
    chipsTitle: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textSecondary,
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    chipsContainer: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.20)',
    },
    chipPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.95 }],
    },
    chipText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },

    // Input
    inputContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    inputFieldWrapper: {
        flex: 1,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: 'transparent',
        backgroundColor: Colors.inputBackground,
    },
    textInput: {
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 12,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
        maxHeight: 120,
        minHeight: 44,
    },
    sendButton: {
        marginBottom: 4,
        overflow: 'hidden',
    },
    sendCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // AI Disabled
    disabledContainer: {
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingBottom: 40,
    },
    disabledIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    disabledTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    disabledText: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    enableButton: {
        backgroundColor: Colors.buttonAction,
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 14,
    },
    enableButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.buttonActionText,
    },

    // Loading
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
    },
});
