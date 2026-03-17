import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { CONFIG, searchWithProgressiveResults, shouldTriggerSearch } from '@/lib/foodSearch';
import { triggerHaptic } from '@/lib/utils/haptics';
import {
  addFavoriteFood,
  addRecentFood,
  getFavoriteFoods,
  getRecentFoods,
  NormalizedFood,
  removeFavoriteFood,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

type Tab = 'all' | 'recents' | 'favorites';

// Draft storage key for selected items
const MEAL_ITEMS_DRAFT_KEY = 'meal_items_draft';

// Selected item with quantity
interface SelectedItem extends NormalizedFood {
  quantity: number;
}

export default function LogMealItemsScreen() {
  const { user, profile } = useAuth();
  const params = useLocalSearchParams();
  const isNewSession = React.useMemo(() => {
    const value = params.newSession;
    if (Array.isArray(value)) {
      return value[0] === '1' || value[0] === 'true';
    }
    return value === '1' || value === 'true';
  }, [params.newSession]);
  const isReplaceMode = React.useMemo(() => typeof params.replaceIndex === 'string', [params.replaceIndex]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [, setShowBottomSheet] = useState(false);

  // Search state
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Favorites and Recents state
  const [favorites, setFavorites] = useState<NormalizedFood[]>([]);
  const [recents, setRecents] = useState<NormalizedFood[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoadingTab, setIsLoadingTab] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Manual entry modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualCalories, setManualCalories] = useState('');

  // ========== DRAFT PERSISTENCE ==========
  useEffect(() => {
    if (isReplaceMode) return;
    if (!params.existingItems || typeof params.existingItems !== 'string') return;
    if (params.existingItems === '[]') return;
    try {
      const items = JSON.parse(params.existingItems) as SelectedItem[];
      if (items.length > 0) {
        setSelectedItems(items);
        setShowBottomSheet(true);
      }
    } catch (e) {
      console.warn('Failed to parse existing items:', e);
    }
  }, [params.existingItems, isReplaceMode]);

  // Save selected items draft to AsyncStorage
  const saveDraft = useCallback(async (items: SelectedItem[]) => {
    try {
      if (items.length > 0) {
        const draft = {
          selectedItems: items,
          savedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(MEAL_ITEMS_DRAFT_KEY, JSON.stringify(draft));
      } else {
        await AsyncStorage.removeItem(MEAL_ITEMS_DRAFT_KEY);
      }
    } catch (e) {
      console.warn('Failed to save meal items draft:', e);
    }
  }, []);

  // Restore draft from AsyncStorage on mount
  useEffect(() => {
    const restoreDraft = async () => {
      try {
        if (isNewSession || isReplaceMode) {
          await AsyncStorage.removeItem(MEAL_ITEMS_DRAFT_KEY);
          return;
        }
        // Only restore if no scanned food and no existing items with actual content
        // existingItems is always passed but may be '[]', so check for actual items
        const hasExistingItems = params.existingItems && params.existingItems !== '[]';
        if (params.scannedFood || hasExistingItems) {
          setDraftRestored(true);
          return;
        }
        const stored = await AsyncStorage.getItem(MEAL_ITEMS_DRAFT_KEY);
        if (stored) {
          const draft = JSON.parse(stored);
          // Only restore drafts less than 24 hours old
          const savedAt = new Date(draft.savedAt);
          const hoursSinceSave = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceSave < 24 && draft.selectedItems?.length > 0) {
            setSelectedItems(draft.selectedItems);
            setShowBottomSheet(true);
          } else {
            await AsyncStorage.removeItem(MEAL_ITEMS_DRAFT_KEY);
          }
        }
      } catch (e) {
        console.warn('Failed to restore meal items draft:', e);
      } finally {
        setDraftRestored(true);
      }
    };
    restoreDraft();
  }, [isNewSession, isReplaceMode, params.scannedFood, params.existingItems]);

  // Save draft when selected items change
  useEffect(() => {
    if (draftRestored) {
      saveDraft(selectedItems);
    }
  }, [selectedItems, saveDraft, draftRestored]);

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

  // Handle scanned food item from scan-label screen
  useEffect(() => {
    if (params.scannedFood && typeof params.scannedFood === 'string') {
      try {
        const scannedItem = JSON.parse(params.scannedFood) as NormalizedFood;
        // Add to selected items with quantity 1
        setSelectedItems(prev => {
          const exists = prev.some(
            item => item.external_id === scannedItem.external_id
          );
          if (exists) return prev;
          return [...prev, { ...scannedItem, quantity: 1 }];
        });
        setShowBottomSheet(true);
      } catch (e) {
        console.error('Failed to parse scanned food:', e);
      }
    }
  }, [params.scannedFood]);

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

  const handleBack = () => {
    router.back();
  };

  const handleBarcodePress = () => {
    router.push({
      pathname: '/scan-label',
      params: {
        mealName: params.mealName || '',
        mealType: params.mealType || '',
        mealTime: params.mealTime || '',
        imageUri: params.imageUri || '',
        existingItems: params.existingItems || '[]',
      },
    });
  };

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
      setShowBottomSheet(true);

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

  const handleSave = () => {
    const returnTo = typeof params.returnTo === 'string' ? params.returnTo : '/log-meal-review';
    const replaceIndex = typeof params.replaceIndex === 'string' ? Number(params.replaceIndex) : null;

    if (replaceIndex !== null && !Number.isNaN(replaceIndex) && selectedItems.length !== 1) {
      Alert.alert('Select one item', 'Pick a single item to replace.');
      return;
    }

    // Navigate back with selected items and original form state
    router.navigate({
      pathname: returnTo as any,
      params: {
        selectedFoods: JSON.stringify(selectedItems),
        ...(replaceIndex !== null && !Number.isNaN(replaceIndex)
          ? { replaceIndex: String(replaceIndex) }
          : {}),
        mealName: params.mealName || '',
        mealTitleEdited: params.mealTitleEdited || '0',
        mealType: params.mealType || '',
        mealTime: params.mealTime || '',
        mealNotes: params.mealNotes || '',
        imageUri: params.imageUri || '',
        photoPath: params.photoPath || '',
        existingItems: params.existingItems || '[]',
      },
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setResults([]);
  };

  // Handle adding manual food entry
  // Uses 'fdc' provider with 'Manual Entry' brand to avoid DB constraint issues
  const handleManualEntry = () => {
    if (!manualName.trim()) return;

    const carbs = parseFloat(manualCarbs);
    const protein = parseFloat(manualProtein);
    const fat = parseFloat(manualFat);
    const caloriesInput = parseFloat(manualCalories);

    // Auto-calculate calories if not provided (use 0 for empty fields in calculation)
    const calories = !isNaN(caloriesInput)
      ? caloriesInput
      : Math.round(((isNaN(carbs) ? 0 : carbs) * 4) + ((isNaN(protein) ? 0 : protein) * 4) + ((isNaN(fat) ? 0 : fat) * 9));

    const manualFood: SelectedItem = {
      provider: 'fdc',  // Use 'fdc' to satisfy DB constraint; 'Manual Entry' brand indicates it's manual
      external_id: `manual-${uuid.v4()}`,  // Prefix with 'manual-' to identify manual entries
      display_name: manualName.trim(),
      brand: 'Manual Entry',  // This brand indicates a manual entry
      serving_size: 1,
      serving_unit: 'serving',
      calories_kcal: !isNaN(calories) ? calories : null,
      carbs_g: !isNaN(carbs) ? carbs : null,
      protein_g: !isNaN(protein) ? protein : null,
      fat_g: !isNaN(fat) ? fat : null,
      fibre_g: null,
      sugar_g: null,
      sodium_mg: null,
      quantity: 1,
    };

    setSelectedItems(prev => [...prev, manualFood]);
    setShowBottomSheet(true);
    setShowManualModal(false);

    // Clear form
    setManualName('');
    setManualCarbs('');
    setManualProtein('');
    setManualFat('');
    setManualCalories('');
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
        onPress={() => { triggerHaptic(); toggleSelect(item); }}
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
              triggerHaptic();
              toggleFavorite(item);
            }}
          >
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={22}
              color={favorited ? '#FF6B6B' : Colors.textTertiary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.checkButton, selected && styles.checkButtonSelected]}
            onPress={() => { triggerHaptic(); toggleSelect(item); }}
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
          onPress={() => { triggerHaptic(); updateQuantity(item, -1); }}
        >
          <Ionicons name="remove" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.quantityText}>{item.quantity}</Text>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => { triggerHaptic(); updateQuantity(item, 1); }}
        >
          <Ionicons name="add" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <LiquidGlassIconButton size={44} onPress={handleBack}>
            <Ionicons name="chevron-back" size={22} color="#1C1C1E" />
          </LiquidGlassIconButton>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            style={styles.barcodeButton}
            onPress={() => { triggerHaptic(); handleBarcodePress(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="scan-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.textPlaceholder} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Food"
            placeholderTextColor={Colors.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />
          )}
          {searchQuery.length > 0 && !isSearching && (
            <TouchableOpacity onPress={() => { triggerHaptic(); clearSearch(); }} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={Colors.textPlaceholder} />
            </TouchableOpacity>
          )}
        </View>

        {/* Did you mean suggestion */}
        {correctedQuery && correctedQuery !== searchQuery.toLowerCase().trim() && (
          <TouchableOpacity
            style={styles.didYouMeanContainer}
            onPress={() => { triggerHaptic(); setSearchQuery(correctedQuery); }}
          >
            <Text style={styles.didYouMeanText}>
              Did you mean: <Text style={styles.didYouMeanQuery}>{correctedQuery}</Text>?
            </Text>
          </TouchableOpacity>
        )}

        {/* Manual Entry Button */}
        <TouchableOpacity
          style={styles.manualEntryButton}
          onPress={() => { triggerHaptic(); setShowManualModal(true); }}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.manualEntryButtonText}>Add Manual Entry</Text>
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'all' && styles.tabActive]}
            onPress={() => { triggerHaptic(); setActiveTab('all'); }}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
              ALL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'recents' && styles.tabActive]}
            onPress={() => { triggerHaptic(); setActiveTab('recents'); }}
          >
            <Text style={[styles.tabText, activeTab === 'recents' && styles.tabTextActive]}>
              RECENTS
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
            onPress={() => { triggerHaptic(); setActiveTab('favorites'); }}
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
                  <ActivityIndicator color={Colors.primary} size="large" />
                </View>
              ) : searchQuery.length >= 2 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No foods found</Text>
                  <Text style={styles.emptySubtext}>Try a different search term</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search" size={48} color={Colors.textMuted} />
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
                  <ActivityIndicator color={Colors.primary} size="large" />
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
                  <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
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
                  <ActivityIndicator color={Colors.primary} size="large" />
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
                  <Ionicons name="heart-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No favorites yet</Text>
                  <Text style={styles.emptySubtext}>Tap the heart to save foods</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Bottom Sheet for Selected Items */}
        {selectedItems.length > 0 && (
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            <FlatList
              data={selectedItems}
              keyExtractor={(item) => `${item.provider}-${item.external_id}`}
              renderItem={renderSelectedItem}
              style={styles.selectedList}
              showsVerticalScrollIndicator={false}
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => { triggerHaptic('medium'); handleSave(); }}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Manual Entry Modal */}
        <Modal
          visible={showManualModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowManualModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Manual Entry</Text>
                <TouchableOpacity onPress={() => { triggerHaptic(); setShowManualModal(false); }}>
                  <Ionicons name="close" size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Food Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={manualName}
                onChangeText={setManualName}
                placeholder="e.g., Homemade Pasta"
                placeholderTextColor={Colors.textPlaceholder}
              />

              <Text style={styles.modalLabel}>Carbs (g) *</Text>
              <TextInput
                style={styles.modalInput}
                value={manualCarbs}
                onChangeText={setManualCarbs}
                placeholder="0"
                placeholderTextColor={Colors.textPlaceholder}
                keyboardType="numeric"
              />

              <View style={styles.modalRow}>
                <View style={styles.modalHalf}>
                  <Text style={styles.modalLabel}>Protein (g)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={manualProtein}
                    onChangeText={setManualProtein}
                    placeholder="0"
                    placeholderTextColor={Colors.textPlaceholder}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.modalHalf}>
                  <Text style={styles.modalLabel}>Fat (g)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={manualFat}
                    onChangeText={setManualFat}
                    placeholder="0"
                    placeholderTextColor={Colors.textPlaceholder}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.modalLabel}>Calories (optional)</Text>
              <TextInput
                style={styles.modalInput}
                value={manualCalories}
                onChangeText={setManualCalories}
                placeholder="Auto-calculated from macros"
                placeholderTextColor={Colors.textPlaceholder}
                keyboardType="numeric"
              />

              <TouchableOpacity
                style={[
                  styles.modalAddButton,
                  !manualName.trim() && styles.modalAddButtonDisabled,
                ]}
                onPress={() => { triggerHaptic('medium'); handleManualEntry(); }}
                disabled={!manualName.trim()}
              >
                <Text style={styles.modalAddButtonText}>Add Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  safeArea: {
    flex: 1,
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
    backgroundColor: Colors.buttonSecondary,
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
    backgroundColor: Colors.buttonSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderCard,
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
    color: Colors.textPrimary,
  },
  clearButton: {
    padding: 4,
  },
  didYouMeanContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primaryMedium,
  },
  didYouMeanText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  didYouMeanQuery: {
    fontFamily: fonts.semiBold,
    color: Colors.primary,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderCard,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginRight: 24,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.textPrimary,
  },
  tabText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  tabTextActive: {
    color: Colors.textPrimary,
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
    color: Colors.textTertiary,
    marginTop: 16,
  },
  emptySubtext: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: Colors.textTertiary,
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
    borderBottomColor: Colors.borderCard,
  },
  foodInfo: {
    flex: 1,
    paddingRight: 12,
  },
  foodName: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  foodBrand: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  foodNutrients: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: Colors.textTertiary,
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
    borderColor: Colors.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkButtonSelected: {
    backgroundColor: Colors.buttonAction,
    borderColor: Colors.buttonAction,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 34,
    maxHeight: 300,
  },
  bottomSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.borderCard,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  selectedList: {
    maxHeight: 150,
  },
  selectedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderCard,
  },
  selectedItemInfo: {
    flex: 1,
    paddingRight: 12,
  },
  selectedItemName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  selectedItemBrand: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: Colors.textTertiary,
  },
  selectedItemNutrients: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: Colors.textTertiary,
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
    backgroundColor: Colors.borderCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    color: Colors.textPrimary,
    minWidth: 32,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: Colors.buttonSecondary,
    borderWidth: 1,
    borderColor: Colors.buttonSecondaryBorder,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primaryMedium,
    gap: 10,
  },
  manualEntryButtonText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: Colors.primary,
    marginLeft: 6,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundCard,
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
    color: Colors.textPrimary,
  },
  modalLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: Colors.textTertiary,
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: Colors.inputBackgroundSolid,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalHalf: {
    flex: 1,
  },
  modalAddButton: {
    backgroundColor: Colors.buttonSecondary,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  modalAddButtonDisabled: {
    backgroundColor: Colors.buttonDisabled,
  },
  modalAddButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: Colors.textPrimary,
  },
});
