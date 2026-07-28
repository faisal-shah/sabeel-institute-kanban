import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ALLOWED_EMAIL_DOMAIN } from '@sabeel/shared';
import {
  signInWithGoogle,
  signInWithGoogleRedirect,
  googleSignInAvailable,
  PopupBlockedError,
} from '../auth/google';
import { DEV_ACCOUNTS, devSignIn, devSignInAvailable } from '../auth/devSignIn';
import { Body, Button, Caption, Card, Hint, Row, Screen, Title } from '../components/ui';
import { radius, space } from '../theme';
import sabeelLogo from '../../assets/brand/sabeel-logo.png';
import { toUserMessage } from '../errors';
import { BUILD_INFO } from '../build-info';

export function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The popup was blocked, so the way in is being offered rather than taken.
   *
   * This used to redirect automatically, and that is precisely how people got
   * stuck: the redirect returns to Firebase's own `/__/auth/handler`, which
   * needs the `sessionStorage` written before the bounce. An in-app browser —
   * a link tapped in WhatsApp — does not have it on return, so Firebase renders
   * "missing initial state" on a page this app is not running on. No way back,
   * and re-opening the link lands on it again.
   */
  const [popupBlocked, setPopupBlocked] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setPopupBlocked(false);
    try {
      await fn();
    } catch (e) {
      if (e instanceof PopupBlockedError) setPopupBlocked(true);
      else setError(toUserMessage(e, 'signIn'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen width="read">
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
            // The dark (ivory) calligraphy on warm ivory. No tint or plate: a
            // flat tintColor would throw away the gold accent strokes. The app
            // is light-only, so the single asset is all we need.
            source={sabeelLogo}
            style={styles.logo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Sabeel Institute"
          />
        </View>
        <Title>Kanban</Title>
        <Body>Sign in with your @{ALLOWED_EMAIL_DOMAIN} account.</Body>
      </View>

      <Card>
        <Button
          label="Sign in with Google"
          onPress={() => run(signInWithGoogle)}
          busy={busy}
          disabled={!googleSignInAvailable && !devSignInAvailable}
          // The sign-in screen is the exception to content-width buttons on wide:
          // its single primary action reads better spanning the card.
          block
        />
        {popupBlocked ? (
          <View style={styles.blocked}>
            <Body>Your browser blocked the sign-in window.</Body>
            <Hint>
              If you opened this from a chat app, open{' '}
              {typeof window !== 'undefined' ? window.location.host : ''} in Safari
              or Chrome instead — sign-in cannot finish inside an in-app browser.
            </Hint>
            <Button
              label="Try anyway"
              variant="secondary"
              onPress={() => run(signInWithGoogleRedirect)}
              busy={busy}
              block
            />
          </View>
        ) : null}
        <Hint>
          New accounts need an administrator&rsquo;s approval before you can use
          the boards.
        </Hint>
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
          <Hint>Dev sign-in (emulator only)</Hint>
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
          <Hint>
            &ldquo;intruder@gmail.com&rdquo; is deliberately outside the org
            domain — the server deletes it on sight.
          </Hint>
        </Card>
      ) : null}

      {/* Which build is running — so "what version are you on?" is answerable
          from the screen everyone sees. Injected at build time by
          scripts/gen-build-info.mjs. */}
      <View style={styles.build}>
        <Caption>
          v{BUILD_INFO.version} &middot; {BUILD_INFO.commit}
        </Caption>
      </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  blocked: { gap: space.sm, marginTop: space.sm },
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
  build: { marginTop: space.lg, alignItems: 'center' },
});
