/**
 * The app-wide navigation chrome — the one persistent surface that carries the
 * section/account destinations, so no screen has to grow its own row of header
 * buttons (which used to wrap and scatter on a phone).
 *
 * Two shapes, chosen by the caller from screen width:
 *   - `variant="bar"`  → a bottom tab bar (phone). Rendered only on the tab-root
 *     screens; hidden on the immersive board/card screens.
 *   - `variant="rail"` → a slim left activity rail (wide / web), VSCode-style,
 *     persistent on every screen because a vertical strip costs horizontal space,
 *     of which wide layouts have plenty, not the vertical space a board needs.
 *
 * Device safe-areas are handled through `react-native-safe-area-context` (the
 * same library React Navigation's own tab bar uses): the bar pads its bottom by
 * the real inset, floored to a minimum, so it clears a gesture pill on modern
 * phones and still looks right on button-nav devices that report a zero inset.
 */
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, SheetOption } from './Sheet';
import { useNav, type Route } from '../nav';
import { useUnreadCount } from '../notifications';
import { sessionCan, signOut, type SessionUser } from '../session';
import { radius, space, useTheme } from '../theme';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];
type RouteName = Route['name'];

type TabDef = {
  key: RouteName;
  label: string;
  icon: MaterialIconName;
  /** Routes for which this tab shows as active (a board is "under" Boards). */
  activeFor: RouteName[];
};

const TABS: TabDef[] = [
  {
    key: 'boards',
    label: 'Boards',
    icon: 'dashboard',
    activeFor: ['boards', 'board', 'boardSettings', 'newBoard', 'card'],
  },
  { key: 'myWork', label: 'My Work', icon: 'assignment-ind', activeFor: ['myWork'] },
  { key: 'search', label: 'Search', icon: 'search', activeFor: ['search'] },
  {
    key: 'notifications',
    label: 'Alerts',
    icon: 'notifications',
    activeFor: ['notifications'],
  },
];

/** Which narrow routes show the bottom bar — the four tab roots only. */
export const TAB_ROOTS: RouteName[] = TABS.map((t) => t.key);
export function isTabRoot(name: RouteName): boolean {
  return TAB_ROOTS.includes(name);
}

export function AppNav({
  user,
  variant,
}: {
  user: SessionUser;
  variant: 'bar' | 'rail';
}) {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount(user).data ?? 0;
  const [menuOpen, setMenuOpen] = useState(false);

  const active = nav.route.name;
  const rail = variant === 'rail';

  const items = TABS.map((tab) => (
    <NavItem
      key={tab.key}
      icon={tab.icon}
      label={tab.label}
      rail={rail}
      active={tab.activeFor.includes(active)}
      badge={tab.key === 'notifications' ? unread : 0}
      // Tab taps replace the stack so switching sections never deepens the back
      // history (tabs are roots, not pushes).
      onPress={() => nav.reset({ name: tab.key } as Route)}
    />
  ));

  const account = (
    <NavItem
      icon="account-circle"
      label="Account"
      rail={rail}
      active={active === 'users'}
      onPress={() => setMenuOpen(true)}
    />
  );

  const menu = (
    <Sheet visible={menuOpen} title="Account" onClose={() => setMenuOpen(false)}>
      {sessionCan.administerUsers(user) ? (
        <SheetOption
          label="People"
          detail="Approve accounts and set roles"
          onPress={() => {
            setMenuOpen(false);
            nav.push({ name: 'users' });
          }}
        />
      ) : null}
      <SheetOption
        label="Sign out"
        onPress={() => {
          setMenuOpen(false);
          void signOut();
        }}
      />
    </Sheet>
  );

  if (rail) {
    return (
      <View
        style={[
          styles.rail,
          {
            backgroundColor: t.bg.raised,
            borderRightColor: t.border.strong,
            paddingTop: Math.max(insets.top, space.md),
            paddingBottom: Math.max(insets.bottom, space.md),
            paddingLeft: insets.left,
          },
        ]}
      >
        <View style={styles.railTabs}>{items}</View>
        {account}
        {menu}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: t.bg.raised,
          borderTopColor: t.border.strong,
          // Clear the gesture pill; floor it so button-nav devices (inset 0)
          // still get breathing room.
          paddingBottom: Math.max(insets.bottom, space.sm),
        },
      ]}
    >
      {items}
      {account}
      {menu}
    </View>
  );
}

function NavItem({
  icon,
  label,
  active,
  onPress,
  rail,
  badge = 0,
}: {
  icon: MaterialIconName;
  label: string;
  active: boolean;
  onPress: () => void;
  rail: boolean;
  badge?: number;
}) {
  const t = useTheme();
  // Raspberry is the identity accent, used with purpose for the active
  // destination; everything else is quiet taupe (docs/BRAND.md).
  const tint = active ? t.accent.base : t.text.muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        rail ? styles.itemRail : styles.itemBar,
        active ? { backgroundColor: t.bg.accentSoft } : null,
        pressed ? { opacity: 0.6 } : null,
      ]}
    >
      <View>
        <MaterialIcons name={icon} size={24} color={tint} />
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: t.accent.base }]}>
            <Text style={[styles.badgeText, { color: t.accent.onAccent }]}>
              {badge > 9 ? '9+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
  },
  rail: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  railTabs: { alignItems: 'center', gap: space.xs },
  item: {
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.md,
    paddingVertical: space.xs,
  },
  itemBar: { flex: 1, paddingHorizontal: space.xs },
  itemRail: { width: 60, paddingHorizontal: space.xs, marginBottom: space.xs },
  label: { fontSize: 11, fontWeight: '500' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
