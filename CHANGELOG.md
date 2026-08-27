# What changed

Written for the person using MoleBridge, not for whoever built it. Newest first.
This file is the one source: the app renders its own patch notes from it, and
`tools/version-check.mjs` fails the build if the two disagree.

## 1.11.1 — ITERATION

The warm-up builder used to arrive with a day of the school week already typed
into the box, and its first example was the same word with a number after it.

A pre-filled default is the strongest wording in a field — it is the example you
read before you have decided what belongs there — and that one said the work runs
on a timetable. If you are working through this at home, or across three
evenings, it was quietly telling you the tool belongs to somebody else. The box
now starts on GASLAWS, and the examples name the chemistry or where you are in
it. No day of the week can get back into that field: the check that reads these
screens now forbids all seven by name.

**Still not fixed:** the sets differ in what kind of problem they pose rather
than in how hard the arithmetic is, so a longer set is not a harder one in every
sense of the word. Set 3 asks nine steps against set 1's six; set 4 asks seven.

## 1.11.0 — CAPABILITY

**Practice can now give you percent yield problems.** It offered three sets while
the graded route offered four, so the one kind of problem you were most likely to
want to rehearse was the one you could not ask for. Worse, practice's third set
was called "Limiting reagent and yield" and has never once posed a yield — if you
chose it to prepare for that, you got a set without it in.

The three places that name the sets — practice, the graded route, and the warm-up
builder for whoever sets the work — had drifted into three different lists. They
now read one, so a set is called the same thing everywhere and offers the same
problems.

**And if you have one step at a time turned on, the app now tells you which step
you are on.** That setting hid the row of steps, which is what it is for, and hid
the line above it too — leaving a chain of six boxes that all looked the same,
with no way to tell the fourth from the second. The line stays now, and it names
the step as well as the problem: *Problem 2 of 5. Step 4 of 6: Mole ratio.*

**Still not fixed:** the sets differ in what kind of problem they pose rather than
in how hard the arithmetic is, so a longer set is not a harder one in every sense
of the word. Set 3 asks nine steps against set 1's six; set 4 asks seven.

## 1.10.1 — ITERATION

The offline copy of the app is complete for the first time.

1.10.0 fixed one reason it was not: two files on the list were settings the host
reads rather than pages it serves. The check added in that same release then ran
against the live site and found the rest — three more entries named for what the
file is called on disk rather than what the address actually is, so the host
answered each of them with a redirect.

**Saving that list is all-or-nothing**, so any one bad entry meant the app kept a
handful of files instead of all of them. If you have opened MoleBridge with no
connection and found it half-there, this is the release where that stops.

**Also in the welcome:** it described how one of the three doors works and called
it a session, which is a word the app never uses anywhere else. It now says what
is actually in the app — Learn, Practice and the graded route — and makes plain
that only the last of those asks you for anything.

## 1.10.0 — CAPABILITY

If you are the one setting the work, the app now tells you there is a page for
you.

**There always was one.** It builds a warm-up link that opens straight into a
short set, and it decodes the codes handed back to you so you can see which
steps were hard. The only way to reach it was to already know the address — fine
where one person owns the projector, and nonsense for a family, a co-op, or
anyone working with one or two learners, where the same person is both the one
learning and the one setting it.

It is now named in the welcome, and afterwards it lives behind the ⓘ with the
rest of that text. **And it says to bookmark it** — both in the app and on the
page itself — because nothing signs you in, so the address is the only way back.

**The page moved from /teacher/ to /codes/.** The words on it stopped assuming
one particular kind of room in 1.6.0 and the address did not, so a link to it
announced whose app this was before the page had loaded. **Any bookmark you already have keeps
working**, permanently.

**Also, and this one was serving badly:** the list of files the app saves for
offline use included two that the host never serves — they are settings the host
reads and keeps. Saving the list is all-or-nothing, so it failed every time, and
the app fell back to keeping three files instead of sixty-seven. **If you have
used MoleBridge with no connection and found it half-there, that is why.** The
list is correct now, and a check runs against the live site after every release
to confirm every file on it is really being served.

**What is still missing.** Nothing tells you, before you hand the app to
somebody, what it does and does not do — the welcome is written to whoever is
learning. That page does not exist yet.

## 1.9.0 — CAPABILITY

Nothing you work out gets taken away from you.

**The calculator hands its answer back.** Work out a number and there is now a
button that puts it straight into the box you were typing in — with the unit you
had already started, so you are not adding that by hand either. Before this you
read the number off the panel, closed it, and typed it again from memory.

That was not just tedious. MoleBridge tells you which *mistake* produced your
number, so a slipped digit while copying got reported back to you as a
misconception you never had.

**The steps you have finished now show what you put in them.** The row of steps
across the top of a problem used to show only which ones were done. Each finished
one now carries your number, so when step 5 needs the moles you worked out at
step 3, they are on the screen in front of you rather than in your memory or on a
scrap of paper.

**It shows what you typed, not a tidied-up version.** If you rounded and it was
close enough to be accepted, you get your rounded number back. That is
deliberate: rounding early is one of the mistakes MoleBridge is built to name,
and silently handing you a better number than the one you wrote would repair that
mistake behind your back and never tell you that you had made it.

**Still yours alone.** What you type stays on this device. It is not in the code
you hand in, it is not in a problem report, and there is nowhere for it to go —
the code has only ever carried counts.

**And it works with *Just the step I am on* turned on.** That setting hides the
row of steps, which is the point of it — but it was hiding your numbers with
them, and the next step needs those. There is now **What you have so far** in
their place: folded away so the screen still stays quiet, and holding everything
you have worked out when you open it. Less on the screen, not less within reach.

## 1.8.0 — ITERATION

The notes stop after the newest few, and the rest have a page of their own.

**What was wrong.** Every surface that showed release notes showed all of them.
Thirty releases, in a panel — so the way out sat under everything you had not
asked to read, and in the ⓘ everything below it (where the chemistry comes from,
how to report a problem, the accessibility statement) was pushed off the bottom.

**Now:** the newest five, and then a link to **everything that has changed** —
a page inside MoleBridge that carries all of them. It is cached with the app, so
it opens with no connection like everything else here, and it is not a link off
to a website for programmers.

If MoleBridge updated more than five times since you last had it open, it still
says how many — being told there are nine and shown five is honest; being shown
nine is a wall.

**Also: every dialog is now checked for the way out.** A panel whose only exit
is under everything it just showed you charges a scroll through the thing you
opened it to get past. Nothing here had that defect; there was nothing stopping
the next one from having it, and now there is.

**And some buttons were smaller than they looked.** Any button that is really a
link — the one back to MoleBridge from a page, and the new one to the history —
was 36 pixels tall instead of 44, because of how a browser lays out a link
compared to a button. On a touchscreen those eight pixels are the difference
between hitting it and hitting it on the second try. They are all 44 now.

**What is still missing.** The history page lists releases, and nothing on it
lets you search or jump to one. With thirty entries that is a scroll.

## 1.7.0 — CAPABILITY

MoleBridge tells you what changed, instead of just changing.

When a new version was ready you were offered it, you pressed **Use it now**, and
the app came back different with no account of what was different. The notes
existed — behind the ⓘ, under **What changed** — which is a place you only open
if you already suspect there is news.

**Now they come to you.** The first time you open MoleBridge after it updates
itself, it shows you what changed. If you were away a while and it updated more
than once, you get all of them rather than only the most recent, because being
told about one of four changes is how an app comes to seem like it changes for
no reason. Press **Got it** and it does not come back.

**It waits for a moment when nothing is in front of you.** If you have a problem
open and MoleBridge is offering it back, or you followed a warm-up link and are
already looking at the first question, that is not the moment for release notes.
They are not lost — you get them next time you open the app with nothing waiting.

**Somebody opening MoleBridge for the first time is not shown any of this.**
There is no news for somebody with no before; they get the welcome instead.

**Also: the welcome was wrong about your work.** It said nothing was kept after
you closed the tab and that stopping halfway meant starting again. That stopped
being true in 1.2.0, when an unfinished set started surviving the tab closing,
and nobody went back to correct the sentence. It now says what is actually
kept — the problem you are in the middle of, your place in the lessons, and how
you have set it up to read — and that every bit of it stays on this device.

**And these notes have been rewritten, all of them, back to the first release.**
They were written for one group of students in one room, and they named things a
family teaching at home does not have: a board at the front, one particular
piece of software for handing work in, thirty people working the same problems
at once. Nothing about what happened in each release has changed. Only the room
the sentences put around you.

**What is still missing.** The notes tell you what changed since you last had
MoleBridge open on **this device**. Open it somewhere new and it has no way to
know what you have already read, so it shows you the release you are on and
nothing further back.

## 1.6.0 — ITERATION

MoleBridge no longer assumes you are learning in one particular place.

It was built for one high school chemistry group and the words came out that
way. It named a room with a whiteboard at the front, one piece of software for
handing work in, and thirty people doing the same problems at once. All of that
was true where it was built and told everybody else — a family teaching at home,
a group of four, a tutor, an adult going back over this — that they were reading
over somebody's shoulder.

**Nothing about how it works has changed.** The same problems, the same codes,
the same page for whoever is marking. Only the sentences: whoever set the work,
wherever you hand your work in, the codes you were handed. Twenty-nine places
said it the old way.

**Also:** the Learn screen said "Seven lessons" when there are eight. The check
that was added to stop exactly that only read the home screen; it now reads
every screen.

## 1.5.0 — CAPABILITY

Practise one step, as many times as you like.

If you keep getting the mole ratio upside down, you should not have to walk five
other steps to reach the one you are working on. **Practise one step** on the
Learn screen lets you pick a step and answer as many as you want — different
numbers every time, the same move.

It is also offered on the page about a mistake you just made, which is the
moment you are most likely to want it.

**Nothing is counted at you.** No score, no streak, no target, nothing to unlock.
Each answer tells you which mistake it was, the same as anywhere else in the app.
If the same mistake comes up three times it says so once, with what fixes it, and
then leaves you alone.

**You stop when you want.** When you do, it tells you what happened — how many,
how many were right, and which mistake came up most. If that mistake stopped
happening partway through, it says so, because that is the useful thing to know.
It will not tell you to try again or to keep going.

## 1.4.0 — CAPABILITY

A warm-up link, for five minutes at the start of a lesson.

On the page for whoever sets the work there is now **Make a warm-up link**. Type
a word for the day, pick a set and how many problems, and it gives you a link.

Hand it over however you already hand things over. A student who opens it goes
**straight into the first problem** — no roster number, no assignment key, no
setting anything up. Everyone who opens the same link gets the same problems, so
they can be talked through together afterwards.

Nothing is collected and there is no code at the end. It is practice with a
shared word, which means the answer is still there to ask for.

Also: the home screen said "Seven short lessons" when there are eight. It no
longer states a number that can go out of date.

## 1.3.1 — ITERATION

Nothing you will notice. The check that confirms a release actually reached the
address you open was asking the wrong question, and said 1.3.0 had not arrived
when it had.

## 1.3.0 — CAPABILITY

Settings for how you read, and a button that reads it out.

Behind the ⓘ there is now a **Reading** section:

**Text size** — normal, large, largest. It moves the buttons and the spacing
with it, not just the letters, so a bigger screen is still a usable one.

**Spacing between letters and lines** — more space is easier for a lot of people
to read. It leaves the completion code and the equations alone, because those
are read character by character and loosening them makes them harder.

**How much is on screen** — *Just the step I am on* hides the equation card, the
step list and the progress line, leaving only the question you are answering.

And on every step there is **Read this out**, which uses the speech your browser
already has. It reads the question and the equation. It never reads the answer.
Press it again to stop.

**None of this goes anywhere.** Not into the code you hand in, not into a
problem report, not to whoever marks it. How you read is nobody's business but
yours, and the app is built so it cannot become anybody else's.

There is also a short **Things worth knowing** section: there is no time limit,
getting a step wrong costs nothing, and you can stop and come back.

## 1.2.0 — CAPABILITY

Closing the tab no longer loses your work.

A refresh, a tab the browser restored, a Chromebook that went to sleep and came
back — any of them used to throw away a half-finished set and everything you had
typed. Now the app remembers, and when you come back it says **you have a
problem open** with a button back to it.

It puts you back on the same problem, at the same step, **with what you typed in
the box even if you never pressed Check**.

**A break costs you nothing.** The code you hand in says how long you had the app
open, and time you spend away is not counted — stop for forty minutes and the
number does not move. Stopping and coming back is the point.

You are offered it, never dropped into it. If you meant to leave, leave — and a
set you deliberately left with **Leave this set** is not offered back.

Everything stays on your device. None of it is sent anywhere.

## 1.1.1 — ITERATION

You can always get back to a problem you walked away from.

If you got a step wrong and followed **What does this mean?** through to the
lesson that teaches it, there was no way back to the problem. Everything you had
typed was still there — you just could not reach it. A strip now appears
wherever you are, saying which set is still open, with a button back to it.

**What you have typed stays put** while you open the calculator, the periodic
table, the ⓘ or the ⚑, and go back. That already worked, and it is now checked
on every build so it keeps working.

## 1.1.0 — CAPABILITY

You can see exactly what your code says about you.

Under the code on the finished screen there is now **What this code says about
you** — the code above, decoded, line by line. Your roster number, how many
problems you finished, how many you got right first time, how many wrong answers
there were and which step each was at, how long you had it open, which day. And
underneath, what is *not* in it: your name, anything you typed as an answer, any
of your working, anything about your device.

**It is the code itself, read back.** Not a description of it written by whoever
built the app — the app decodes the string you are about to hand in, using the
same operation the marking page uses, and shows you what comes out. What you
read is what they will read.

The progress code under "Moving to another device" says what it carries too, and
that it stays on your device.

## 1.0.0 — VERSION

Version 1. Everything MoleBridge was for is in it.

**Learn** takes you from reading a formula to percent yield in eight lessons.
Nothing is locked; open any of them in any order, and your place is kept on the
device. **Practice** gives you problems whenever you want them, shows the answer
if you ask, and tells you what went wrong when you get one wrong. **Assignment**
is the graded route, with a code to hand in at the end.

A **reference** with a page for every mistake MoleBridge can recognise, opening
straight from the wrong answer that produced it. A **calculator** that does
arithmetic and refuses to do the chemistry. A **periodic table** with atomic
weights. A **flag** in the top bar to report a problem in two taps, with nothing
in the report about you.

Three colour themes, light, dark or matching your device. It installs to a home
screen and works with no connection.

**What is still missing.** There is no way to review a problem you have already
finished, and no running total across sessions.

## 0.14.0 — CAPABILITY

Revealed answers have the right number of significant figures now.

They did not. Every one of them was shown to six figures whatever the question
gave you — asking for the moles in 8.135 g of KClO₃ answered `0.0663836 mol`,
which claims six figures out of a four-figure mass. **Every intermediate in every
problem was wrong the same way.**

Each step now shows the figures its own data supports, and says how many: *"This
step is 0.06638 mol, to 4 significant figures."* A mole ratio says it is exact
and that significant figures do not apply to it, because it comes from counted
coefficients.

**And it tells you what to carry.** Typing a properly rounded intermediate into
the next step is rounding early — which MoleBridge marks — so the reveal gives
you both: *"Carry 0.0663836 mol into the next step and round once, at the end."*
That is the rule anyway, and this is the place to say it.

**Learn is the first thing on the menu now**, then Practice, then the assignment
you were set.

## 0.13.0 — CAPABILITY

You can leave a set now, and you can read what you got wrong.

**There is a way out.** Once a set started there was no exit — you finished all
twelve steps or you closed the tab. **Leave this set** now sits next to "Problem
1 of 3". In practice it goes straight back. In an assignment it asks twice,
because leaving one means no code.

**The explanation is where you can see it.** When a step was wrong, the sentence
saying *which* mistake you made was rendered below the whole form — so on a
tablet with the keyboard up, you saw "Not that one." and nothing else. It now
appears directly under the button you pressed, and the app stops putting the
keyboard back over it.

**Revealed answers are written like a person would write them.** Asking for the
molar mass of glucose said `180.156000000 g/mol`. It says `180.156 g/mol`. A
mole ratio says `1.5`, not `1.50000`. Where the number of figures is being
marked, the answer is still shown to exactly that many — there the trailing
zeros are the point.

## 0.12.2 — ITERATION

The buttons along the top are pictures now.

They were single characters — `He`, `=`, `!`, `ⓘ` — and sitting in a row
they read as one nonsense equation rather than as four separate controls. Each
made sense on its own. Together they did not.

There is now a little periodic table, a calculator, a flag for reporting a
problem, and the same circled i for information. They say what they open.

## 0.12.1 — ITERATION

Every small button in the app now uses your colour theme.

Back, Copy it, Check, Look up a mistake and the rest were being painted by the
browser rather than by MoleBridge — a flat grey that stayed the same whichever
of the three themes you picked, and looked wrong against all of them. They were
legible, so nothing caught it. They match now.

## 0.12.0 — CAPABILITY

A periodic table, in the top bar, next to the calculator.

All 118 elements, laid out the way a printed one is. Tap any of them for its name
and its atomic weight written out in full. Elements with no stable isotope show
their mass number in brackets, the way the published data does — because that is
a different kind of number and printing it bare would say something it does not.

**It gives you atomic weights, not molar masses.** Adding four of them up is the
step MoleBridge marks and explains, so a table that did the adding would take
away the thing it is there to help with.

On a phone it scrolls sideways rather than shrinking. Eighteen columns squeezed
onto a narrow screen makes cells nobody can read or hit, and being a wide table
is not a reason to make the buttons too small.

**What is still missing.** No way to review a problem you have already finished,
and no running total across sessions.

## 0.11.0 — CAPABILITY

A calculator, in the top bar, on every screen.

Press **=**. Type a sum or tap the keys. It handles brackets, decimals and
scientific notation, so `6.022e23 * 2` works and so does `(2.50 + 1.25) / 3`.

**It will not do the chemistry, and that is on purpose.** Type a formula and it
says so instead of answering. Working out a molar mass and choosing which way up
to put a conversion are the steps you are practising — MoleBridge can only tell
you what went wrong in them if you do them, and a box that hands back 249.68
takes both the step and the explanation away.

It does not round to the number of figures your answer needs. That decision is
yours and it is one MoleBridge marks, so the calculator shows plenty of figures
and says nothing about how many belong.

It opens over whatever you were doing and closes back to it, and it is empty
every time it opens.

**What is still missing.** No periodic table yet. And the same gaps as before:
no way to review a problem you have already finished, and no running total
across sessions.

## 0.10.0 — CAPABILITY

Somewhere to go when MoleBridge tells you what you did wrong.

Every wrong answer already got a sentence saying which mistake produced that
exact number. Now that sentence has a **What does this mean?** button under it,
and it opens a page on that specific mistake: what happened, how to catch it in
your own working next time, what to do instead, and which lesson teaches it.

**There are twenty pages, one for every mistake MoleBridge can recognise** — and
you can browse them all from **Look up a mistake** on the Learn screen, without
having to get something wrong first.

It opens **over** the problem you are in the middle of. Close it and you are back
exactly where you were, with nothing lost.

**A new lesson: Litres, particles and other units.** MoleBridge has always set
problems that ask for litres of a gas at STP or a number of particles, and no
lesson taught the conversion. That was a gap, and the reference is what found it
— every mistake needs a lesson behind it, and one had nowhere to point.

**Progress codes from before this release will not be accepted.** The code had
room for seven lessons and there are now eight, which changes its shape. If you
have one written down, it will say it came from a different version — open your
lessons again and take a new code.

**What is still missing.** No calculator and no periodic table yet. And the same
gaps as before: no way to review a problem you have already finished, and no
running total across sessions.

## 0.9.0 — CAPABILITY

Telling someone it is broken, in two taps.

There is a **⚑ button in the top bar on every screen**. Press it, pick whichever
line is closest to what went wrong, and it writes a short report you can copy and
paste into a message to whoever set the work. You do not have to describe
anything.

**There is nowhere in it to type**, and that is on purpose. The report carries
which version you are running, what the device is, whether the app is up to date,
and — if you are in the middle of a problem — which problem set and which step.
It says all of that on the report itself, along with what it does *not* carry:
your name, your roster number, anything you typed as an answer, and any working.

The same is now true of the diagnostic behind the ⓘ. It used to include the
roster number and describe itself as having "no answers and no name", which was
true and was narrower than it sounded. It no longer includes it.

**MoleBridge asks your browser for nothing.** No camera, no microphone, no
location, no notifications — there is no prompt anywhere in it, and a check now
runs on every build that fails if anything is added that could raise one.

**What is still missing.** No reference to look things up in yet, no calculator,
no periodic table. And the same gaps as before: no way to review a problem you
have already finished, and no running total across sessions.

## 0.8.0 — CAPABILITY

Lessons. Seven of them, and none is locked.

Reading a formula, molar mass, grams and moles, balancing, the mole ratio, the
limiting reactant, percent yield — in the order they build on each other. **Open
any of them in any order.** If you already know one, skip it. If you jump ahead
and it makes no sense, come back. Nothing is held shut behind anything else.

Each lesson explains the thing, shows it worked through, and gives you a few to
try. **The answer only appears after you have had a go** — same as everywhere
else in MoleBridge — and when you get one wrong it tells you the answer and why,
rather than just marking it.

**Your place is kept on this device.** You do not need to do anything for that.
And if you are moving to another computer, or you use a shared one, there is a
short code under "Moving to another device" that carries your progress: write it
down, type it in on the other machine. It only ever adds — using an old code
cannot un-finish a lesson you have already done.

**What is still missing.** No reference to look things up in yet, no calculator,
no periodic table. The tile is green whichever colour you choose in the app. And
the same gaps as before: no way to review a problem you have already finished,
and no running total across sessions.

## 0.7.0 — CAPABILITY

MoleBridge opens on a menu now, and practice is the point of it.

**Practice** is there whenever you want it. Press Random for a set of problems,
or type in a set name you have seen before to get exactly those problems back —
so if you got one wrong you can return to it, or read the name across the room
to somebody else. Nothing is handed in and nothing is recorded.

**In practice you can ask to see the answer.** There is a button on every step.
It shows you that step only, so you can work backwards to it and find out where
it comes from, and asking about one step does not give away the rest.

**Assignment** is unchanged: the problems you were set, answers stay hidden, and
you finish with the code to hand in. **It is the only door that produces a
code.** Practice cannot make one — not "does not", cannot.

Lessons are coming and will join this menu. They are not here yet, and there is
no door for them until there is something behind it.

**What is still missing.** No lessons yet. No calculator or periodic table yet.
The tile is green whichever colour you choose in the app. And the same gaps as
before: no way to review a problem you have already finished, and no running
total across sessions.

## 0.6.0 — CAPABILITY

MoleBridge now tells your browser what it is allowed to do, and the answer is
almost nothing.

Nothing about using the app changes. What changed is that the browser is handed
a rule — a Content-Security-Policy — that refuses everything by default and then
permits only the handful of things this app genuinely does: load its own script,
its own stylesheet, its own icons, and nothing from anywhere else. It cannot be
put in a frame, it cannot run code that arrives in a page, and it cannot send a
form anywhere.

That last one is the no-network promise turned into something your browser
enforces rather than something we say. MoleBridge has never made a network call
while you use it; now the browser stops one even if it tried.

**What is still missing.** The tile is green whichever colour you choose in the
app; a home-screen icon cannot follow a setting. And the same gaps as before: no
way to review a problem you have already finished, and no running total across
sessions.

## 0.5.0 — CAPABILITY

The first-run explanation opens over the app instead of in front of it.

It used to be a full page, and on a phone or a small window the **Get started**
button sat below the bottom of the screen — so the one thing you needed to press
was the one thing you could not see. That was wrong, and it was wrong from the
first release.

It is a panel now. The text scrolls inside it and the button stays pinned at the
bottom where you can always reach it, and the app is visible behind, so you can
see what you are about to use rather than reading about it first. Escape closes
it too, and the explanation still moves into the ⓘ where it always was — there
is no way past it that loses it.

**What is still missing.** The tile is green whichever colour you choose in the
app; a home-screen icon cannot follow a setting. And the same gaps as before: no
way to review a problem you have already finished, and no running total across
sessions.

## 0.4.4 — ITERATION

The mole has claws now.

Its big digging hand was the one thing missing — it is the feature a mole is
actually known for — and the last release admitted it had been deleted rather
than drawn. It is drawn: three claws fanning forward off the front foot, part of
the animal's outline rather than a mark on top of it, so they are still there at
small sizes instead of dissolving.

They stop short of the nose deliberately. Drawn any longer they reach past it
and the animal ends up with two things competing to be its front.

**What is still missing.** The tile is green whichever colour you choose in the
app; a home-screen icon cannot follow a setting. And the same gaps as before: no
way to review a problem you have already finished, and no running total across
sessions.

## 0.4.3 — ITERATION

The browser tab shows the mole now, same as everywhere else.

There was briefly a second, simpler drawing just for the tab, because a mole at
sixteen pixels across is a bump on an arch. It is — but recognising your own tab
in a row of twenty matters more than the picture being sharp, and two different
marks for one app was the wrong trade.

**What is still missing.** The mole's big digging paw is not drawn. It was
there, it looked like a slot cut in its foot, and it was removed rather than
fixed. The tile is also green whichever colour you choose in the app; a
home-screen icon cannot follow a setting. And the same gaps as before: no way to
review a problem you have already finished, and no running total across
sessions.

## 0.4.2 — ITERATION

The mole has four legs' worth of sense in it now — two, which is what you see
from the side.

The previous drawing had the front leg laid over the body as its own shape, so
it read as a fifth limb sprouting from the shoulder, with two back feet already
there. The animal is drawn as a single outline now and the legs are cut into its
underside, so a leg cannot come loose from the body it belongs to.

**What is still missing.** The tile is green whichever colour you choose in the
app; a home-screen icon cannot follow a setting. And the same gaps as before: no
way to review a problem you have already finished, and no running total across
sessions.

## 0.4.1 — ITERATION

The mole on the icon actually looks like a mole now.

The first attempt was an animal-shaped lump: no legs to speak of, a nose that
was a bump rather than a point, and the big digging paw hidden inside the body
outline. It also merged into the bridge it was standing on, because both were
the same white and nothing separated them.

It is redrawn: the nose comes to a point out in front of everything else, the
back humps, the tail is clear of the body, one front leg reaches down to the
bridge and ends in the broad digging paw a mole is known for, and the whole
animal has a thin green outline so it stands on the bridge instead of melting
into it.

**What is still missing.** The tile is green whichever colour you choose in the
app; a home-screen icon cannot follow a setting. And the same gaps as before: no
way to review a problem you have already finished, and no running total across
sessions.

## 0.4.0 — CAPABILITY

MoleBridge has a mole on it. The icon is a mole crossing a bridge, left to
right, on a green tile.

**Why it changed.** The old icon was meant to be a bridge carrying three
particles. At the size a browser tab and a bookmark actually use it, it read as
a frowning face — the particles became eyes and a brow, and the arch under them
became a downturned mouth. On an app whose job is telling you which step went
wrong, that was the worst possible thing for it to look like, and it had been
that way since the first release.

**Two icons now, not one.** A browser tab draws its icon at sixteen pixels
across, where an animal is a smudge. So the tab gets its own simpler drawing —
the arch alone — and the home-screen tile gets the mole. They are the same green
and read as the same app.

**What is still missing.** The tile is green whichever colour you choose in the
app; a home-screen icon cannot follow a setting. And the same gaps as before: no
way to review a problem you have already finished, and no running total across
sessions.

## 0.3.0 — CAPABILITY

You can choose how MoleBridge looks. Open the ⓘ and there are two settings:
light or dark, and a colour.

**Light or dark.** It follows your device unless you tell it otherwise. Pick
Light or Dark and it stays that way on this device, including next time you open
it. "Match my device" puts it back to following along, and it changes over the
moment your device does.

**Colour.** Three to pick from, named rather than shown as coloured squares so
they are still tellable apart if colours are hard for you: **Moss**, which is
green and is what you get if you choose nothing; **Harbour**, the blue this app
used to be; and **Clay**, which is warm and orange-brown.

Every one of the six combinations has been measured against the same contrast
floor as the rest of the app, in both light and dark, rather than picked because
it looked nice. Two greens and an orange were tried and rejected for being too
faint on the light background.

What is kept, and where: your choice is stored in this browser on this device
only. It is not sent anywhere, it is not part of your completion code, and it
does not follow you to another computer — so a machine you share will show
whatever the last person picked.

**What is still missing.** The app's icon is still the old blue one and is being
redrawn; the colour you pick changes the app, not the icon on your home screen
yet. And the same gaps as before: no way to review a problem you have already
finished, and no running total across sessions.

## 0.2.0 — CAPABILITY

Whoever marks your work can now decode a whole batch of codes at once. Nothing
has changed about how you work a problem or about the code you hand in.

What that means for you: the code you hand in is read alongside everybody
else's, and what they see is which steps people found hard. It carries your
roster number, never your name — MoleBridge has never had anywhere to put one,
and the page they paste into throws away everything except the codes.

**What is still missing.** The same things as before: no way to review a problem
you have already finished, and no running total across sessions. The code still
carries counts only, so it cannot show which particular problem went wrong.

## 0.1.0 — CAPABILITY

The first build you can actually use.

Work a stoichiometry problem one step at a time. You enter every value along the
way — the balanced coefficients, the molar mass, the moles, the ratio — and you
cannot move on until the step in front of you is right. When a step is wrong,
MoleBridge tells you which mistake produces that exact number rather than just
marking it wrong, and where the mistake is an algebra one it shows you three
lines of the algebra using your own numbers.

At the end you get a completion code to hand in.

Five kinds of problem: mass to mass, mass to particles, mass to volume at STP,
limiting reactant, and percent yield. The assignment key you were given decides
which problems you get, and everyone with the same key gets the same ones.

Works with no connection once it has loaded, and can be installed to your home
screen or shelf.

**What is still missing, so you know rather than wonder.** There is no way to
review a problem you have already finished. There is no running total across
sessions — close the tab and the count starts again, because nothing is stored
anywhere. And the code carries counts only: it cannot show whoever marks it
which particular problem went wrong.
