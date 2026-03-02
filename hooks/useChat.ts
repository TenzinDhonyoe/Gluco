// hooks/useChat.ts
// Manages chat state for the AI wellness chat feature.
// Persists messages to Supabase (chat_sessions + chat_messages) with
// graceful fallback to in-memory only if tables don't exist yet.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    sendChatMessage,
    getActiveChatSession,
    createChatSession,
    getChatMessages,
    saveChatMessage,
    updateChatMessageStatus,
    archiveChatSession,
    type ChatSession,
    type ChatMessageRow,
    type ChatBlock,
    type ChatBlockType,
} from '@/lib/supabase';
import {
    fetchChatBlockContext,
    attachBlocksClient,
    type ChatBlockContext,
} from '@/lib/chatBlocks';

// ============================================
// Types
// ============================================

export type ChatRole = 'user' | 'assistant';
export type { ChatBlock, ChatBlockType };

export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    timestamp: number;
    status: 'sending' | 'sent' | 'error';
    blocks?: ChatBlock[];
}

export interface SuggestedPrompt {
    label: string;
    message: string;
    icon: string;
}

// ============================================
// Suggested Prompts
// ============================================

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
    {
        label: 'What should I eat?',
        message: 'Based on my recent meals and patterns, what would be a good meal choice for me today?',
        icon: 'restaurant-outline',
    },
    {
        label: 'How am I doing?',
        message: 'Give me a summary of how my wellness patterns have been this week.',
        icon: 'trending-up-outline',
    },
    {
        label: 'Quick walk benefit?',
        message: 'How would a post-meal walk help me based on my current patterns?',
        icon: 'walk-outline',
    },
    {
        label: 'Improve my sleep',
        message: 'What does my data suggest I could try to improve my sleep quality?',
        icon: 'moon-outline',
    },
    {
        label: 'My fiber intake',
        message: 'How is my fiber intake looking and what are some easy ways to add more?',
        icon: 'leaf-outline',
    },
    {
        label: 'Boost my energy',
        message: 'I have been feeling tired lately. Based on my data, what might be contributing to that?',
        icon: 'battery-half-outline',
    },
];

// ============================================
// Helpers
// ============================================

let idCounter = 0;
function generateId(): string {
    idCounter += 1;
    return `msg_${Date.now()}_${idCounter}`;
}

function makeWelcomeMessage(firstName: string | null, aiEnabled: boolean): ChatMessage {
    const name = firstName ? `, ${firstName}` : '';
    const content = aiEnabled
        ? `Hey${name}! I'm your wellness companion. I know your patterns, meals, activity, and more — ask me anything about your health journey and I'll give you personalized tips.`
        : "Hi there! AI chat is currently turned off. Enable AI features in Settings to get personalized wellness tips and chat about your health patterns.";
    return {
        id: 'welcome',
        role: 'assistant',
        content,
        timestamp: Date.now(),
        status: 'sent',
    };
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
    const msg: ChatMessage = {
        id: row.id,
        role: row.role as ChatRole,
        content: row.content,
        timestamp: new Date(row.created_at).getTime(),
        status: row.status as ChatMessage['status'],
    };
    if (row.blocks && row.blocks.length > 0) {
        msg.blocks = row.blocks;
    }
    return msg;
}

// ============================================
// Hook
// ============================================

export function useChat(
    userId: string | undefined,
    aiEnabled: boolean,
    firstName: string | null
) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const messagesRef = useRef<ChatMessage[]>(messages);
    const [session, setSession] = useState<ChatSession | null>(null);
    const sessionRef = useRef<ChatSession | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const initialized = useRef(false);

    // Cached block context with 60s TTL
    const blockCtxCache = useRef<{ ctx: ChatBlockContext; ts: number } | null>(null);
    const BLOCK_CTX_TTL = 60_000;

    async function getOrRefreshBlockContext(uid: string): Promise<ChatBlockContext> {
        const cached = blockCtxCache.current;
        if (cached && Date.now() - cached.ts < BLOCK_CTX_TTL) {
            return cached.ctx;
        }
        const ctx = await fetchChatBlockContext(uid);
        blockCtxCache.current = { ctx, ts: Date.now() };
        return ctx;
    }

    // Keep refs in sync with state
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    // Load existing session or show welcome message
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        if (!userId || !aiEnabled) {
            setMessages([makeWelcomeMessage(firstName, aiEnabled)]);
            setIsLoading(false);
            return;
        }

        async function loadSession() {
            setIsLoading(true);
            try {
                const existingSession = await getActiveChatSession(userId!);

                if (existingSession) {
                    const rows = await getChatMessages(existingSession.id, 50);
                    const loaded = rows.map(rowToMessage);

                    setSession(existingSession);
                    setMessages([
                        makeWelcomeMessage(firstName, true),
                        ...loaded,
                    ]);
                } else {
                    setMessages([makeWelcomeMessage(firstName, true)]);
                }
            } catch {
                // Fallback: in-memory only, still usable
                setMessages([makeWelcomeMessage(firstName, true)]);
            } finally {
                setIsLoading(false);
            }
        }

        loadSession();
    }, [userId, aiEnabled, firstName]);

    const sendMessage = useCallback(
        async (text: string) => {
            if (!userId || !text.trim() || !aiEnabled) return;

            const trimmed = text.trim();

            // Ensure a session exists (create on first message)
            let currentSession = sessionRef.current;
            if (!currentSession) {
                currentSession = await createChatSession(userId);
                if (currentSession) {
                    setSession(currentSession);
                }
            }

            // Add user message optimistically
            const userMsg: ChatMessage = {
                id: generateId(),
                role: 'user',
                content: trimmed,
                timestamp: Date.now(),
                status: 'sent',
            };
            setMessages(prev => [...prev, userMsg]);
            setIsTyping(true);
            setError(null);

            // Persist user message to DB
            let savedUserMsgId: string | null = null;
            if (currentSession) {
                const saved = await saveChatMessage(
                    currentSession.id,
                    userId,
                    'user',
                    trimmed
                );
                savedUserMsgId = saved?.id ?? null;
            }

            // Build conversation history (last 20 turns, excluding welcome and errors)
            const relevant = messagesRef.current.filter(
                m => m.id !== 'welcome' && m.status !== 'error'
            );
            const history: Array<{ role: 'user' | 'model'; content: string }> = relevant
                .slice(-19)
                .map(m => ({
                    role: m.role === 'user' ? ('user' as const) : ('model' as const),
                    content: m.content,
                }));
            // Add current message
            history.push({ role: 'user', content: trimmed });

            try {
                const response = await sendChatMessage({
                    user_id: userId,
                    message: trimmed,
                    conversation_history: history,
                    local_hour: new Date().getHours(),
                    session_id: currentSession?.id,
                });

                if (response?.reply) {
                    const aiMsg: ChatMessage = {
                        id: generateId(),
                        role: 'assistant',
                        content: response.reply,
                        timestamp: Date.now(),
                        status: 'sent',
                    };

                    // Attach blocks: server-returned blocks take priority,
                    // fall back to client-side keyword matching
                    if (response.blocks && response.blocks.length > 0) {
                        aiMsg.blocks = response.blocks;
                    } else {
                        try {
                            const ctx = await getOrRefreshBlockContext(userId);
                            const clientBlocks = attachBlocksClient(response.reply, ctx);
                            if (clientBlocks.length > 0) {
                                aiMsg.blocks = clientBlocks;
                            }
                        } catch {
                            // Blocks are non-critical — never break chat
                        }
                    }

                    setMessages(prev => [...prev, aiMsg]);

                    // Persist AI response to DB
                    if (currentSession) {
                        saveChatMessage(
                            currentSession.id,
                            userId,
                            'assistant',
                            response.reply,
                            'sent',
                            aiMsg.blocks
                        );
                    }
                } else {
                    throw new Error('No response');
                }
            } catch {
                setError('Could not get a response. Please try again.');
                setMessages(prev =>
                    prev.map(m =>
                        m.id === userMsg.id ? { ...m, status: 'error' as const } : m
                    )
                );
                // Update status in DB
                if (savedUserMsgId) {
                    updateChatMessageStatus(savedUserMsgId, 'error');
                }
            } finally {
                setIsTyping(false);
            }
        },
        [userId, aiEnabled]
    );

    const retryMessage = useCallback(
        async (messageId: string) => {
            const failedMsg = messagesRef.current.find(
                m => m.id === messageId && m.status === 'error' && m.role === 'user'
            );
            if (!failedMsg) return;

            // Remove the failed message from state, then re-send
            setMessages(prev => prev.filter(m => m.id !== messageId));
            await sendMessage(failedMsg.content);
        },
        [sendMessage]
    );

    const clearChat = useCallback(async () => {
        // Archive current session
        const currentSession = sessionRef.current;
        if (currentSession) {
            await archiveChatSession(currentSession.id);
        }
        setSession(null);
        setMessages([makeWelcomeMessage(firstName, aiEnabled)]);
        setError(null);
        setIsTyping(false);
    }, [aiEnabled, firstName]);

    // Only show suggested prompts when conversation has just the welcome message
    const showSuggestions = messages.length === 1 && messages[0].id === 'welcome' && aiEnabled;

    return {
        messages,
        isTyping,
        isLoading,
        error,
        sendMessage,
        retryMessage,
        clearChat,
        suggestedPrompts: showSuggestions ? SUGGESTED_PROMPTS : [],
    };
}
