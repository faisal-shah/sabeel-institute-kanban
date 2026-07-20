# Sabeel Kanban — user guide

A shared board for tracking work, on your phone and in a browser. Everything you
see updates live: when a colleague moves a card, it moves on your screen too.

## Getting in

Sign in with your **@oursabeel.com** Google account. No other account can be
used, and there is no password to remember.

The first time, you will see **Waiting for approval**. An administrator has to
approve your account before you can see any boards — this is deliberate, and it
takes them one tap. Leave the page open: it lets you in by itself the moment
they do, with no need to sign out or refresh.

## Roles

| | Member | Manager | Admin |
|---|---|---|---|
| Use the boards you are added to | ✓ | ✓ | ✓ |
| Add, edit, move and comment on cards | ✓ | ✓ | ✓ |
| See and join **every** board | | ✓ | ✓ |
| Create boards, edit columns, labels and membership | | ✓ | ✓ |
| Delete cards permanently | | ✓ | ✓ |
| Approve accounts and change roles | | | ✓ |

Members archive cards rather than deleting them, so nothing is lost by accident.

**Archiving a board** hides it from everyone. Managers and admins see an
**Archived** button at the bottom of the board list — open one from there and use
**Restore** in its settings to bring it back. It stays collapsed unless something
is actually archived, so it costs nothing when you are not using it.

### For admins: the People screen

**People** lists everyone who has signed in. A new account waits on **pending**
and sees nothing until an admin approves it.

Each person's role and access are shown as controls set to their *current* value
— a role segment and an **Active** toggle — rather than buttons you press. You
change someone by moving the control to where you want it, and every change asks
you to confirm, spelling out what it will actually let that person do. You cannot
change your own access; that is what stops an admin locking themselves out.

Disabling someone signs them out immediately but **keeps their card
assignments**, so nothing is left ownerless — a manager can reassign at leisure.

## Boards

**Boards** lists everything you can open. Tap the circle beside a board to
**star** it and keep it at the top; boards you have opened recently follow, then
the rest alphabetically.

Managers create boards with **New board**. Every new board starts with To Do, In
Progress and Done — rename or replace them in **Settings**.

### Board settings (managers)

- **Columns** — add, rename and reorder. A column can only be deleted once it is
  empty, so no cards can disappear with it. To clear one quickly, select its
  cards and move or archive them in one go.
- **Labels** — a short, shared vocabulary for the board. Colours are chosen from
  a fixed palette so they stay readable in both light and dark themes.
- **Members** — who can see the board. Removing someone also unassigns them from
  that board's cards; you are told how many before it happens.
- **Archive** — hides the board from everyone's list. Boards are never deleted
  outright; an admin can restore them.

## Cards

Tap **+ Add card** at the bottom of a column, type a title, press Enter.

Open a card for the full view:

- **Description** — plain text. Type whatever you like; it appears exactly as
  you typed it. **Save** to keep the change, **Cancel** to discard it.
- **Priority** — a coloured dot on the card face.
- **Due date** — a whole day, not a time. Pick it from a calendar; **Clear**
  removes it. An overdue card shows in red.
- **Assignees** — anyone on the board. Assigned cards appear in that person's
  **My work**.
- **Labels** — whatever the board defines.
- **Comments** — type **@** followed by a name to pull someone in; they are
  notified.
- **Column** — a dropdown showing where the card currently sits. Change it to
  move the card without leaving it, so everything about a card is editable in
  one place.
- **Activity** — who changed what, and when. Written by the system, so it cannot
  be edited by anyone.

### Moving cards

**In a browser**, drag a card between columns.

**On a phone**, one column fills the screen — swipe left and right to move
between them, and the header shows where you are ("In Progress, 2 of 4"). To
move a card, long-press it and pick the destination from the dropdown. Dragging
is deliberately not used here: on a screen that already swipes between columns, a
drag would be ambiguous.

### Doing several at once

Select multiple cards — tick the boxes in a browser (hold **Shift** to select a
range), or long-press on a phone and then tap. With a selection active you can
**move**, **assign**, **archive** or (managers) **delete** them all together.

## My work

Everything assigned to you, across every board, grouped by urgency: overdue
first, then today, then the next seven days. This is the fastest way to see what
needs you — especially on a phone.

## Search

Searches card titles and descriptions across every board you belong to. It
matches whole words and parts of words, but not misspellings. Archived cards are
excluded unless you ask for them.

## Notifications

**Alerts** shows everything you have been told about, so nothing is lost if a
phone notification is missed or swiped away. Unread items are outlined; tap one
to jump straight to the card.

Under **Settings** there you can turn each kind of notification on or off, and
**mute** individual boards. One is off by default — "a card assigned to you was
moved" — because on a busy board it fires constantly.

You are never notified about your own actions.

## Light and dark

The app follows your device's appearance setting. There is nothing to configure.

## If something looks wrong

A red bar reading **Live data error** means the app could not reach the server or
was refused. It clears by itself when the connection recovers. If it persists,
tell Faisal what the bar says — the wording identifies the query.
