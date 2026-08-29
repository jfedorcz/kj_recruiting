# Kurt Fedorczyk Recruiting Dashboard

A responsive, single-page recruiting profile for Kurt Fedorczyk.

## Deploying on Render

This repository includes a Render Blueprint in `render.yaml`. Create a new
Blueprint in Render, select this repository, and apply the configuration.
Render will publish the repository root as a static site and redeploy on each
commit to `main`.

## Local preview

Open `index.html` directly in a browser, or serve the repository root with any
static web server.

## Media

The dashboard expects optional volleyball clips at:

- `media/forge-christian-15-kills.mp4`
- `media/stargate-6-kills.mp4`

If those files are not present, the page falls back to its illustrated sports
poster and keeps the rest of the recruiting profile usable.

## Automatic statistics refresh

The `Refresh recruiting statistics` GitHub Actions workflow runs daily and can
also be started manually. It checks the public MaxPreps volleyball and
basketball tables in a browser, updates `data/stats.json` only after required
fields validate, and commits only verified changes. The page requests that file
on each visit and displays the most recent successful data update.

Hudl and CHSAA are monitored as linked public sources. They remain source links
unless they expose structured numerical statistics; MaxPreps is the numerical
source of record because those totals are explicitly coach-entered.
