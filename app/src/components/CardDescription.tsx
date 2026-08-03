import { useEffect, useState } from 'react';
import { CARD_DESCRIPTION_MAX, storedLength } from '@sabeel/shared';
import { RichEditor } from './RichEditor';
import { RichText } from './RichText';
import { Button, Hint, Card as Panel, Row } from './ui';
import { updateCard } from '../cards';
import type { SessionUser } from '../session';

/**
 * The card description, and the DRAFT OF IT.
 *
 * Extracted from `CardScreen` so that typing re-renders this component and
 * nothing else. The draft used to live in screen state, so every keystroke
 * re-rendered the whole card — comments, activity, attachments, subtasks and
 * all. Measured before the extraction: 45ms per keystroke on a card with 25
 * comments, which is a ~22 character/second ceiling and reads as a slide show.
 *
 * That is why `Comments`, `ActivityLog` and `Attachments` are memoised. Those
 * stay: the card screen still holds other per-keystroke state — `newLabelName`
 * in the new-label sheet has exactly this shape — so they are still earning
 * their keep, and removing them would trade a measured win for tidiness.
 *
 * THE DIRTY FLAG IS THE WHOLE POINT OF OWNING THIS LOCALLY.
 *
 * There used to be one shared flag for the title and description editors, which
 * can both be open at once: saving the title cleared it, which re-armed the
 * seeding effect and silently overwrote an unsaved description with the server's
 * copy. Someone typed a long description, fixed the title, and watched it
 * vanish — no error and nothing to undo. Two separate flags fixed it, but only
 * by convention. With the draft and its flag owned here, one editor cannot reach
 * the other's state at all, so that bug is structurally impossible rather than
 * prevented by remembering.
 */
export function CardDescription({
  cardId,
  description,
  user,
  editing,
  onDone,
  run,
  busy,
}: {
  cardId: string;
  /** The SERVER's copy. The local draft is seeded from it and diverges. */
  description: string;
  user: SessionUser;
  editing: boolean;
  onDone: () => void;
  /** Shared with the rest of the screen, so two saves cannot overlap and errors
   *  reach the one banner the screen already renders. */
  run: (fn: () => Promise<unknown>) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(description);
  const [dirty, setDirty] = useState(false);

  /**
   * Pull in server changes, but NEVER over something being typed.
   *
   * Same rule the screen used to apply, now scoped to the one field it is about
   * — which is what makes it correct by construction rather than by keeping two
   * flags in step.
   */
  useEffect(() => {
    if (!dirty) setDraft(description);
  }, [description, dirty]);

  // Measured on the STORED form, not on what was typed: markup counts toward the
  // cap the rules enforce. One helper, so the counter and the write agree.
  const length = storedLength(draft);
  const over = length > CARD_DESCRIPTION_MAX;

  return (
    <Panel>
      {editing ? (
        <>
          <RichEditor
            initialMarkdown={draft}
            onChangeMarkdown={(v) => {
              setDraft(v);
              setDirty(true);
            }}
            placeholder="Write a description"
          />
          {/* Only when it matters. A permanent character counter on every
              description box is the kind of chrome this app exists without;
              silence under 90% and a plain sentence past the limit. */}
          {over ? (
            <Hint>
              {length - CARD_DESCRIPTION_MAX} characters over the{' '}
              {CARD_DESCRIPTION_MAX} limit — shorten it to save.
            </Hint>
          ) : length > CARD_DESCRIPTION_MAX * 0.9 ? (
            <Hint>{CARD_DESCRIPTION_MAX - length} characters left.</Hint>
          ) : null}
          <Row>
            <Button
              busy={busy}
              label="Save"
              disabled={over}
              onPress={() =>
                run(async () => {
                  await updateCard(cardId, { description: draft }, user);
                  setDirty(false);
                  onDone();
                })
              }
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setDraft(description);
                setDirty(false);
                onDone();
              }}
            />
          </Row>
        </>
      ) : description ? (
        <RichText markdown={description} />
      ) : (
        <Hint>No description yet.</Hint>
      )}
    </Panel>
  );
}
