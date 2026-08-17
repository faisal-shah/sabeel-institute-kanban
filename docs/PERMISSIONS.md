# Who can do what

Two separate things decide it, and keeping them separate is the whole design:

- an **org role** — `member`, `organizer` or `admin` — which says what you can do
  across the organisation;
- **ownership of one board**, which says what you can do on that board and
  nothing else.

They are orthogonal. A plain member can own a board. An organizer can own none.
Neither fact tells you anything about the other.

Status gates everything above both of them: nothing at all works unless the
account is `active`.

## The org role

| | member | organizer | admin |
|---|---|---|---|
| Use the app at all | ✓ | ✓ | ✓ |
| Create a board | — | ✓ | ✓ |
| Create a label | ✓ | ✓ | ✓ |
| Rename, recolour or delete a label | — | — | ✓ |
| Stats | — | — | ✓ |
| Approve accounts, change roles | — | — | ✓ |
| See a board you were not added to | — | — | ✓ |

`organizer` grants **exactly one thing**: starting a board. Whoever starts one
owns it, which is how the role turns into authority — but only over what they
started, and only until somebody hands it elsewhere.

**Only an admin sees every board.** Everyone else, organizers included, sees the
boards they are a member of. There is no third case anywhere in the rules.

**Label curation is admin-only** because a label is org-wide: renaming or
deleting one changes cards on boards the person doing it may not even be able to
open. Creating one is not gated beyond being active — it happens while somebody
is looking at a card, it is cheap, and it is reversible by an admin.

## Board ownership

A board carries `boardOwnerUids`. Being in it — **and** being a member of the
board — is what lets you:

- change the board's name and description
- add, rename, reorder and delete columns
- add and remove members
- make another member an owner, or take it away
- archive the board, and restore it
- permanently delete a card (members can only archive)
- delete anybody's comment

It grants nothing anywhere else. Owning three boards and owning none are the same
thing on the fourth.

Everyone else on a board opens the same screen and gets **the member list,
read-only**, with owners marked. That answers "who do I ask to add someone?"
without a trip to an admin — which is what it used to take.

### The creator is protected

The person who created a board cannot be removed from `boardOwnerUids` by
another owner, and cannot be removed from the board either. **Only an admin can**
— including when the creator wants to step down themselves, which they cannot do
unaided.

The rule is phrased on the CHANGE, not on the value: it refuses an update that
*takes* the creator out. A board where an admin has already legitimately demoted
the creator stays perfectly editable, which a value-shaped rule ("the creator
must always be an owner") would have made permanently uneditable instead.

**`removeBoardMember` repeats the check, and that repetition is the real
boundary.** Removing the creator from the board would drop them from
`boardOwnerUids` too, so it is the same act by another route — but that callable
is an Admin SDK batch and rules do not see it at all. The screen disables the
row; a disabled control is an affordance, not a security control.

### Ownership is checked alongside membership, never alone

Every check is "in `memberUids` AND in `boardOwnerUids`". A leftover ownership
entry for somebody no longer on the board therefore grants nothing.

That pairing is load-bearing. There is deliberately **no rule** that
`boardOwnerUids ⊆ memberUids`, because `removeBoardMember` is an Admin SDK batch
that bypasses rules — a subset rule would let an ordinary member removal leave a
board that the next client write bounces, which is how the labels migration broke
board editing. The writer clears both lists instead, and the pairing makes a
missed one inert rather than dangerous.

### A board with no owner

Possible, and deliberately visible rather than hidden:

- the migration writes an empty list where a board's creator had left it;
- an admin can demote the last owner;
- a disabled account keeps its ownership entries, and cannot act on them.

Such a board is administrable **by admins only** until somebody is given
ownership. Nothing is lost and nothing is stuck — an admin opens Board settings
and turns somebody's toggle on.

Disabling an account **warns** the admin when that person is the only owner of
some board, naming them, and then goes ahead. Blocking would mean being unable to
disable a departing colleague until every board they touched had been reassigned,
which is the wrong way round: losing access is the urgent half.

## Where each of these lives

One definition per rule, mirrored rather than duplicated:

| Decision | Server (the authority) | Client (affordance only) |
|---|---|---|
| Create a board | `canCreateBoards()` in `firestore.rules` | `sessionCan.createBoards` |
| Administer a board | `ownsBoard()` in `firestore.rules`, `canManageBoard` in `removeBoardMember` / `countMemberAssignments` | `canManageBoard(user, board)` |
| Take the creator off a board | `keepsCreator()` in `firestore.rules`, repeated in `removeBoardMember` | the creator's row is disabled |
| See a board's contents | `onBoard()` in `firestore.rules` | `canAccessBoard(user, board)` |
| Curate labels | `isAdmin()` in `firestore.rules`, `canCurateLabels` in `deleteLabel` | `canCurateLabels` |
| Stats | `isAdmin()` in `firestore.rules` | `canViewStats` |
| Administer accounts | `checkAccessChange` in `setUserAccess` | `canAdministerUsers` |

`packages/shared/src/access.ts` holds every client-side predicate, and each has
its own body even where two agree today — `canCurateLabels` was once an alias for
the board-authority predicate, which meant that the day board authority became
per-board, a member promoted to run one board would have inherited the power to
strip a label off every card in the organisation.

Attachment downloads are the one place a *rule* cannot decide: Cloud Storage
rules cannot read Firestore, so `getAttachmentUrl` and `deleteAttachment`
authorize in TypeScript with `canAccessBoard`. That function IS the download
boundary, not a mirror of one.

## What this replaced

Until 2026-08-16 board authority was an org role. `manager` meant three unrelated
things at once — administer any board, curate org labels, read stats — and one
consequence was that every manager could see and administer **every** board.
`docs/DEPLOY.md` § Restoring across the board-ownership migration records what a
restore from before that date has to re-run.
