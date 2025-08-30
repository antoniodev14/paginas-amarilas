import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Pressable, LayoutChangeEvent, StyleSheet } from 'react-native';
import { theme } from '../lib/theme';

type Opt = { label: string; value: string };

export function DropdownSelect({
  label, value, onChange, options, placeholder = 'Todos', maxHeight = 220
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: Opt[];
  placeholder?: string;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const wrapperRef = useRef<View>(null);
  const selectedLabel = value ? (options.find(o => o.value === value)?.label ?? value) : '';

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View ref={wrapperRef} onLayout={onLayout} style={{ flex:1, marginHorizontal:8 }}>
      <Text style={{ marginBottom:6, marginLeft:2, fontWeight:'600', color: theme.colors.text }}>{label}</Text>

      <TouchableOpacity onPress={() => setOpen(v => !v)} style={styles.button} activeOpacity={0.9}>
        <Text style={{ color: value ? theme.colors.text : theme.colors.gray }}>
          {value ? selectedLabel : placeholder}
        </Text>
      </TouchableOpacity>

      {open && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.dropdown, { width: width ?? '100%', maxHeight }]}>
            <TouchableOpacity onPress={() => { onChange(null); setOpen(false); }} style={styles.item}>
              <Text style={{ color: theme.colors.text }}>Todos</Text>
            </TouchableOpacity>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => { onChange(item.value); setOpen(false); }} style={styles.item}>
                  <Text style={{ color: theme.colors.text }}>{item.label}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: maxHeight - 44 }}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor:'#fff',
    borderRadius: theme.radius,
    height:44,
    justifyContent:'center',
    paddingHorizontal:12,
    borderWidth:1,
    borderColor: theme.colors.border,
  },
  dropdown: {
    position:'absolute',
    top: 44 + 6,
    zIndex: 50,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    overflow:'hidden',
    shadowColor:'#000',
    shadowOpacity:0.12,
    shadowRadius:10,
    elevation:4,
    borderWidth:1,
    borderColor: theme.colors.border,
  },
  item: {
    paddingHorizontal:12,
    paddingVertical:12,
    borderBottomWidth:1,
    borderBottomColor: theme.colors.border
  }
});
