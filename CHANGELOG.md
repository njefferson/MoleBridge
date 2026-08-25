# What changed

Written for the person using MoleBridge, not for whoever built it. Newest first.
This file is the one source: the app renders its own patch notes from it, and
`tools/version-check.mjs` fails the build if the two disagree.

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
