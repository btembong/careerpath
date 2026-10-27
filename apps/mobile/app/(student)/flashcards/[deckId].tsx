import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { api } from '../../../src/lib/api';
import { colors } from '../../../src/lib/theme';

const { width } = Dimensions.get('window');

export default function FlashcardPlayer() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const rotation = useSharedValue(0);
  const qc = useQueryClient();

  const { data: cards, isLoading } = useQuery({
    queryKey: ['flashcards', deckId],
    queryFn: () => api.get(`/flashcards/decks/${deckId}/cards`).then(r => r.data),
  });

  const { mutate: review } = useMutation({
    mutationFn: ({ cardId, difficulty }: { cardId: string; difficulty: number }) =>
      api.post(`/flashcards/decks/${deckId}/review`, { cardId, difficulty }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flashcards', deckId] }),
  });

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(rotation.value, [0, 1], [180, 360])}deg` }],
  }));

  const flip = () => {
    rotation.value = withTiming(flipped ? 0 : 1, { duration: 350 });
    setFlipped(!flipped);
  };

  const rate = (difficulty: number) => {
    const card = cards[index];
    review({ cardId: card.id, difficulty });
    setFlipped(false);
    rotation.value = 0;
    if (index < cards.length - 1) setIndex(index + 1);
  };

  if (isLoading) return <SafeAreaView style={s.root}><ActivityIndicator style={{ marginTop: 60 }} color={colors.azure} /></SafeAreaView>;
  if (!cards?.length) return <SafeAreaView style={s.root}><Text style={s.empty}>No cards in this deck.</Text></SafeAreaView>;

  const card = cards[index];
  const done = index >= cards.length;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.counter}>{Math.min(index + 1, cards.length)} / {cards.length}</Text>
      </View>

      {done ? (
        <View style={s.done}>
          <Text style={s.doneText}>Deck complete! 🎉</Text>
          <TouchableOpacity style={s.restartBtn} onPress={() => { setIndex(0); setFlipped(false); }}>
            <Text style={s.restartText}>Review Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity activeOpacity={0.9} onPress={flip} style={s.cardWrap}>
            <Animated.View style={[s.card, frontStyle]}>
              <Text style={s.hint}>TAP TO FLIP</Text>
              <Text style={s.cardText}>{card.front}</Text>
            </Animated.View>
            <Animated.View style={[s.card, s.cardBack, backStyle]}>
              <Text style={s.hint}>ANSWER</Text>
              <Text style={s.cardText}>{card.back}</Text>
            </Animated.View>
          </TouchableOpacity>

          {flipped && (
            <View style={s.rateRow}>
              <TouchableOpacity style={[s.rateBtn, s.again]} onPress={() => rate(3)}><Text style={s.rateText}>Again</Text></TouchableOpacity>
              <TouchableOpacity style={[s.rateBtn, s.hard]} onPress={() => rate(2)}><Text style={s.rateText}>Hard</Text></TouchableOpacity>
              <TouchableOpacity style={[s.rateBtn, s.easy]} onPress={() => rate(1)}><Text style={s.rateText}>Easy</Text></TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.surface },
  topbar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  back:     { color: colors.azure, fontWeight: '600', fontSize: 14 },
  counter:  { fontSize: 13, color: colors.muted, fontWeight: '600' },
  cardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:     { position: 'absolute', width: width - 48, minHeight: 200, backgroundColor: colors.white, borderRadius: 20, padding: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.cloud, backfaceVisibility: 'hidden' },
  cardBack: { backgroundColor: colors.cloud },
  hint:     { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1, marginBottom: 16 },
  cardText: { fontSize: 18, fontWeight: '700', color: colors.navy, textAlign: 'center', lineHeight: 26 },
  rateRow:  { flexDirection: 'row', gap: 12, padding: 24, paddingTop: 0 },
  rateBtn:  { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  again:    { backgroundColor: '#fee2e2' },
  hard:     { backgroundColor: '#fef3c7' },
  easy:     { backgroundColor: '#dcfce7' },
  rateText: { fontSize: 14, fontWeight: '700', color: colors.navy },
  done:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  doneText: { fontSize: 22, fontWeight: '800', color: colors.navy, marginBottom: 24 },
  restartBtn: { backgroundColor: colors.azure, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  restartText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty:    { textAlign: 'center', color: colors.muted, marginTop: 60, fontSize: 14 },
});
