---
name: weekly-update
description: Build this period's Magick Tailor progress deck for the boss (or refresh an earlier one) by launching the progress-deck agent. Use when the user types /weekly-update or asks for the weekly update, a progress report or a boss deck. Argument: the period, e.g. "21-27 Oct", optionally followed by the link of the deck to update.
---

Launch the `progress-deck` agent (Agent tool, `subagent_type: "progress-deck"`) with this prompt,
filling in `$ARGUMENTS` (empty = the seven days ending today, new deck):

> Build the Magick Tailor weekly update for the period $ARGUMENTS. If the argument contains a
> claude.ai artifact link, update that deck instead of creating a new one. Follow your inputs list
> (previous deck, git log for the period, CHANGELOG Unreleased, memory notes, release checklist),
> capture fresh simulator screenshots for the new screens, and publish the deck. End with the link,
> one line per slide, and anything you need from me (phone screenshots, dates, figures).

When the agent reports back, relay its final message to the user as is, then add one line: the deck
stays private until shared from the page's Share menu.
