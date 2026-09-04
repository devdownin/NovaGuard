import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { useAppState, useFilteredEvents } from '../state/AppStateContext';
import { HistoryFilter } from '../state/types';
import { SegmentedControl } from '../components/SegmentedControl';
import { PeriodDropdown } from '../components/PeriodDropdown';
import { EventCard } from '../components/EventCard';
import { useLandscape } from '../utils/useLandscape';

const FILTER_OPTIONS: { label: string; value: HistoryFilter }[] = [
  { label: 'Toutes', value: 'Toutes' },
  { label: 'Personnes', value: 'Personnes' },
  { label: 'Animaux', value: 'Animaux' },
];

function ItemSeparator() {
  return <View style={{ height: 8 }} />;
}

export function HistoryScreen() {
  const {
    filter, setFilter, period, setPeriod, periodOpen, togglePeriodOpen, selectEvent,
  } = useAppState();
  const { shown } = useFilteredEvents();
  const landscape = useLandscape();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Historique</Text>
        <Text style={styles.count}>{shown.length} vidéos</Text>
      </View>

      <View style={styles.filters}>
        <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        <PeriodDropdown
          value={period}
          open={periodOpen}
          onToggle={togglePeriodOpen}
          onSelect={p => { setPeriod(p); togglePeriodOpen(); }}
        />
      </View>

      {periodOpen && (
        <Pressable style={styles.dismissOverlay} onPress={togglePeriodOpen} />
      )}

      <FlatList
        data={shown}
        keyExtractor={e => String(e.id)}
        // A card is a wide, short row: one per line wastes most of a landscape
        // window, so it goes to two columns there. `numColumns` cannot change
        // on a live list — hence the key, which remounts it on rotation.
        key={landscape ? 'grid' : 'list'}
        numColumns={landscape ? 2 : 1}
        contentContainerStyle={[styles.list, landscape && styles.listGrid]}
        renderItem={({ item }) => (
          <View style={landscape ? styles.gridCell : undefined}>
            <EventCard event={item} onPress={() => selectEvent(item.id)} />
          </View>
        )}
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun événement pour ce filtre.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  title: {
    fontFamily: font.medium,
    fontSize: 20,
    letterSpacing: -0.2,
    color: color.text,
  },
  count: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral500,
  },
  filters: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 9,
  },
  dismissOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 90,
    bottom: 0,
    zIndex: 20,
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    flexGrow: 1,
  },
  // The 4 dp each cell adds back is taken off the list's own padding, so the
  // outer margin stays the 14 dp it is in portrait.
  listGrid: {
    paddingHorizontal: 10,
  },
  // `maxWidth` so a lone last card keeps a column's width instead of being
  // stretched across the whole row by `flex`.
  gridCell: {
    flex: 1,
    maxWidth: '50%',
    paddingHorizontal: 4,
  },
  empty: {
    paddingVertical: 46,
    paddingHorizontal: 20,
    textAlign: 'center',
    color: color.neutral600,
    fontFamily: font.regular,
    fontSize: 12,
  },
});
