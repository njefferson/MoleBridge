# What changed

Written for the person using MoleBridge, not for whoever built it. Newest first.
This file is the one source: the app renders its own patch notes from it, and
`tools/version-check.mjs` fails the build if the two disagree.

## 0.13.0 — CAPABILITY

You can leave a set now, and you can read what you got wrong.

**There is a way out.** Once a set started there was no exit — you finished all
twelve steps or you closed the tab. **Leave this set** now sits next to "Problem
1 of 3". In practice it goes straight back. In a class assignment it asks twice,
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
paste into a message to your teacher. You do not have to describe anything.

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

**Class assignment** is unchanged: the problems your teacher set, answers stay
hidden, and you finish with the code to type into Canvas. **It is the only door
that produces a code.** Practice cannot make one — not "does not", cannot.

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
does not follow you to another computer — so a school machine you share will
show whatever the last person picked.

**What is still missing.** The app's icon is still the old blue one and is being
redrawn; the colour you pick changes the app, not the icon on your home screen
yet. And the same gaps as before: no way to review a problem you have already
finished, and no running total across sessions.

## 0.2.0 — CAPABILITY

Your teacher can decode a whole class at once now. Nothing has changed about how
you work a problem or about the code you hand in.

What that means for you: the code you type into Canvas is read alongside
everybody else's, and what your teacher sees is which steps the class found
hard. It carries your roster number, never your name — MoleBridge has never had
anywhere to put one, and the page your teacher pastes into throws away
everything except the codes.

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

At the end you get a completion code to type into Canvas.

Five kinds of problem: mass to mass, mass to particles, mass to volume at STP,
limiting reactant, and percent yield. Your teacher's assignment key decides
which problems you get, and everyone with the same key gets the same ones.

Works with no connection once it has loaded, and can be installed to your home
screen or shelf.

**What is still missing, so you know rather than wonder.** There is no way to
review a problem you have already finished. There is no running total across
sessions — close the tab and the count starts again, because nothing is stored
anywhere. And the code carries counts only: it cannot show your teacher which
particular problem went wrong.
