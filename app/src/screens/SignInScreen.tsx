import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ALLOWED_EMAIL_DOMAIN } from '@sabeel/shared';
import { signInWithGoogle, googleSignInAvailable } from '../auth/google';
import { DEV_ACCOUNTS, devSignIn, devSignInAvailable } from '../auth/devSignIn';
import { Body, Button, Caption, Card, Row, Screen, Title } from '../components/ui';
import { radius, space, useTheme } from '../theme';
import sabeelLogo from '../../assets/brand/sabeel-logo.png';
import sabeelLogoReverse from '../../assets/brand/sabeel-logo-reverse.png';

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
      {/* A sign-in form has one job; stretching it across a monitor makes it
          harder to use, not grander. Capped narrower than the general content
          column. */}
      <View style={styles.pane}>
      <View style={styles.header}>
        {/*
          The logo belongs on the entry screen and nowhere else — inside the app
          the brand is carried by the palette, and a logo repeated on every
          screen is chrome that costs space the board needs.
        */}
        <View style={styles.logoPlate}>
          <Image
            // Two assets rather than a plate or a tint: the reverse mark has
            // light calligraphy and KEEPS the gold accents, which a flat
            // tintColor would flatten away. Same approach as the sibling
            // time-tracker app.
            source={t.name === 'dark' ? sabeelLogoReverse : sabeelLogo}
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pane: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: space.sm },
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
