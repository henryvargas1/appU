import { Pressable, Text, View, type PressableProps, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

export function Surface({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("rounded-3xl border border-border bg-surface", className)} {...props} />;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-xl font-bold text-foreground">{title}</Text>
      {action && onAction ? <Pressable onPress={onAction}><Text className="text-sm font-semibold text-primary">{action}</Text></Pressable> : null}
    </View>
  );
}

export function Tag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "sage" | "amber" | "rose" }) {
  const toneClass = {
    neutral: "bg-background",
    sage: "bg-[#E1EEE5]",
    amber: "bg-[#F6EBD4]",
    rose: "bg-[#F6E2E0]",
  }[tone];
  const textClass = {
    neutral: "text-muted",
    sage: "text-primary",
    amber: "text-[#9A6B28]",
    rose: "text-[#A6534E]",
  }[tone];
  return <View className={cn("rounded-full px-3 py-1", toneClass)}><Text className={cn("text-xs font-semibold", textClass)}>{label}</Text></View>;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return <View className={cn("h-2 overflow-hidden rounded-full bg-border", className)}><View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></View>;
}

export function ActionButton({ className, children, ...props }: PressableProps & { className?: string; children: React.ReactNode }) {
  return <Pressable className={cn("rounded-2xl bg-primary px-4 py-3 active:opacity-80", className)} {...props}>{children}</Pressable>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <Surface className="items-center px-6 py-8"><Text className="text-base font-semibold text-foreground">{title}</Text><Text className="mt-2 text-center text-sm leading-5 text-muted">{detail}</Text></Surface>;
}
