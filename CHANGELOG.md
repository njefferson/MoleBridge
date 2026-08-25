# What changed

Written for the person using MoleBridge, not for whoever built it. Newest first.
This file is the one source: the app renders its own patch notes from it, and
`tools/version-check.mjs` fails the build if the two disagree.

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
