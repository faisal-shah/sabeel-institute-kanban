/**
 * App shell and the access gate.
 *
 * Every route below the gate can assume an ACTIVE user, so no screen has to
 * re-check status. The gate keys off the session's claims — which session.ts
 * keeps fresh by force-refreshing the token whenever the server stamps
 * claimsUpdatedAt — so an admin approval un-gates the app live.
 */
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSession } from './src/session';
import { SignInScreen } from './src/screens/SignInScreen';
import {
  DisabledScreen,
  PendingScreen,
  ProvisioningScreen,
  RejectedScreen,
} from './src/screens/GateScreens';
import { HomeScreen } from './src/screens/HomeScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { Screen, Spinner } from './src/components/ui';

function Routes() {
  const session = useSession();
  const [screen, setScreen] = useState<'home' | 'users'>('home');

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
          return screen === 'users' ? (
            <UsersScreen actor={user} />
          ) : (
            <HomeScreen user={user} onOpenUsers={() => setScreen('users')} />
          );
      }
    }
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Routes />
    </SafeAreaProvider>
  );
}
