import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { deviceTimeZone, stageLabel } from "@/lib/academic-utils";

const CATEGORY = "uniflow-reminder";
const SNOOZE_MINUTES = 60;
// iOS admite como máximo 64 notificaciones locales pendientes por app.
const MAX_SCHEDULED = 60;

let configured = false;

async function configure() {
  if (configured || Platform.OS === "web") return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: "done", buttonTitle: "Ya está hecho", options: { opensAppToForeground: false } },
    { identifier: "snooze", buttonTitle: "Posponer 1 h", options: { opensAppToForeground: false } },
    { identifier: "plan", buttonTitle: "Ver plan", options: { opensAppToForeground: true } },
  ]);
}

type ReminderLike = { id: number; taskId: number | null; title: string; scheduledFor: Date | string; stage: string; status: string };

/** Sincroniza los recordatorios de la nube con notificaciones locales del iPhone. */
export async function syncReminderNotifications(reminders: ReminderLike[], enabled: boolean) {
  if (Platform.OS === "web") return;
  await configure();
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter((item) => item.content.data?.source === "uniflow").map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  if (!enabled) return;
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return;

  const now = Date.now();
  const upcoming = reminders
    .filter((reminder) => reminder.status === "scheduled" && new Date(reminder.scheduledFor).getTime() > now)
    .slice(0, MAX_SCHEDULED);
  for (const reminder of upcoming) {
    await Notifications.scheduleNotificationAsync({
      identifier: `uniflow-reminder-${reminder.id}`,
      content: {
        title: reminder.title,
        body: `${stageLabel(reminder.stage)} · UniFlow`,
        categoryIdentifier: CATEGORY,
        data: { source: "uniflow", reminderId: reminder.id, taskId: reminder.taskId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminder.scheduledFor) },
    });
  }
}

/** Mantiene las notificaciones al día y atiende "Ya está hecho", "Posponer" y "Ver plan". */
export function useReminderNotifications() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const reminders = trpc.planner.reminders.useQuery(undefined, { refetchInterval: 5 * 60_000 });
  const settings = trpc.settings.get.useQuery();
  const invalidate = () => Promise.all([utils.planner.invalidate(), utils.task.invalidate()]);
  const done = trpc.reminder.done.useMutation({ onSuccess: invalidate });
  const snooze = trpc.reminder.snooze.useMutation({ onSuccess: invalidate });
  const updateSettings = trpc.settings.update.useMutation({ onSuccess: invalidate });
  const storedTimeZone = settings.data?.timeZone;

  // El plan y los recordatorios se calculan en la zona horaria del estudiante.
  useEffect(() => {
    if (storedTimeZone && storedTimeZone !== deviceTimeZone) updateSettings.mutate({ timeZone: deviceTimeZone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedTimeZone]);
  const handlers = useRef({ done, snooze, router });
  handlers.current = { done, snooze, router };

  const signature = JSON.stringify(reminders.data?.map((item) => [item.id, item.status, String(item.scheduledFor)]) ?? null);
  useEffect(() => {
    if (!reminders.data || !settings.data) return;
    syncReminderNotifications(reminders.data, settings.data.remindersEnabled).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, settings.data?.remindersEnabled]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { reminderId?: number; taskId?: number | null } | undefined;
      if (!data?.reminderId) return;
      const { done: doneMutation, snooze: snoozeMutation, router: nav } = handlers.current;
      if (response.actionIdentifier === "done") doneMutation.mutate({ reminderId: data.reminderId });
      else if (response.actionIdentifier === "snooze") snoozeMutation.mutate({ reminderId: data.reminderId, minutes: SNOOZE_MINUTES });
      else if (data.taskId) nav.push(`/task/${data.taskId}`);
      else nav.push("/(tabs)/tasks");
    });
    return () => subscription.remove();
  }, []);
}
