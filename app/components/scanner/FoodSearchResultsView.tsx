import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { CONFIG, searchWithProgressiveResults, shouldTriggerSearch } from '@/lib/foodSearch';
import {
    addFavoriteFood,
    addRecentFood,
    getFavoriteFoods,
    getRecentFoods,
    NormalizedFood,
    removeFavoriteFood,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'all' | 'recents' | 'favorites';

// Selected item with quantity and source tracking
export interface SelectedItem extends NormalizedFood {
    quantity: number;
    source?: 'matched' | 'manual';
}

interface FoodSearchResultsViewProps {
    onClose: () => void;
    onSave: (items: SelectedItem[]) => void;
    onScanBarcode: () => void;
    initialSelectedItems?: SelectedItem[];
    onCartModalChange?: (isOpen: boolean) => void;
}

export default function FoodSearchResultsView({
    onClose,
    onSave,
    onScanBarcode,
    initialSelectedItems = [],
    onCartModalChange,
}: FoodSearchResultsViewProps) {
    const { user, profile } = useAuth();
    const insets = useSafeAreaInsets();

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<Tab>('all');
    const [results, setResults] = useState<NormalizedFood[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>(initialSelectedItems);
    const [showCartModal, setShowCartModal] = useState(false);

    // Search state
    const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Favorites and Recents state
    const [favorites, setFavorites] = useState<NormalizedFood[]>([]);
    const [recents, setRecents] = useState<NormalizedFood[]>([]);
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const [isLoadingTab, setIsLoadingTab] = useState(false);

    // Manual entry modal state

    // Notify parent when cart modal state changes
    useEffect(() => {
        onCartModalChange?.(showCartModal);
    }, [showCartModal, onCartModalChange]);

    // Load favorites list when component mounts or tab changes
    const loadFavorites = useCallback(async () => {
        if (!user) return;
        setIsLoadingTab(true);
        try {
            const favs = await getFavoriteFoods(user.id);
            setFavorites(favs);
            // Build a set of favorite IDs for quick lookup
            const ids = new Set<string>(favs.map((f: NormalizedFood) => `${f.provider}-${f.external_id}`));
            setFavoriteIds(ids);
        } catch (error) {
            console.error('Failed to load favorites:', error);
        } finally {
            setIsLoadingTab(false);
        }
    }, [user]);

    // Load recents when tab changes
    const loadRecents = useCallback(async () => {
        if (!user) return;
        setIsLoadingTab(true);
        try {
            const recentFoods = await getRecentFoods(user.id, 30);
            setRecents(recentFoods);
        } catch (error) {
            console.error('Failed to load recents:', error);
        } finally {
            setIsLoadingTab(false);
        }
    }, [user]);

    // Load data when tab changes
    useEffect(() => {
        if (activeTab === 'favorites') {
            loadFavorites();
        } else if (activeTab === 'recents') {
            loadRecents();
        }
    }, [activeTab, loadFavorites, loadRecents]);

    // Also load favorites on mount for icon state
    useEffect(() => {
        loadFavorites();
    }, [loadFavorites]);

    // Check if food is favorited
    const isFavorited = (food: NormalizedFood) => {
        return favoriteIds.has(`${food.provider}-${food.external_id}`);
    };

    // Toggle favorite
    const toggleFavorite = async (food: NormalizedFood) => {
        if (!user) return;
        const key = `${food.provider}-${food.external_id}`;

        if (favoriteIds.has(key)) {
            // Remove from favorites
            const success = await removeFavoriteFood(user.id, food.provider, food.external_id);
            if (success) {
                setFavoriteIds(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                setFavorites(prev => prev.filter(f => `${f.provider}-${f.external_id}` !== key));
            }
        } else {
            // Add to favorites
            await addFavoriteFood(user.id, food);
            setFavoriteIds(prev => new Set(prev).add(key));
            setFavorites(prev => [food, ...prev]);
        }
    };

    // Debounced search with progressive results
    const lastQueryRef = useRef<string | null>(null);

    useEffect(() => {
        // Clear corrected query when input changes
        setCorrectedQuery(null);

        // Early return for short queries
        if (searchQuery.trim().length < 2) {
            setResults([]);
            lastQueryRef.current = null;
            return;
        }

        // Check if this is a meaningful change worth searching
        if (!shouldTriggerSearch(searchQuery, lastQueryRef.current)) {
            return;
        }

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const timer = setTimeout(async () => {
            setIsSearching(true);
            lastQueryRef.current = searchQuery;

            try {
                // Use progressive search with callback for faster perceived performance
                await searchWithProgressiveResults(searchQuery, {
                    signal: controller.signal,
                    aiEnabled: profile?.ai_enabled ?? false,
                    onPartialResults: (searchResult, meta) => {
                        // Only update if not aborted and not stale
                        if (!controller.signal.aborted) {
                            setResults(searchResult.results);
                            setCorrectedQuery(searchResult.correctedQuery);

                            // Only hide loading indicator when complete
                            if (meta.isComplete) {
                                setIsSearching(false);
                            }
                        }
                    },
                });
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error('Search failed:', error);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearching(false);
                }
            }
        }, CONFIG.DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [searchQuery, profile?.ai_enabled]);

    const isSelected = (food: NormalizedFood) => {
        return selectedItems.some(
            item => item.provider === food.provider && item.external_id === food.external_id
        );
    };

    const toggleSelect = async (food: NormalizedFood) => {
        if (isSelected(food)) {
            setSelectedItems(prev =>
                prev.filter(
                    item => !(item.provider === food.provider && item.external_id === food.external_id)
                )
            );
        } else {
            setSelectedItems(prev => [...prev, { ...food, quantity: 1 }]);
            // Don't auto-show modal, just update badge

            // Also add to recents when selecting
            if (user) {
                await addRecentFood(user.id, food);
            }
        }
    };

    const updateQuantity = (food: NormalizedFood, delta: number) => {
        setSelectedItems(prev =>
            prev.map(item => {
                if (item.provider === food.provider && item.external_id === food.external_id) {
                    const newQty = Math.max(1, item.quantity + delta);
                    return { ...item, quantity: newQty };
                }
                return item;
            })
        );
    };

    const handleSavePress = () => {
        if (selectedItems.length > 0) {
            onSave(selectedItems);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setResults([]);
    };



    const formatNutrientInfo = (food: NormalizedFood) => {
        const parts: string[] = [];
        if (food.calories_kcal !== null) parts.push(`${food.calories_kcal} kcal`);
        if (food.carbs_g !== null) parts.push(`${food.carbs_g}g carbs`);
        if (food.protein_g !== null) parts.push(`${food.protein_g}g protein`);
        if (food.fat_g !== null) parts.push(`${food.fat_g}g fat`);
        return parts.join(' • ') || 'Nutrition info not available';
    };

    const renderFoodItem = ({ item }: { item: NormalizedFood }) => {
        const selected = isSelected(item);
        const favorited = isFavorited(item);

        return (
            <TouchableOpacity
                style={styles.foodCard}
                onPress={() => toggleSelect(item)}
                activeOpacity={0.7}
            >
                <View style={styles.foodInfo}>
                    <Text style={styles.foodName}>{item.display_name}</Text>
                    {item.brand && <Text style={styles.foodBrand}>{item.brand}</Text>}
                    <Text style={styles.foodNutrients} numberOfLines={2}>
                        {formatNutrientInfo(item)}
                    </Text>
                </View>
                <View style={styles.foodActions}>
                    <TouchableOpacity
                        style={styles.heartButton}
                        onPress={(e) => {
                            e.stopPropagation?.();
                            toggleFavorite(item);
                        }}
                    >
                        <Ionicons
                            name={favorited ? 'heart' : 'heart-outline'}
                            size={22}
                            color={favorited ? '#FF6B6B' : '#878787'}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.checkButton, selected && styles.checkButtonSelected]}
                        onPress={() => toggleSelect(item)}
                    >
                        {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    const renderSelectedItem = ({ item }: { item: SelectedItem }) => (
        <View style={styles.selectedItemRow}>
            <View style={styles.selectedItemInfo}>
                <Text style={styles.selectedItemName}>{item.display_name}</Text>
                {item.brand && <Text style={styles.selectedItemBrand}>{item.brand}</Text>}
                <Text style={styles.selectedItemNutrients} numberOfLines={1}>
                    {formatNutrientInfo(item)}
                </Text>
            </View>
            <View style={styles.quantityControls}>
                <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => updateQuantity(item, -1)}
                >
                    <Ionicons name="remove" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.quantityText}>{item.quantity}</Text>
                <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => updateQuantity(item, 1)}
                >
                    <Ionicons name="add" size={22} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.backgroundGradient}
            />

            <View style={[styles.contentContainer, { paddingTop: insets.top }]}>
                {/* Header */}
                <View style={styles.header}>
                    <LiquidGlassIconButton size={44} onPress={onClose}>
                        <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
                    </LiquidGlassIconButton>
                    <View style={styles.headerSpacer} />
                    <View style={styles.headerSpacer} />

                    {/* Cart Button (replaces barcode button) */}
                    <TouchableOpacity
                        style={[styles.cartButton, selectedItems.length > 0 && styles.cartButtonActive]}
                        onPress={() => setShowCartModal(true)}
                        activeOpacity={0.7}
                        disabled={selectedItems.length === 0}
                    >
                        <Ionicons
                            name={selectedItems.length > 0 ? "basket" : "basket-outline"}
                            size={22}
                            color={selectedItems.length > 0 ? "#FFFFFF" : "#E7E8E9"}
                        />
                        {selectedItems.length > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{selectedItems.length}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Search Input */}
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#878787" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search Food"
                        placeholderTextColor="#878787"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {isSearching && (
                        <ActivityIndicator size="small" color="#4CAF50" style={{ marginRight: 8 }} />
                    )}
                    {searchQuery.length > 0 && !isSearching && (
                        <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                            <Ionicons name="close-circle" size={20} color="#878787" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Did you mean suggestion */}
                {correctedQuery && correctedQuery !== searchQuery.toLowerCase().trim() && (
                    <TouchableOpacity
                        style={styles.didYouMeanContainer}
                        onPress={() => setSearchQuery(correctedQuery)}
                    >
                        <Text style={styles.didYouMeanText}>
                            Did you mean: <Text style={styles.didYouMeanQuery}>{correctedQuery}</Text>?
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Tabs */}
                <View style={styles.tabsContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'all' && styles.tabActive]}
                        onPress={() => setActiveTab('all')}
                    >
                        <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
                            ALL
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'recents' && styles.tabActive]}
                        onPress={() => setActiveTab('recents')}
                    >
                        <Text style={[styles.tabText, activeTab === 'recents' && styles.tabTextActive]}>
                            RECENTS
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
                        onPress={() => setActiveTab('favorites')}
                    >
                        <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
                            FAVORITES
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Results */}
                <View style={styles.resultsContainer}>
                    {/* ALL Tab - Search Results */}
                    {activeTab === 'all' && (
                        <>
                            {results.length > 0 ? (
                                <FlatList
                                    data={results}
                                    keyExtractor={(item) => `${item.provider}-${item.external_id}`}
                                    renderItem={renderFoodItem}
                                    contentContainerStyle={styles.listContent}
                                    showsVerticalScrollIndicator={false}
                                />
                            ) : isSearching ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator color="#4CAF50" size="large" />
                                </View>
                            ) : searchQuery.length >= 2 ? (
                                <View style={styles.emptyContainer}>
                                    <Text style={styles.emptyText}>No foods found</Text>
                                    <Text style={styles.emptySubtext}>Try a different search term</Text>
                                </View>
                            ) : (
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="search" size={48} color="#3A3D40" />
                                    <Text style={styles.emptyText}>Search for foods</Text>
                                    <Text style={styles.emptySubtext}>Type at least 2 characters</Text>
                                </View>
                            )}
                        </>
                    )}

                    {/* RECENTS Tab */}
                    {activeTab === 'recents' && (
                        <>
                            {isLoadingTab ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator color="#4CAF50" size="large" />
                                </View>
                            ) : recents.length > 0 ? (
                                <FlatList
                                    data={recents}
                                    keyExtractor={(item) => `recent-${item.provider}-${item.external_id}`}
                                    renderItem={renderFoodItem}
                                    contentContainerStyle={styles.listContent}
                                    showsVerticalScrollIndicator={false}
                                />
                            ) : (
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="time-outline" size={48} color="#3A3D40" />
                                    <Text style={styles.emptyText}>No recent foods</Text>
                                    <Text style={styles.emptySubtext}>Foods you select will appear here</Text>
                                </View>
                            )}
                        </>
                    )}

                    {/* FAVORITES Tab */}
                    {activeTab === 'favorites' && (
                        <>
                            {isLoadingTab ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator color="#4CAF50" size="large" />
                                </View>
                            ) : favorites.length > 0 ? (
                                <FlatList
                                    data={favorites}
                                    keyExtractor={(item) => `fav-${item.provider}-${item.external_id}`}
                                    renderItem={renderFoodItem}
                                    contentContainerStyle={styles.listContent}
                                    showsVerticalScrollIndicator={false}
                                />
                            ) : (
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="heart-outline" size={48} color="#3A3D40" />
                                    <Text style={styles.emptyText}>No favorites yet</Text>
                                    <Text style={styles.emptySubtext}>Tap the heart to save foods</Text>
                                </View>
                            )}
                        </>
                    )}
                </View>

                {/* Cart Modal Overlay */}
                {showCartModal && (
                    <View style={styles.cartModalOverlay}>
                        <TouchableOpacity
                            style={styles.cartModalBackdrop}
                            activeOpacity={1}
                            onPress={() => setShowCartModal(false)}
                        />
                        <View style={styles.cartModalContent}>
                            <View style={styles.cartModalHeader}>
                                <Text style={styles.cartModalTitle}>Selected Foods ({selectedItems.length})</Text>
                                <TouchableOpacity onPress={() => setShowCartModal(false)}>
                                    <Ionicons name="close" size={24} color="#E7E8E9" />
                                </TouchableOpacity>
                            </View>

                            <FlatList
                                data={selectedItems}
                                keyExtractor={(item) => `${item.provider}-${item.external_id}`}
                                renderItem={renderSelectedItem}
                                style={styles.cartList}
                                contentContainerStyle={styles.cartListContent}
                                showsVerticalScrollIndicator={false}
                            />

                            <TouchableOpacity
                                style={styles.modalSaveButton}
                                onPress={handleSavePress}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.saveButtonText}>Analyze Meal</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>


        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    contentContainer: {
        flex: 1,
        paddingBottom: 80, // Space for option bar
    },
    backgroundGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 280,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerSpacer: {
        flex: 1,
    },
    barcodeButton: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 12,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 14,
        paddingHorizontal: 14,
        height: 52,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
    },
    clearButton: {
        padding: 4,
    },
    didYouMeanContainer: {
        marginHorizontal: 16,
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(52, 148, 217, 0.15)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(52, 148, 217, 0.3)',
    },
    didYouMeanText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#A0A0A0',
    },
    didYouMeanQuery: {
        fontFamily: fonts.semiBold,
        color: '#4CAF50',
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginTop: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#2A2D30',
    },
    tab: {
        paddingVertical: 12,
        paddingHorizontal: 4,
        marginRight: 24,
    },
    tabActive: {
        borderBottomWidth: 2,
        borderBottomColor: '#FFFFFF',
    },
    tabText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: '#878787',
        letterSpacing: 1,
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
    resultsContainer: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    emptyText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#878787',
        marginTop: 16,
    },
    emptySubtext: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#5A5D60',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 200,
    },
    foodCard: {
        flexDirection: 'row',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2A2D30',
    },
    foodInfo: {
        flex: 1,
        paddingRight: 12,
    },
    foodName: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 2,
    },
    foodBrand: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginBottom: 4,
    },
    foodNutrients: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        lineHeight: 18,
    },
    foodActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    heartButton: {
        padding: 4,
    },
    checkButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#878787',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkButtonSelected: {
        backgroundColor: '#4CAF50',
        borderColor: '#4CAF50',
    },
    // New Cart Styles
    cartButton: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    cartButtonActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.3)',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.5)',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#FF3B30',
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 1.5,
        borderColor: '#111111',
    },
    badgeText: {
        fontFamily: fonts.bold,
        fontSize: 10,
        color: '#FFFFFF',
    },
    cartModalOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1000,
        justifyContent: 'flex-end',
    },
    cartModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    cartModalContent: {
        backgroundColor: '#1A1D1F',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 16,
        paddingHorizontal: 20,
        paddingBottom: 40,
        maxHeight: '70%',
    },
    cartModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2A2D30',
    },
    cartModalTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
    },
    cartList: {
        maxHeight: 300,
    },
    cartListContent: {
        paddingBottom: 16,
    },
    modalSaveButton: {
        backgroundColor: '#285E2A',
        borderWidth: 1,
        borderColor: '#448D47',
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 16,
    },
    // End Cart Styles
    selectedItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#2A2D30',
    },
    selectedItemInfo: {
        flex: 1,
        paddingRight: 12,
    },
    selectedItemName: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    selectedItemBrand: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: '#878787',
    },
    selectedItemNutrients: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
    },
    quantityControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    quantityButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#2A2D30',
        justifyContent: 'center',
        alignItems: 'center',
    },
    quantityText: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
        minWidth: 32,
        textAlign: 'center',
    },
    saveButton: {
        backgroundColor: '#285E2A',
        borderWidth: 1,
        borderColor: '#448D47',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 16,
    },
    saveButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    // Manual Entry Button styles
    manualEntryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
        paddingVertical: 14,
        paddingHorizontal: 20,
        marginHorizontal: 16,
        marginBottom: 0,
        backgroundColor: 'rgba(52, 148, 217, 0.12)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(52, 148, 217, 0.35)',
        gap: 10,
    },
    manualEntryButtonText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#4CAF50',
        marginLeft: 6,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1C1C1E',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
    },
    modalLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#878787',
        marginBottom: 8,
        marginTop: 12,
    },
    modalInput: {
        backgroundColor: '#2C2C2E',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
    },
    modalRow: {
        flexDirection: 'row',
        gap: 12,
    },
    modalHalf: {
        flex: 1,
    },
    modalAddButton: {
        backgroundColor: '#285E2A',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
    },
    modalAddButtonDisabled: {
        backgroundColor: '#3A3D40',
    },
    modalAddButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
