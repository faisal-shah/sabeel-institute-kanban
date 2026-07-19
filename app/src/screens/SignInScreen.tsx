import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ALLOWED_EMAIL_DOMAIN } from '@sabeel/shared';
import { signInWithGoogle, googleSignInAvailable } from '../auth/google';
import { DEV_ACCOUNTS, devSignIn, devSignInAvailable } from '../auth/devSignIn';
import { Body, Button, Caption, Card, Row, Screen, Title } from '../components/ui';
import { radius, space, useTheme } from '../theme';
import sabeelLogo from '../../assets/brand/sabeel-logo.png';

export function SignInScreen() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        {/*
          The logo belongs on the entry screen and nowhere else — inside the app
          the brand is carried by the palette, and a logo repeated on every
          screen is chrome that costs space the board needs. The mark is dark
          calligraphy with gold accents, so it needs a light ground in both
          themes rather than the canvas colour.
        */}
        <View style={[styles.logoPlate, { backgroundColor: t.bg.brandPlate }]}>
          <Image
            source={sabeelLogo}
            style={styles.logo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Sabeel Institute"
          />
        </View>
        <Title>Kanban</Title>
        <Body muted>Sign in with your @{ALLOWED_EMAIL_DOMAIN} account.</Body>
      </View>

      <Card>
        <Button
          label="Sign in with Google"
          onPress={() => run(signInWithGoogle)}
          busy={busy}
          disabled={!googleSignInAvailable && !devSignInAvailable}
        />
        <Caption>
          New accounts need an administrator&rsquo;s approval before you can use
          the boards.
        </Caption>
      </Card>

      {error ? (
        <Card>
          <Body>{error}</Body>
        </Card>
      ) : null}

      {/*
        Emulator-only. Gated on __DEV__ AND the emulator flag, so it cannot reach
        a release build. Verify by screenshot before publishing an APK — this row
        must be absent.
      */}
      {devSignInAvailable ? (
        <Card>
          <Caption>Dev sign-in (emulator only)</Caption>
          <Row style={styles.wrap}>
            {DEV_ACCOUNTS.map((name) => (
              <Button
                key={name}
                label={name}
                variant="secondary"
                onPress={() => run(() => devSignIn(name))}
                busy={busy}
              />
            ))}
          </Row>
          <Caption>
            &ldquo;intruder@gmail.com&rdquo; is deliberately outside the org
            domain — the server deletes it on sight.
          </Caption>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs, marginBottom: space.md, alignItems: 'center' },
  logoPlate: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: space.xl,
    borderRadius: radius.lg,
    marginBottom: space.md,
  },
  logo: { width: 260, height: 130 },
  wrap: { flexWrap: 'wrap' },
});
