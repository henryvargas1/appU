import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { startOAuthLogin } from "@/constants/oauth";
import { ScreenContainer } from "@/components/screen-container";
import { Tap } from "@/components/uni-flow";

export function LoginScreen({ loading = false }: { loading?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const handleLogin = async () => {
    try {
      setError(null);
      await startOAuthLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible abrir el acceso");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6 py-8">
      <View className="flex-1 justify-between">
        <View className="pt-10">
          <View className="mb-7 h-16 w-16 items-center justify-center rounded-[22px] bg-primary">
            <Text className="text-3xl font-bold text-background">U</Text>
          </View>
          <Text className="text-5xl font-bold tracking-tight text-foreground">UniFlow</Text>
          <Text className="mt-4 max-w-sm text-lg leading-7 text-muted">
            Captura lo que pasa en clase. Nosotros lo convertimos en el siguiente paso.
          </Text>
        </View>
        <View className="rounded-3xl border border-border bg-surface p-5">
          <Text className="text-base font-semibold text-foreground">Tu semestre, más claro</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Tus notas, tareas y recordatorios se guardan en la nube y se organizan desde tu iPhone.
          </Text>
          {loading ? (
            <View className="mt-5 items-center py-3"><ActivityIndicator color="#486B5A" /></View>
          ) : (
            <Tap onPress={handleLogin} className="mt-5 items-center rounded-2xl bg-primary px-5 py-4 active:opacity-80">
              <Text className="font-semibold text-background">Entrar con Manus</Text>
            </Tap>
          )}
          {error ? <Text className="mt-3 text-sm text-error">{error}</Text> : null}
          <Text className="mt-4 text-center text-xs leading-4 text-muted">
            Al continuar, autorizas la cuenta que usarás para guardar tu información académica.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
