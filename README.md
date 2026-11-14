# Compassion Course Foundation website

The website at [compassioncf.com](https://compassioncf.com/), in the "Dawn" design: a night sky giving way to sunrise, set in Fraunces and DM Sans. It is a static site served by GitHub Pages. The repository root is the site root.

The old address, https://hmohyud.github.io/compassioncf/, redirects to the domain.

## Pages

| Address | Page |
|---|---|
| `/` | Home, with the participant globe |
| `/about/` | About us |
| `/programs/` | Programs, with `/programs/compassion-course/`, `/programs/course-fund/` and `/programs/archive/` |
| `/events/` | Upcoming events, read live from the foundation's database |
| `/board/` | Board members |
| `/blog/` | Essays, read live; one essay is `/blog/post.html?id=<post id>` |
| `/volunteer/` | Volunteer sign-up form |
| `/contact/` | Contact form |
| `/donate/` | Donate. Stripe also sends donors back here after paying or cancelling |
| `404.html` | Shown for any missing address. It also forwards addresses from the previous site |

The program, about and board text comes from the previous compassioncf.com. Headlines and short linking text were written for this design.

## How it is put together

- `index.html`: the home page, written by hand.
- Every other page is written by `tools/build_pages.py` from templates in that file, so they share one header, footer and newsletter block. Change a page there and run `python tools/build_pages.py`; edits made in the built `.html` files are overwritten by the next run. The script also replaces the home page's header and footer so they match.
- `style.css`: all of the site's styles.
- `shared/site.js`: scroll reveals, counting numbers, the mobile menu.
- `shared/globe.js`, `shared/globe-lazy.js`, `shared/clusters.js`, `shared/textures/`, `shared/vendor/`: the participant globe (three.js r182, no CDN). `clusters.js` is the participant map pre-clustered on a 3° grid: 3,898 locations in 487 regions. `globe-lazy.js` mounts the globe only when it nears the viewport.
- `shared/cms.js`: reads essays and events from the foundation's database. Pages opt in with `data-cms="blog-list" | "blog-post" | "events"`. It renders the essays' Markdown safely and shows an empty state if the read fails.
- `shared/forms.js`: sends the contact, volunteer and newsletter forms (`data-form="contact" | "volunteer" | "newsletter"`).
- `shared/donate.js`: the donate dialog that every `[data-donate]` link opens (currency, $25 to $500 presets, custom amount), themed with the `--dn-*` variables in `style.css`.
- `shared/img/`: the logo marks, photographs and the social icon sprite.
- `tools/assemble.sh`: copies the site's files, without the repository-only ones, into a folder to publish.
- `_reference/` (on disk only, ignored by git): an export of the previous site.

## What the site talks to

Everything live runs in the foundation's Firebase project, `compassioncf-web-site`, which the previous site also uses. No keys or secrets are in this repository.

- **Essays and events** are read from the `blogPosts` and `events` collections over Firestore's REST API. Publishing in the foundation's admin panel updates this site without a deploy.
- **Forms** save documents in the shape the previous site wrote, so they appear in the admin panel: contact messages in `contactSubmissions`, newsletter sign-ups in `newsletterSubscriptions`. Volunteer notes also go to `contactSubmissions`, with the subject "Volunteer sign-up", because the previous site's own volunteer form wrote to an invalid path and had no working inbox.
- **Donations** call the `createCheckoutSession` function, which returns a Stripe Checkout address. Stripe returns donors to `compassioncf.com/donate` with `?success=true` or `?canceled=true`.
- **The admin panel** is part of the previous site, not this one. It stays reachable at https://compassioncf-web-site.web.app/admin.

## Working on it

Serve the folder and open http://localhost:8765/:

```bash
python -m http.server 8765
```

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes the output of `tools/assemble.sh` to the `gh-pages` branch. GitHub Pages serves that branch.

## The domain

The domain was pointed at this site on 14 November 2026.

- **GitHub Pages** serves it as a custom domain. `tools/assemble.sh` writes the `CNAME` file Pages needs into every deploy; without it Pages drops the domain.
- **DNS** is hosted at Directnic, where the domain is registered (nameservers `ns0` to `ns3.directnic.com`). The records there:
  - four `A` records for the bare domain: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (GitHub Pages)
  - a `CNAME` from `www` to `hmohyud.github.io`
  - five `MX` records for Google mail, and two `TXT` records carried over from the previous setup
- Directnic serves these with a one-day caching time, so a change to them takes up to a day to reach everyone.
- **To go back to the previous site**, replace the four `A` records with a single one for `199.36.158.100` (Firebase Hosting, where the previous site still runs).

`compassioncf.com/admin` now shows this site's not-found page; the admin panel is at the `web.app` address above.
