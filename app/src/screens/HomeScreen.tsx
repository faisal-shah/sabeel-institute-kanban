import { sessionCan, signOut, type SessionUser } from '../session';
import {
  Body,
  Button,
  Caption,
  Card,
  Heading,
  Pill,
  Row,
  Screen,
  Title,
} from '../components/ui';

/**
 * Phase 1 home. Boards replace this in Phase 2; for now it proves the session,
 * the claims, and the capability helpers all agree.
 */
export function HomeScreen({
  user,
  onOpenUsers,
}: {
  user: SessionUser;
  onOpenUsers: () => void;
}) {
  return (
    <Screen>
      <Title>Sabeel Kanban</Title>
      <Row>
        <Pill label={user.role} tone="accent" />
        <Pill label={user.status} tone="good" />
      </Row>

      <Card>
        <Body>Signed in as {user.displayName}</Body>
        <Caption>{user.email}</Caption>
      </Card>

      <Heading>What you can do</Heading>
      <Card>
        <Body muted>
          {sessionCan.manageBoards(user)
            ? 'Create boards and join any board.'
            : 'See the boards you have been added to.'}
        </Body>
        <Body muted>
          {sessionCan.administerUsers(user)
            ? 'Approve accounts and change roles.'
            : 'Account administration is admin-only.'}
        </Body>
      </Card>

      {sessionCan.administerUsers(user) ? (
        <Button label="Manage people" onPress={onOpenUsers} />
      ) : null}

      <Caption>Boards arrive in Phase 2.</Caption>
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
