import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  Modal,
  StyleSheet,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";

function parseYmd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ymd = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(ymd: string): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  try {
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return ymd;
  }
}

type NativeDateFieldProps = Readonly<{
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  editable?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Optional accent for the calendar icon */
  iconColor?: string;
  className?: string;
}>;

/**
 * OS-native date picker (Android dialog / iOS spinner modal).
 * Value is always YYYY-MM-DD for DB compatibility.
 */
export function NativeDateField({
  value,
  onChange,
  placeholder = "YYYY-MM-DD",
  editable = true,
  minimumDate,
  maximumDate,
  iconColor = "#10b981",
}: NativeDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => parseYmd(value) ?? new Date());

  const selected = useMemo(() => parseYmd(value), [value]);

  const openPicker = () => {
    if (!editable) return;
    setDraft(selected ?? new Date());
    setOpen(true);
  };

  const applyAndroid = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === "dismissed" || !date) return;
    onChange(formatYmd(date));
  };

  const confirmIos = () => {
    onChange(formatYmd(draft));
    setOpen(false);
  };

  return (
    <View className="w-full">
      <Pressable
        onPress={openPicker}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        className={`flex-row items-center rounded-lg px-3 h-12 border ${
          editable
            ? "bg-white/10 border-white/20"
            : "bg-white/5 border-white/10 opacity-60"
        }`}
      >
        <Feather name="calendar" size={18} color={iconColor} />
        <Text
          className={`flex-1 ml-3 text-base ${
            value ? "text-white" : "text-slate-500"
          }`}
        >
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color="#94a3b8" />
      </Pressable>

      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={applyAndroid}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.toolbar}>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmIos} hitSlop={12}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="spinner"
              themeVariant="dark"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onChange={(_e, date) => {
                if (date) setDraft(date);
              }}
              style={{ alignSelf: "stretch" }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  cancel: { color: "#94a3b8", fontSize: 16 },
  done: { color: "#34d399", fontSize: 16, fontWeight: "700" },
});
