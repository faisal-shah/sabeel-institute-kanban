# Sabeel Institute Kanban — User Manual

*For app version 0.7.2 · July 2026*

Welcome! This guide covers everything you can do in Sabeel Kanban — from finding
your first board to running boards and approving accounts. It is organized by
role: **everyone** starts with Part 1; **managers** add Part 2; **admins** add
Part 3. Part 4 is a quick "How do I…?" index you can skim any time.

The app works the same on the website
(https://sabeel-institute-kanban.web.app) and the Android app — same account,
same data, live everywhere. It is **phone-first**: the mobile layout is its own
thing, not a squeezed desktop board. Throughout this guide, where the phone and
browser layouts differ, you'll see them side by side.

---

## The big picture (2 minutes)

1. **Work lives on boards.** A board is a set of **columns** (like *To Do → In
   Progress → Done*) holding **cards**. Each card is one piece of work.
2. **You see the boards you've been added to.** Managers can see and join every
   board and create new ones; members see only theirs.
3. **A card carries everything about a task** — a description, a priority, a due
   date, the people assigned, labels, and a comment thread. Open it to see or
   change any of that in one place.
4. **Everything is live and shared.** Move a card and everyone watching sees it
   move. **My Work** gathers every card assigned to you, across every board, so
   you never have to go board-hunting to find what's yours.

That's the whole system. Everything below is detail.

---

# Part 1 — For everyone

## 1.1 Signing in

![Sign-in screen](manual/img/signin.png)

Open the app or website and tap **Sign in with Google**. Sign-in is restricted to
your **@oursabeel.com** account — no other account works, and there is no password
to remember.

### First time? You'll wait for approval

![Waiting for approval](manual/img/pending.png)

New accounts land on a **"Waiting for approval"** screen. An administrator has to
approve your account before you can see any boards — this is deliberate, and it
takes them one tap. Leave the page open: it lets you in by itself the moment they
approve you, with no need to sign out or refresh. If you seem stuck here, contact
your admin.

## 1.2 Finding your way around

A slim navigation bar is always in reach — **along the bottom on a phone**, and
**down the left side in a browser**. It carries the places you move between:

<div class="pair">
  <figure><img class="wide" src="manual/img/boards-wide.png" alt="Boards in a browser, with the left navigation rail"><figcaption>In a browser — a rail down the left</figcaption></figure>
  <figure><img class="narrow" src="manual/img/boards-phone.png" alt="Boards on a phone, with the bottom navigation bar"><figcaption>On a phone — a bar along the bottom</figcaption></figure>
</div>

- **Boards** — your board list, the home screen.
- **My Work** — every card assigned to you, across every board.
- **Search** — find a card by its words.
- **Alerts** — what you've been told about; a badge shows how many are unread.
- **More** — everything that isn't a place you go often: **Stats** (managers and
  admins), **People** (admins), and **Sign out**. It also shows the version of
  the app you're running, which is the first thing to quote if something looks
  wrong.

Open a board or a card and the phone's bottom bar steps aside, giving the board
the whole screen; it returns when you go back to a list. In a browser the left
rail stays put — it's narrow enough to keep out of the way.

## 1.3 Your boards

**Boards** lists everything you can open. Tap the **star** beside a board to keep
it at the top; boards you've opened recently follow, then the rest alphabetically.

Every board shows as a card in a grid on wide screens, and as a single-column list
on a phone. Managers create boards with **New board** (see Part 2).

## 1.4 Inside a board

<div class="pair">
  <figure><img class="wide" src="manual/img/board-wide.png" alt="A board in a browser"><figcaption>In a browser — every column at once</figcaption></figure>
  <figure><img class="narrow" src="manual/img/board-phone.png" alt="A board on a phone"><figcaption>On a phone — one column, swipe between</figcaption></figure>
</div>

A board is columns of cards. **In a browser** you see every column at once. **On a
phone** one column fills the screen — swipe left and right to move between them,
or tap the **arrows** either side of the column name. Under the name it tells you
where you are ("2 of 4").

Each card shows, at a glance: its **title**, a **priority badge**, its **labels**,
its **due date** (red if overdue), and the **people assigned** (as name chips) —
so you can read a card without opening it. A card with no priority set shows no
badge. Tap **+ Add card** at the bottom of a column, type a title, press Enter —
that's a new card.

**On a phone the row along the bottom holds everything else**: beside **+ Add
card** are icons to delete the column (managers only), open the board's
**archived cards**, and open **board settings** (managers only). They sit there
rather than in the header so the board's name has the top row to itself.

## 1.5 Working with a card

Tap any card to open the full view.

<div class="pair">
  <figure><img class="wide" src="manual/img/card-wide.png" alt="A card in a browser"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/card-phone.png" alt="A card on a phone"><figcaption>On a phone</figcaption></figure>
</div>

- **Title** — shown in full as the card's heading, however long it is. Tap the
  **pencil** to edit it, then **Save**.
- **Column** — a dropdown showing where the card sits. Change it to move the card
  without leaving it.
- **Description** — formatted text. A small row of buttons above the box gives
  you **bold**, *italic*, a **bulleted list**, a **numbered list** and a
  **link**. Select some words and tap a button, or tap it first and start
  typing. **Save** to keep it, **Cancel** to discard.

  Those five are the whole set, on purpose — no headings, colours, tables or
  fonts. A card is a note about a piece of work, not a document, and the app is
  deliberately not ClickUp.

  Two shortcuts, if you like typing: start a line with `- ` for a bullet or
  `1. ` for a number, and it becomes a list as you go.

  **Web addresses become links by themselves.** Paste or type one and it turns
  into something people can tap — you don't need the link button for that. Use
  the link button when you want a word to carry the address instead, like
  [the handbook](https://example.org).

  **Pasting from elsewhere is safe and simplified.** Copy from a document or a
  web page and anything the card cannot show — headings, colours, tables,
  images — arrives as ordinary text with the bold, italics, lists and links
  kept. Nothing is silently mangled; it is just reduced to what a card holds.
- **Attachments** — files on the card. See below. A card with files shows a
  small **paperclip and count** on the board, so you can see which cards carry
  something without opening them.
- **Subtasks** — see below.
- **Priority** — none / low / medium / high / urgent, shown as a coloured
  **badge** on the card face (e.g. *Urgent*); *none* shows no badge.
- **Due date** — a whole day, not a time. Pick it from a calendar; **Clear**
  removes it. An overdue card shows in red and says *Overdue*.
- **Assignees** — anyone on the board. Tap the **add-person** icon beside the
  *Assignees* heading, then pick a name; the **remove-person** icon on a row
  unassigns them. They show as **name chips** on the card face, the card lands in
  each person's **My Work**, and they're notified.
- **Labels** — a short vocabulary shared by **every** board, shown as coloured
  **badges** on the card face. Press **+** to add one to the shared set and this
  card at once.
- **Comments** — discuss the work, with the same five formatting buttons the
  description has. Type **@** to pull someone in and they're notified; that
  works anywhere in a sentence, not only at the end. A list of everyone on the
  board appears above the box — **anyone assigned to the card comes first**, and
  it scrolls if the board is large. Keep typing to narrow it, or tap a name. On a computer you can stay on the keyboard:
  **↑/↓** to move, **Enter** or **Tab** to pick, **Esc** to dismiss.

  The list closes when you click away, and picking a name never loses your place
  in the box.
- **Subscribe** — the **bell** in the card's header. Tap it to hear about new
  comments on a card even when it isn't assigned to you; tap again to stop. It
  turns solid while you're subscribed. Subscribing is about the *conversation* —
  nothing else on the card notifies you. A card assigned to you already sends you
  its comments, but subscribing as well means you keep hearing about it if you're
  later unassigned.

  You can edit your own comment with the **pencil**, and the **@** works there
  too — mention someone in an edit and they're told, once. Correcting the wording
  afterwards doesn't notify anyone again.
- **Activity** — who changed what, and when, including subtasks being linked and
  unlinked. Written by the system, so no one can edit it.

Ordinary actions — move, archive, assign, delete — are **icons**, not big
buttons, so a card stays compact. Each icon has a label for screen readers.

**The back arrow is the same everywhere.** Any screen you opened from another one
has a **←** in its top right; it never appears as the word "Back".

### The formatting buttons

<div class="pair">
  <figure><img class="wide" src="manual/img/format-wide.png" alt="Editing a card description in a browser, with the formatting row above the box"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/format-phone.png" alt="Editing a card description on a phone, with the formatting row above the box"><figcaption>On a phone</figcaption></figure>
</div>

The same five buttons sit above the description and above the comment box, on a
phone and on a computer alike. A button takes on a **soft coloured background**
while the cursor sits in text it already applies to, so you can tell bold from
not-bold without selecting anything first. They are icons, like the rest of the
app; each one is labelled for screen readers.

You are editing the finished text, not writing codes: what you see in the box is
what everyone else sees on the card.

### Attachments — putting files on a card

Tap the **paperclip** beside the *Attachments* heading.

**On a computer** that opens your file browser. **On a phone** you're asked where
from: **Choose a file**, **Photo library**, or **Take a photo** — so a receipt or
a whiteboard can go straight onto the card without saving it anywhere first.

- **Up to 10 MB per file**, any type, as many as you like on one card.
- Each file shows its **name, kind and size**. Tap it to **open it** — a PDF in
  your PDF reader, a photo in your gallery, everything else in whatever app you
  normally use for it.
- The **bin icon** removes a file. **Anyone on the board can remove any file**,
  not just whoever added it — attaching the wrong thing is an easy mistake and
  shouldn't need chasing someone else. It asks first, and it cannot be undone.
- Attaching and removing both appear in **Activity**, with who did it.

While a file is uploading you'll see a progress bar. If it doesn't finish — you
lost signal, or closed the app — the file simply isn't added; nothing half-made
is left on the card.

Files live with the card. Move the card to another board and they go too;
archiving a card keeps them. Deleting a card permanently deletes its files.

### Finding an archived card

Archiving takes a card off the board but **keeps it**. Tap the **archive icon**
— in the row along the bottom on a phone, in the header in a browser — to see
everything archived on that board, **most recently archived first**. Each card
carries two icons: **restore** puts it back on the board, and the red **bin**
deletes it permanently. Anyone who can archive can restore; permanent deletion
stays with managers and admins, and it **asks first** because nothing brings a
deleted card back.

If the column a card came from has since been deleted, it comes back in the
**first column** and says so — rather than refusing to come back at all.

### Subtasks — breaking a card down

A card can be broken into **subtasks**, which are simply other cards on the same
board, linked to it.

- Type a title under **Subtasks** and tap **+** to create one. It's made in the
  same column as the card you're on.
- The **link icon** beside it attaches a card that's already on the board. There's
  a filter box, because a board can hold a lot of cards.
- Tap any subtask to **jump straight to it**; it opens like any other card, with
  its own column, assignees, due date and comments. The subtask shows
  **Subtask of** at the top — tap that to come back up.
- The unlink icon separates the two cards again. **It does not delete anything** —
  the subtask stays on the board as an ordinary card.
- A parent card shows a small **N subtasks** marker on the board, so you can tell
  at a glance that it breaks down further.

A subtask is a real card, not a checklist item: it moves through columns, gets
assigned, and can be discussed like anything else. A card can be a subtask of only
one other card, and both must be on the same board.

### Sharing a card

The top of every card shows **which board it's on** — tap it to jump straight to
that board. Beside the back arrow is a **Share** button. It hands the card's link
to your phone's share sheet — WhatsApp, Google Chat, a text, whatever you use — or,
on a computer, copies the link to paste anywhere.

Whoever opens the link lands directly on that card, as long as they're signed in
and a member of its board. If they aren't a member, or the card has been deleted,
the link says so instead of opening a blank screen.

### Moving cards

**In a browser**, drag a card between columns. **On a phone**, long-press the card
and pick the destination column — dragging isn't used on a screen that already
swipes between columns, where a drag would be ambiguous.

## 1.6 Doing several cards at once

<div class="pair">
  <figure><img class="wide" src="manual/img/bulk-wide.png" alt="Selecting several cards in a browser"><figcaption>In a browser — tick the boxes</figcaption></figure>
  <figure><img class="narrow" src="manual/img/bulk-phone.png" alt="Selecting several cards on a phone"><figcaption>On a phone — long-press, then tap</figcaption></figure>
</div>

Select several cards — **tick the boxes** in a browser (hold **Shift** for a
range), or **long-press** one on a phone and then tap the rest. A bar appears with
what you can do to the whole selection: **move**, **assign**, **archive**, or
(managers) **delete**. It shows how many are selected, and the **✕** beside that
count leaves selection mode without doing anything.

You can also **copy or move the selection to another board** — pick one of your
boards, then a column in it.

- A **move** takes each card over exactly as it is: comments, history and
  attached files all travel with it, because it stays the same card.
- A **copy** leaves the originals alone and starts **fresh** cards — same title,
  description, priority, due date and labels, but **no comments, no history and
  no files**. A copy is new work, not a second pointer at the same work.

**Labels come with both**, since they are shared by every board and mean the same
thing wherever a card lands. Anyone **not a member of the destination board is
unassigned**, though; the sheet tells you before you confirm.

## 1.7 My Work

<div class="pair">
  <figure><img class="wide" src="manual/img/mywork-wide.png" alt="My Work in a browser"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/mywork-phone.png" alt="My Work on a phone"><figcaption>On a phone</figcaption></figure>
</div>

Everything assigned to you, across every board, grouped by urgency: **overdue**
first, then **today**, then the **next seven days**, then everything else. This is
the fastest way to see what needs you — especially on a phone. Tap any card to
open it.

## 1.8 Search

<div class="pair">
  <figure><img class="wide" src="manual/img/search-wide.png" alt="Search in a browser"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/search-phone.png" alt="Search on a phone"><figcaption>On a phone</figcaption></figure>
</div>

Search lists **every card on every board you're on**, newest first — you don't
have to type anything, and **the keyboard stays shut** until you tap the box, so
you can browse and filter without it covering half the results. Typing narrows by
title and description; it matches whole words and parts of words, but not
misspellings.

Above the results are **filter chips**. The first row is one tap each:

- **Archived** — shows **only** archived cards, and hides the live ones. This is
  the other way to find something you archived, alongside a board's own archive.
- **Overdue** — only cards past their due date.
- **Urgent** / **High** — only cards at that priority.

The second row starts with **Filters**, which opens a panel holding the two
filters that are *lists* rather than switches:

- **Board** — narrow to a single board.
- **Label** — pick one or several; you get cards carrying **any** of them.

Whatever you pick comes back as **its own chip** in that second row, so the
answer to "what am I filtering by?" is always one row you can read at a glance —
and tapping a chip removes that filter, the same gesture as everything else. When
anything is active, a **clear-filters** icon appears at the end of the row and
switches everything off at once. It is only there when there is something to
clear.

**Your search survives leaving it.** Open a result, then come back, and the text,
the chips and the board and label picks are all as you left them — you don't have
to rebuild a search to look at a second card. Filters reset when the app is
reloaded, because a filter you set last week isn't one you meant to still be
looking through today.

Search looks at the WORDS you see, not at the formatting, so searching for
`bold text` finds a card that shows **bold** text. One honest limit: it searches
the words of a link, not the address behind it.

If there are more results than fit on screen the app says so, rather than quietly
cutting the list short. Tap a result to open the card.

## 1.9 Notifications

<div class="pair">
  <figure><img class="wide" src="manual/img/alerts-wide.png" alt="Alerts in a browser"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/alerts-phone.png" alt="Alerts on a phone"><figcaption>On a phone</figcaption></figure>
</div>

**Alerts** shows everything you've been told about, so nothing is lost if a phone
notification is missed or swiped away. You're alerted when a card is **assigned**
to you, when someone **@mentions** you in a comment, and — for admins — when a
**new account** is waiting. Unread items are outlined; tap one to go straight to
what it is about — the card for a card alert, **People** for an account waiting
for approval. Tapping the notification on your phone's lock screen or in its
notification tray does the same thing, including when the app was not running.

Each item has a **✕** to dismiss it. At the top of the list, **✓✓** marks
everything read and the **sweep** icon empties the inbox — that one asks first,
because dismissed alerts cannot be brought back.

Alerts keeps the last **90 days** and clears out anything older on its own, so
the list stays worth reading. Nothing is lost by it — a card keeps its own
comments and activity permanently.

The **gear** opens notification settings, where each kind of notification has an
on/off switch and you can **mute** individual boards with the bell. One kind is
off by default — "a card assigned to you was moved" — because on a busy board it
fires constantly. **You are never notified about your own actions.**

The app asks for notification permission when you sign in — allow it on each
device where you want push notifications. Notifications follow the account signed
in on the device.

## 1.10 Signing out

**More → Sign out** (in the navigation bar). Signing out clears your session on
this phone or browser and stops it receiving that account's notifications. The
next sign-in shows Google's account chooser, which is how you switch accounts.

---

# Part 2 — For managers

Managers can see and join **every** board, create new ones, and shape a board's
columns and membership. They also curate the org-wide **labels** — anyone may add
one, but only managers rename or delete. There are no per-board roles: a manager
can act on any board.

## 2.1 Creating a board

On **Boards**, tap **New board** and give it a name. Every new board starts with
three columns — **To Do**, **In Progress**, **Done** — which you can rename or
replace in Settings.

## 2.2 Board settings

<div class="pair">
  <figure><img class="wide" src="manual/img/settings-wide.png" alt="Board settings in a browser"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/settings-phone.png" alt="Board settings on a phone"><figcaption>On a phone</figcaption></figure>
</div>

Open a board and tap its **settings** (the gear — along the bottom on a phone,
in the header in a browser). From here:

- **Columns** — add, rename, and reorder. Tap the **pencil** beside a column's
  name to rename it; drag the handle to reorder. A column can only be deleted
  once it's **empty**, so no cards vanish with it, and deleting one **asks first**
  because it cannot be undone. To clear a column quickly, select its cards and
  move or archive them in one go.
- **Labels** — one vocabulary shared by **every board**, not just this one.
  Adding, renaming or deleting a label here changes it everywhere, and the panel
  says so. Use the **pencil** to rename, the **palette** to cycle its colour, and
  the **bin** to delete — deleting asks first and tells you how many cards carry
  it, because it comes off all of them.

  Colours come from a fixed palette so they stay readable on the app's warm
  surfaces. Names are short by design, and two labels can't share a name even in
  different capitals — a card face shows the name and nothing else, so "Urgent"
  and "urgent" would be impossible to tell apart.

  **Anyone can add a label**, not just managers: open any card and press **+**
  beside its labels. It joins the shared set and is applied to that card at the
  same time. Only managers rename or delete.
- **Members** — who can see the board. Tap the **add-person** icon beside the
  *Members* heading to see who else can be added, and tap a name to add them.
  Removing someone (the **remove-person** icon on their row) also **unassigns them
  from that board's cards**; you're told how many before it happens. Your **own**
  row shows a **leave** icon instead — use it to step off a board you no longer
  work.
- **Archive** — hides the board from everyone's list. Boards are never deleted
  outright.

**Renaming a column without opening Settings.** Column names are editable from
the board itself too — tap the **pencil** beside the column name (on a phone, in
the column header at the top; on a wide screen, at the top of each column). Only
managers and admins see it; everyone else just sees the name.

**Joining or leaving a board yourself.** Because managers and admins can open
**any** board's settings, a board you haven't joined shows a **Join this board**
button at the top of **Members**. Joining makes you assignable to its cards and
lists the board under your own boards; **Leave** reverses both. Only your *own*
membership is self-service — everyone else is added and removed by a manager or
admin.

## 2.3 Archiving a board

Boards **archive**, they don't get hard-deleted, so nothing is lost by accident.
Managers and admins see an **Archived** section at the bottom of the board list —
open one from there and use **Restore** in its settings to bring it back. It stays
collapsed unless something is actually archived.

Archiving a board **puts its work away too**: its cards drop out of everyone's
**My Work** and **Search**, and it stops sending notifications and due-date
reminders. Nothing is deleted — restore the board and all of it comes straight
back, exactly as it was.

## 2.4 Deleting cards

**Members archive** cards; **managers and admins can delete** them permanently.
Archiving keeps a card out of the way but recoverable; deletion is final and takes
its comments and history with it. When in doubt, archive.

## 2.5 Stats — how the boards are being used

<div class="pair">
  <figure><img class="wide" src="manual/img/stats-wide.png" alt="Stats in a browser"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/stats-phone.png" alt="Stats on a phone"><figcaption>On a phone</figcaption></figure>
</div>

**More → Stats.** Managers and admins only. It answers "is this being used, and
by whom?" — nothing about individual performance, and nothing you can drill into
a person with.

Three controls sit above the chart:

- **The board** — one board, or **All boards**. Archived boards stay in the list
  and are marked, because archiving a board doesn't retract the work that
  happened on it.
- **Daily / Weekly / Monthly** — the three calendar icons. Weeks run
  **Sunday to Saturday** and months are real calendar months, not rolling
  windows, so a week here is the week everyone means.
- **What to measure** — cards created, cards archived, comments, **active
  people**, files added, files removed.

**Active people** counts how many *different* people did something that day — not
who signed in. Opening the app changes nothing; creating a card, commenting or
attaching a file does.

The chart scrolls sideways when there are more bars than fit; **tap a bar** for
its exact figure and date. The **last bar is outlined rather than filled** because
today isn't finished yet — a half-day next to whole ones would read as a decline
that hasn't happened. Below it, **Files stored** gives the total size held across
all attachments.

History goes back **twelve months** and is kept indefinitely. Figures for past
days are counted once and stored, so the screen opens instantly however much
history there is; only the current day is worked out live.

---

# Part 3 — For admins

Admins manage **people**. Everything a manager can do, an admin can do too — plus
approve accounts and change roles.

## 3.1 The People screen — approving new users

<div class="pair">
  <figure><img class="wide" src="manual/img/people-wide.png" alt="The People screen in a browser"><figcaption>In a browser</figcaption></figure>
  <figure><img class="narrow" src="manual/img/people-phone.png" alt="The People screen on a phone"><figcaption>On a phone</figcaption></figure>
</div>

Open **More → People**. It lists everyone who has signed in. A new account
waits on **pending** and sees nothing until you approve it — approve it here and
their screen unlocks live, wherever they are. Admins also get a push notification
when someone is waiting.

## 3.2 Managing a user

Each person's role and access are shown as **controls set to their current
value** — a **role** (member / manager / admin) and an **Active** toggle — rather
than buttons you press. You change someone by moving the control to where you want
it:

- **Member** — sees only the boards they've been added to.
- **Manager** — can see and join every board, create boards, edit columns/labels/
  membership, and delete cards.
- **Admin** — everything a manager can, plus approve accounts and change roles.
- **Active** — turn off to **disable** an account. Whatever they have open
  switches to an "Account disabled" screen straight away, wherever they are, and
  they cannot sign back in. **Their card assignments are kept** so nothing is
  left ownerless — a manager can reassign at leisure. Turn back on to restore.
  Nothing is ever deleted.

Every change asks you to **confirm**, spelling out what it will actually let that
person do, so a stray tap can't promote or lock out anyone. You **cannot change
your own access** — that's what stops an admin locking themselves out.

---

# Part 4 — "How do I…?" quick answers

**…get in for the first time?**
Sign in with your @oursabeel.com Google account, then wait on the approval screen
until an admin lets you in (it updates by itself).

**…add a card?**
Open the board → **+ Add card** at the foot of a column → type a title → Enter.

**…change a card's priority, due date, or assignees?**
Open the card → tap a priority / due date / **Assign someone** → choose.

**…move a card to another column?**
In a browser, drag it. On a phone, long-press it and pick the column — or open the
card and change the **column** dropdown.

**…move or copy cards to a *different board*?**
Select them (tick boxes, or long-press on a phone) → **move**/**copy to another
board** → pick the board and column.

**…find a card I can't see?**
**Search** (its words), or **My Work** if it's assigned to you.

**…share a card with a colleague?**
Open the card → **Share** → send the link. They open it and land on the card (if
they're a member of its board).

**…see everything assigned to me?**
**My Work** — grouped overdue → today → next seven days.

**…stop a noisy notification?**
**Alerts → Settings** → switch off that kind, or **mute** the board.

**…create a board?** *(managers)*
**Boards → New board** → name it.

**…rename or add columns?** *(managers)*
Open the board → **settings** → Columns.

**…add a label?** *(anyone)*
Open any card → **+** beside its labels. Labels are shared by every board, so it
appears everywhere at once.

**…rename or delete a label?** *(managers)*
Open any board → **settings → Labels**. Deleting removes it from every card that
carries it, and tells you how many first — counting live cards and archived ones
separately, because a card in the archive is one no board will show you.

**…follow a card that isn't mine?**
Open it → the **bell** in the header. It appears under **My work → Subscribed**,
and you'll hear about new comments.

**…find every card with a particular label?**
**Search → Filters → Label**, and pick one. Pick more than one and you get cards
carrying **any** of them. Each pick becomes a chip; tap it to drop it.

**…search within one board only?**
**Search → Filters → Board**. It becomes a chip like everything else — tap the
chip to go back to searching everywhere.

**…clear every filter at once?**
The **clear-filters** icon at the end of the chip row. It only appears when
something is actually filtering.

**…see how much the boards are being used?** *(managers/admins)*
**More → Stats** — cards created and archived, comments, how many different
people were active, and files, by day, week or month.

**…add someone to a board?** *(managers)*
Board **settings → Members** → add them. (They must be an approved account first.)

**…delete a card?** *(managers/admins)*
Open the card → delete. Members **archive** instead.

**…let a new team member in?** *(admins)*
They sign in once with Google → **More → People** → **Approve** their pending
card.

**…make someone a manager or admin?** *(admins)*
**People** → their card → set the **role** → confirm the dialog.

**…disable someone who left?** *(admins)*
**People** → their card → **Active** off → confirm. Their assignments and history
stay.

---

## Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| "Waiting for approval" after signing in | Your account awaits admin approval | Ask your admin; the screen unlocks by itself once approved |
| You can't sign in at all | Only @oursabeel.com Google accounts are allowed | Use your work account, not a personal one |
| A card's due date is red | The card is overdue | Open it and update the date, or get the work done |
| "This card is unavailable" from a shared link | You're not a member of its board, or the card was deleted | Ask a manager to add you to the board |
| A column won't delete | It still has cards in it | Move or archive its cards first, then delete the column |
| Removing a board member warns about cards | They're assigned to cards on that board | Those cards are unassigned automatically; the warning just says how many |
| No push notifications arriving | Permission not granted on this device, or that kind is muted | Allow notifications when the app asks, and check **Alerts → Settings** |
| A red "Live data error" bar | The app couldn't reach the server or was refused | It clears when the connection recovers; if it persists, tell Faisal what the bar says |
| Text you underlined loses its underline | Cards hold bold, italic, lists and links — underline is not one of them, and a keyboard shortcut can set it even though no button offers it | Use **bold** or *italic* instead |
| Pasted text lost its headings or colours | Only the five formatting options survive a paste — but every word does | Nothing to do; reformat the parts you want bold or bulleted |

*Manual source: `docs/USER-MANUAL.md`. Its images live in `docs/manual/img/` and
are regenerated from the seeded dev stack by `node scripts/manual-shots.mjs`
(every one except `pending.png`, which needs an unapproved account). The PDF is
built from the markdown by `python3 docs/render-manual.py`. When the app
changes, update all three in the same batch — text, images, PDF.*
