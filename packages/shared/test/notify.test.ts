import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NOTIFY_PREFS,
  NOTIFY_EVENTS,
  notificationText,
  shouldNotify,
} from '../src/notify';

describe('the default event set', () => {
  it('ships the high-frequency event OFF', () => {
    // "A card you own was moved" fires constantly on an active board, and is
    // how notification fatigue starts.
    expect(DEFAULT_NOTIFY_PREFS.myCardMoved).toBe(false);
  });

  it('ships the ones people actually need ON', () => {
    expect(DEFAULT_NOTIFY_PREFS.mention).toBe(true);
    expect(DEFAULT_NOTIFY_PREFS.assigned).toBe(true);
    expect(DEFAULT_NOTIFY_PREFS.dueSoon).toBe(true);
  });

  it('stays small — every addition is a tax on attention', () => {
    expect(NOTIFY_EVENTS.length).toBeLessThanOrEqual(6);
  });
});

describe('shouldNotify', () => {
  const base = {
    event: 'mention' as const,
    recipientUid: 'u1',
    actorUid: 'u2',
    status: 'active',
  };

  it('notifies by default', () => {
    expect(shouldNotify(base)).toBe(true);
  });

  it('NEVER notifies you about your own action', () => {
    // A system that pages you about what you just did looks broken.
    expect(shouldNotify({ ...base, actorUid: 'u1' })).toBe(false);
  });

  it('self-check wins even when the preference is on', () => {
    expect(
      shouldNotify({ ...base, actorUid: 'u1', prefs: { mention: true } }),
    ).toBe(false);
  });

  it('respects an explicit opt-out', () => {
    expect(shouldNotify({ ...base, prefs: { mention: false } })).toBe(false);
  });

  it('falls back to the default when the preference was never set', () => {
    // Treating undefined as "off" would mean nobody is notified until they
    // visit the settings screen.
    expect(shouldNotify({ ...base, prefs: {} })).toBe(true);
    expect(shouldNotify({ ...base, event: 'myCardMoved', prefs: {} })).toBe(false);
  });

  it('respects an explicit opt-IN for a default-off event', () => {
    expect(
      shouldNotify({ ...base, event: 'myCardMoved', prefs: { myCardMoved: true } }),
    ).toBe(true);
  });

  it('respects a muted board', () => {
    expect(
      shouldNotify({ ...base, boardId: 'b1', mutedBoardIds: ['b1'] }),
    ).toBe(false);
  });

  it('ignores mutes for other boards', () => {
    expect(
      shouldNotify({ ...base, boardId: 'b2', mutedBoardIds: ['b1'] }),
    ).toBe(true);
  });

  it('does not notify inactive accounts', () => {
    for (const status of ['pending', 'rejected', 'disabled']) {
      expect(shouldNotify({ ...base, status })).toBe(false);
    }
  });
});

describe('notificationText', () => {
  it('names the actor and the card', () => {
    expect(
      notificationText({ event: 'mention', actorName: 'Sara', cardTitle: 'Fix signup' }),
    ).toBe('Sara mentioned you on “Fix signup”');
  });

  it('degrades gracefully without a card title', () => {
    expect(notificationText({ event: 'assigned', actorName: 'Sara' })).toBe(
      'Sara assigned you a card',
    );
  });

  it('covers every event type', () => {
    for (const spec of NOTIFY_EVENTS) {
      const text = notificationText({
        event: spec.event,
        actorName: 'Sara',
        cardTitle: 'X',
      });
      expect(text.length).toBeGreaterThan(0);
      // It lands on a lock screen: keep it to a glance.
      expect(text.length).toBeLessThan(90);
    }
  });
});
