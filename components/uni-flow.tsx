import { Pressable, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewProps } from "react-native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { cn } from "@/lib/utils";
import { kindLabel, priorityLabel, toDateInput } from "@/lib/academic-utils";

/**
 * Botón táctil con estilos. NativeWind tiene desactivado className en Pressable
 * (ver lib/_core/nativewind-pressable.ts), así que el estilo va en una View interna.
 */
export function Tap({ className, children, style, ...props }: PressableProps & { className?: string; children?: React.ReactNode }) {
  const grow = /(^|\s)flex-1(\s|$)/.test(className ?? "");
  return (
    <Pressable
      {...props}
      style={(state) => [{ opacity: state.pressed ? 0.7 : 1 }, grow ? { flex: 1 } : null, typeof style === "function" ? style(state) : style]}
    >
      <View className={cn(className?.replace(/\bactive:\S+/g, ""))}>{children as React.ReactNode}</View>
    </Pressable>
  );
}

export function Surface({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("rounded-3xl border border-border bg-surface", className)} {...props} />;
}

export function SectionHeader({ title, action, onAction, className }: { title: string; action?: string; onAction?: () => void; className?: string }) {
  return (
    <View className={cn("mb-3 mt-2 flex-row items-center justify-between", className)}>
      <Text className="text-xl font-bold text-foreground">{title}</Text>
      {action && onAction ? <Pressable hitSlop={10} onPress={onAction}><Text className="text-sm font-semibold text-primary">{action}</Text></Pressable> : null}
    </View>
  );
}

export function ScreenTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View className="mb-6">
      <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">{eyebrow}</Text>
      <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">{title}</Text>
      {subtitle ? <Text className="mt-2 text-base leading-6 text-muted">{subtitle}</Text> : null}
    </View>
  );
}

/** Encabezado de pantallas apiladas con botón de regreso al alcance del pulgar. */
export function BackHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  const colors = useColors();
  return (
    <View className="mb-4 flex-row items-center">
      <Tap hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} className="mr-2 h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-70">
        <IconSymbol name="chevron.left" size={22} color={colors.primary} />
      </Tap>
      <Text className="flex-1 text-lg font-semibold text-foreground" numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
}

export function Tag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "sage" | "amber" | "rose" }) {
  const toneClass = { neutral: "bg-background", sage: "bg-[#E1EEE5]", amber: "bg-[#F6EBD4]", rose: "bg-[#F6E2E0]" }[tone];
  const textClass = { neutral: "text-muted", sage: "text-primary", amber: "text-[#9A6B28]", rose: "text-[#A6534E]" }[tone];
  return <View className={cn("rounded-full px-3 py-1", toneClass)}><Text className={cn("text-xs font-semibold", textClass)}>{label}</Text></View>;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} className={cn("rounded-full border px-3 py-2 active:opacity-70", active ? "border-primary bg-[#E1EEE5]" : "border-border bg-background")}>
      <Text className={cn("text-xs font-semibold", active ? "text-primary" : "text-muted")}>{label}</Text>
    </Tap>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return <View className={cn("h-2 overflow-hidden rounded-full bg-border", className)}><View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></View>;
}

export function ActionButton({ className, children, variant = "primary", ...props }: PressableProps & { className?: string; children: React.ReactNode; variant?: "primary" | "soft" | "danger" }) {
  const variantClass = { primary: "bg-primary", soft: "bg-[#E1EEE5]", danger: "bg-[#F6E2E0]" }[variant];
  return <Tap className={cn("items-center rounded-2xl px-4 py-3 active:opacity-80", variantClass, props.disabled && "opacity-50", className)} {...props}>{children}</Tap>;
}

export function ButtonLabel({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "soft" | "danger" }) {
  const color = { primary: "text-background", soft: "text-primary", danger: "text-[#A6534E]" }[variant];
  return <Text className={cn("font-semibold", color)}>{children}</Text>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <Surface className="mb-4 items-center px-6 py-8"><Text className="text-base font-semibold text-foreground">{title}</Text><Text className="mt-2 text-center text-sm leading-5 text-muted">{detail}</Text></Surface>;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text className="mb-2 mt-5 text-sm font-semibold text-foreground">{children}</Text>;
}

export function Field({ className, ...props }: TextInputProps & { className?: string }) {
  return <TextInput placeholderTextColor="#718078" className={cn("min-w-0 rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground", className)} {...props} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <View className="flex-row rounded-2xl bg-border p-1">
      {options.map((option) => (
        <Tap key={option.value} onPress={() => onChange(option.value)} className={cn("flex-1 items-center rounded-xl py-2", value === option.value && "bg-surface")}>
          <Text className={cn("text-sm font-semibold", value === option.value ? "text-foreground" : "text-muted")}>{option.label}</Text>
        </Tap>
      ))}
    </View>
  );
}

export function ComplexityPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View className="flex-row gap-2">
      {[1, 2, 3, 4, 5].map((level) => (
        <Tap key={level} onPress={() => onChange(level)} className={cn("h-11 w-11 items-center justify-center rounded-full", value === level ? "bg-primary" : "bg-background")}>
          <Text className={cn("font-bold", value === level ? "text-background" : "text-muted")}>{level}</Text>
        </Tap>
      ))}
    </View>
  );
}

export function PriorityPicker({ value, onChange }: { value: string; onChange: (value: "low" | "medium" | "high" | "critical") => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {(["low", "medium", "high", "critical"] as const).map((item) => <Chip key={item} label={priorityLabel(item)} active={value === item} onPress={() => onChange(item)} />)}
    </View>
  );
}

export function TypePicker({ value, onChange, includeNote = true }: { value: string; onChange: (value: "task" | "exam" | "delivery" | "reminder" | "note") => void; includeNote?: boolean }) {
  const options = (includeNote ? ["task", "exam", "delivery", "reminder", "note"] : ["task", "exam", "delivery"]) as ("task" | "exam" | "delivery" | "reminder" | "note")[];
  return <View className="flex-row flex-wrap gap-2">{options.map((item) => <Chip key={item} label={kindLabel(item)} active={value === item} onPress={() => onChange(item)} />)}</View>;
}

/** Fecha en texto AAAA-MM-DD con atajos de un toque. */
export function DateField({ day, time, onChangeDay, onChangeTime }: { day: string; time: string; onChangeDay: (value: string) => void; onChangeTime: (value: string) => void }) {
  const shortcut = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    onChangeDay(toDateInput(date));
  };
  return (
    <View>
      <View className="flex-row gap-2">
        <Field value={day} onChangeText={onChangeDay} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" className="flex-1" />
        <Field value={time} onChangeText={onChangeTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" className="w-24" />
      </View>
      <View className="mt-2 flex-row flex-wrap gap-2">
        <Chip label="Hoy" onPress={() => shortcut(0)} />
        <Chip label="Mañana" onPress={() => shortcut(1)} />
        <Chip label="+1 semana" onPress={() => shortcut(7)} />
        {day ? <Chip label="Sin fecha" onPress={() => { onChangeDay(""); onChangeTime(""); }} /> : null}
      </View>
    </View>
  );
}

export function SubjectPicker({ subjects, value, onChange }: { subjects: { id: number; name: string }[]; value: number | null; onChange: (value: number | null) => void }) {
  if (!subjects.length) return <Text className="text-sm text-muted">Crea materias en la pestaña Materias para clasificar mejor.</Text>;
  return (
    <View className="flex-row flex-wrap gap-2">
      <Chip label="Sin materia" active={value == null} onPress={() => onChange(null)} />
      {subjects.map((subject) => <Chip key={subject.id} label={subject.name} active={value === subject.id} onPress={() => onChange(subject.id)} />)}
    </View>
  );
}

export function ErrorText({ error }: { error?: { message: string } | null }) {
  if (!error) return null;
  return <Text className="mt-3 text-center text-sm leading-5 text-error">{error.message}</Text>;
}
