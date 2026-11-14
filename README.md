# Compassion Course Foundation website

The new website for [compassioncf.com](https://compassioncf.com/), in the "Dawn" design: a night sky giving way to sunrise, set in Fraunces and DM Sans. It is a static site. The repository root is the site root.

Preview, until the domain points here: https://hmohyud.github.io/compassioncf/

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

## Going live at compassioncf.com

Not done yet. If the site stays on GitHub Pages:

1. Add a line to `tools/assemble.sh` that writes `compassioncf.com` into a file named `CNAME` in the output folder, and set the same custom domain in the repository's Pages settings. Do this only when the DNS is about to change: once it is set, the preview address redirects to the domain.
2. Point the domain's DNS at GitHub Pages: the four `A` records for the bare domain and a `CNAME` from `www` to `hmohyud.github.io`. Leave the mail (`MX`) records as they are. The domain is registered at Directnic, but its records are served by Google Cloud DNS, so this needs access to that zone or a move of the nameservers.
3. Check `compassioncf.com/donate?success=true`, an old program address and an old essay address.

After the switch, `compassioncf.com/admin` shows this site's not-found page; the admin panel is at the `web.app` address above.
