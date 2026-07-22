/**
 * What a signed-in-but-not-approved person sees.
 *
 * These screens exist because a blank screen is the worst possible answer to
 * "why can't I get in?". Each states the situation and what happens next, and
 * each updates LIVE — the moment an admin approves someone, session.ts refreshes
 * the token and the app un-gates without a sign-out.
 */
import { ALLOWED_EMAIL_DOMAIN } from '@sabeel/shared';
import type { SessionUser } from '../session';
import { signOut } from '../session';
import { Body, Button, Card, Screen, Spinner, Title } from '../components/ui';

export function ProvisioningScreen() {
  return (
    <Screen scroll={false} width="read">
      <Spinner label="Setting up your account…" />
    </Screen>
  );
}

export function PendingScreen({ user }: { user: SessionUser }) {
  return (
    <Screen width="read">
      <Title>Waiting for approval</Title>
      <Card>
        <Body>
          You&rsquo;re signed in as {user.email}. An administrator needs to
          approve your account before you can see any boards.
        </Body>
        <Body muted>
          This page updates by itself the moment that happens — no need to sign
          out or refresh.
        </Body>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

export function RejectedScreen({ user }: { user: SessionUser }) {
  return (
    <Screen width="read">
      <Title>Access not granted</Title>
      <Card>
        <Body>
          The request from {user.email} was declined. If you think that&rsquo;s a
          mistake, speak to an administrator.
        </Body>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

export function DisabledScreen({ user }: { user: SessionUser }) {
  return (
    <Screen width="read">
      <Title>Account disabled</Title>
      <Card>
        <Body>
          {user.email} no longer has access. Any cards still assigned to you stay
          where they are — an administrator can restore your account.
        </Body>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

/** Shown when someone signs in with an address outside the Workspace. */
export function WrongDomainScreen() {
  return (
    <Screen width="read">
      <Title>Wrong account</Title>
      <Card>
        <Body>
          Only @{ALLOWED_EMAIL_DOMAIN} accounts can use this app. Sign out and
          try again with your work account.
        </Body>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
