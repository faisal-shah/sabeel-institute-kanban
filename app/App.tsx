/**
 * App shell and the access gate.
 *
 * Every route below the gate can assume an ACTIVE user, so no screen has to
 * re-check status. The gate keys off the session's claims — which session.ts
 * keeps fresh by force-refreshing the token whenever the server stamps
 * claimsUpdatedAt — so an admin approval un-gates the app live.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { KeyboardHost } from './src/components/KeyboardHost';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSession, type SessionUser } from './src/session';
import { initErrorReporting, setErrorUser } from './src/sentry';
import { useNav, useHardwareBack } from './src/nav';
import { SignInScreen } from './src/screens/SignInScreen';
import {
  DisabledScreen,
  PendingScreen,
  ProvisioningScreen,
  RejectedScreen,
  WrongDomainScreen,
} from './src/screens/GateScreens';
import { BoardsScreen } from './src/screens/BoardsScreen';
import { BoardScreen } from './src/screens/BoardScreen';
import { BoardSettingsScreen } from './src/screens/BoardSettingsScreen';
import { CardScreen } from './src/screens/CardScreen';
import { MyWorkScreen } from './src/screens/MyWorkScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { Screen, Spinner } from './src/components/ui';

/**
 * Cross-fade between screens.
 *
 * The stack swapped screens with NO transition, so every navigation was a hard
 * cut — one full-screen layout replaced by a different one in a single frame,
 * which reads as a flash rather than as movement. Android's own back gesture
 * animates, so the instant swap at the end of it looked broken.
 *
 * A short fade is enough: it gives the eye something continuous to follow
 * without pretending to be a native stack animation, and it costs nothing on a
 * hand-rolled navigator. Keyed on the route so each screen fades in on arrival.
 */
function ScreenFade({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [routeKey, opacity]);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

function SignedInRoutes({ user }: { user: SessionUser }) {
  const { route } = useNav();

  // Key includes the ids so moving between two cards also fades.
  const routeKey = JSON.stringify(route);

  const screen = (() => {
    switch (route.name) {
      case 'board':
        return <BoardScreen boardId={route.boardId} user={user} />;
      case 'boardSettings':
        return <BoardSettingsScreen boardId={route.boardId} user={user} />;
      case 'card':
        return <CardScreen boardId={route.boardId} cardId={route.cardId} user={user} />;
      case 'myWork':
        return <MyWorkScreen user={user} />;
      case 'notifications':
        return <NotificationsScreen user={user} />;
      case 'search':
        return <SearchScreen user={user} />;
      case 'users':
        return <UsersScreen actor={user} />;
      default:
        return <BoardsScreen user={user} />;
    }
  })();

  return <ScreenFade routeKey={routeKey}>{screen}</ScreenFade>;
}

function Routes() {
  const session = useSession();
  // Android Back / edge-swipe pops this stack instead of exiting the app.
  useHardwareBack();

  // Tag events with WHO hit them — uid only, never email (see src/sentry.ts).
  // Cleared on sign-out so a shared browser cannot attribute one person's
  // errors to the last person who used it.
  const uid = session.state === 'signed-in' ? session.user.uid : null;
  useEffect(() => {
    setErrorUser(uid);
  }, [uid]);

  switch (session.state) {
    case 'loading':
      return (
        <Screen scroll={false}>
          <Spinner />
        </Screen>
      );

    case 'signed-out':
      return <SignInScreen />;

    // Signed in, but the auth-create trigger has not finished (or has just
    // deleted a non-org account, in which case auth state flips to signed-out
    // on its own).
    case 'provisioning':
      return <ProvisioningScreen />;

    // Provisioning never completed: almost always a non-org address that the
    // auth-create trigger rejected and deleted. Say so, instead of spinning.
    case 'not-provisioned':
      return <WrongDomainScreen />;

    case 'signed-in': {
      const { user } = session;
      switch (user.status) {
        case 'pending':
          return <PendingScreen user={user} />;
        case 'rejected':
          return <RejectedScreen user={user} />;
        case 'disabled':
          return <DisabledScreen user={user} />;
        case 'active':
          return <SignedInRoutes user={user} />;
      }
    }
  }
}

export default function App() {
  // Once, before anything renders — an error thrown during the first paint is
  // exactly the kind worth catching, and initialising inside Routes would miss
  // it. No-ops without a DSN.
  useEffect(() => {
    initErrorReporting();
  }, []);

  return (
    /* Wraps everything so KeyboardScroll receives IME insets on native; a
       no-op on web, where the browser handles this itself. */
    <KeyboardHost>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Routes />
      </SafeAreaProvider>
    </KeyboardHost>
  );
}
