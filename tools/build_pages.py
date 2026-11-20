"""Builds the site's pages from the templates in this file.

    python tools/build_pages.py

Every page except the home page is written whole: about/, programs/ and its four program
pages, news/, board/, blog/ and blog/post.html, contact/, donate/, admin/ and 404.html.
They share the header and footer defined below, so change those here.

Pages written by this script start with a "Built by" comment. Change them here and run the
script; edits made in those .html files are overwritten by the next run.

The home page (index.html) is written by hand. This script only replaces its <header>, its
<footer>, its program cards (between the "program cards" comments) and The Promise of Needs Awareness
(between the "needs awareness" comments), so they match the other pages.
"""
import math, os, re, sys

SITE = sys.argv[1] if len(sys.argv) > 1 else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

# The board's portraits are files of this site ("{s}" becomes the path to shared/ from each page). Thom's and
# Debra's were first loaded from other websites; they were copied here on 16 November 2026 so the pages no
# longer depend on those sites. Every portrait is shown in black and white (see .portrait img in style.css).
THOM_IMG = '{s}img/thom-bond.jpg'
DEBRA_IMG = '{s}img/debra-chew.jpg'
HYDER_IMG = '{s}img/hyder-mohyuddin.jpg'

NAV = [('about', 'About'), ('programs', 'Programs'), ('news', 'News and Updates'), ('contact', 'Contact')]

SOCIAL = [
    ('instagram', 'https://www.instagram.com/fromthombond/', 'Instagram', 'Thom Bond on Instagram'),
    ('facebook', 'https://www.facebook.com/ThomBondOfficial/', 'Facebook', 'Thom Bond on Facebook'),
    ('x', 'https://x.com/BondThom', 'X', 'Thom Bond on X'),
    ('youtube', 'https://www.youtube.com/channel/UCewGakK8ofm6z8ZwMkYRIIA', 'YouTube', 'Thom Bond on YouTube'),
    ('podcast', 'https://thombond.buzzsprout.com/', 'Engineering Peace podcast', 'Engineering Peace, Thom Bond’s podcast'),
]

def social(s, cls='social', heading='Follow Thom Bond'):
    items = ''.join(
        f'\n            <li><a href="{u}" target="_blank" rel="noopener" title="{t}" aria-label="{a}"><svg aria-hidden="true"><use href="{s}img/social.svg#{i}"/></svg></a></li>'
        for i, u, t, a in SOCIAL)
    h = f'<h4>{heading}</h4>' if heading else ''
    return f'''<div class="{cls}">
          {h}
          <ul>{items}
          </ul>
        </div>'''

def header(r, active, home=False):
    brand = '#top' if home else (r or './')
    links = '\n'.join(
        f'        <a href="{r}{slug}/"' + (' aria-current="page"' if slug == active else '') + f'>{label}</a>'
        for slug, label in NAV)
    return f'''<header class="hdr" data-header>
    <div class="wrap hdr-in">
      <a class="brand" href="{brand}" aria-label="Compassion Course Foundation home">
        <img src="{r}shared/img/mark.png" alt="" width="40" height="37">
        <span>Compassion Course<small>Foundation</small></span>
      </a>
      <button class="burger" data-nav-toggle aria-controls="nav" aria-expanded="false" aria-label="Menu"><span></span><span></span></button>
      <nav id="nav" class="nav" aria-label="Primary">
{links}
        <a class="btn btn-sun sm" href="{r}donate/" data-donate>Donate</a>
      </nav>
    </div>
  </header>'''

# The footer's "Quick links" are the pages of the site, in the order of the menu, plus the board page.
def footer(r, home=False):
    s = r + 'shared/'
    brand = '#top' if home else (r or './')
    return f'''<footer class="ftr">
    <div class="wrap ftr-grid">
      <div>
        <a class="brand" href="{brand}"><img src="{s}img/mark.png" alt="" width="40" height="37"><span>Compassion Course<small>Foundation</small></span></a>
        <p class="ftr-tag">Peace Education for Everyone, Everywhere, All at Once.</p>
        {social(s)}
      </div>
      <div>
        <h4>Quick links</h4>
        <a href="{r}about/">About us</a>
        <a href="{r}programs/">Programs</a>
        <a href="{r}news/">News and Updates</a>
        <a href="{r}board/">Board members</a>
        <a href="{r}contact/">Contact Us</a>
      </div>
      <div>
        <h4>Support</h4>
        <a href="{r}donate/" data-donate>Donate</a>
        <a href="{r}news/#mailing-list">Join our mailing list</a>
      </div>
    </div>
    <div class="wrap ftr-base">© <span data-year>2026</span> Compassion Course Foundation, Inc. All rights reserved.</div>
  </footer>'''

def sky():
    return '<div class="sky" aria-hidden="true"><div class="stars s1"></div><div class="stars s2"></div><div class="stars s3"></div><div class="dawn"></div></div>'

def crumbs(r, trail, here=None):
    parts = [f'<a href="{r}">Home</a>'] + [f'<span aria-hidden="true">/</span><a href="{h}">{t}</a>' for t, h in trail]
    if here:
        parts.append(f'<span aria-hidden="true">/</span><span aria-current="page">{here}</span>')
    return f'<nav class="crumbs" aria-label="Breadcrumb">{"".join(parts)}</nav>'

def phero(r, here, trail, eyebrow, h1, sub='', lede='', extra='', cls='phero'):
    sub_html = f'\n          <p class="phero-sub">{sub}</p>' if sub else ''
    lede_html = f'\n          <p class="lede">{lede}</p>' if lede else ''
    return f'''<section class="{cls}">
      {sky()}
      <div class="wrap">
        <div class="phero-in">
          {crumbs(r, trail, here)}
          <p class="eyebrow"><span class="dot"></span>{eyebrow}</p>
          <h1>{h1}</h1>{sub_html}{lede_html}{extra}
        </div>
      </div>
    </section>'''

def facts(items, cap='', count=False):
    lis = ''.join(
        f'<li><b{f" data-count={chr(34)}{c}{chr(34)}" if c else ""}>{b}</b><span>{sp}</span></li>' for b, sp, c in items)
    cap_html = f'<p class="facts-cap">{cap}</p>' if cap else ''
    return f'\n          <div class="facts-block"><ul class="facts">{lis}</ul>{cap_html}</div>'

def page(path, title, desc, active, hero, body, extra_js='', head='', body_class=''):
    depth = path.count('/')  # 'about/index.html' -> 1
    r = '../' * depth
    s = r + 'shared/'
    body_attr = f' class="{body_class}"' if body_class else ''
    html = f'''<!DOCTYPE html>
<!-- Built by tools/build_pages.py. Change this page there and run it; edits made here are overwritten. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — Compassion Course Foundation</title>
  <meta name="description" content="{desc}">{head}
  <link rel="icon" href="{s}img/mark.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600&family=DM+Sans:opsz,wght@9..40,400..700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{r}style.css">
</head>
<body{body_attr}>
  <a class="skip" href="#main">Skip to content</a>

  {header(r, active)}

  <main id="main">
    {hero.replace('{r}', r).replace('{s}', s)}

    {body.replace('{r}', r).replace('{s}', s)}
  </main>

  {footer(r)}

  <script type="module" src="{s}content.js"></script>
  <script type="module" src="{s}site.js"></script>
  <script type="module" src="{s}donate.js"></script>
  <script type="module" src="{s}forms.js"></script>{extra_js.replace('{r}', r).replace('{s}', s)}
</body>
</html>
'''
    out = os.path.join(SITE, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('wrote', out)

# ---------- shared bits ----------

ICON = {
    'translate': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h22v15H17l-6 5v-5H6z"/><path d="M33 18h9v15h-4v5l-6-5h-8v-5"/></svg>',
    'archive': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 24h3M14 17v14M20 11v26M26 15v18M32 19v10M38 13v22M42 24h2"/></svg>',
    'connect': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="12" r="5"/><circle cx="11" cy="34" r="5"/><circle cx="37" cy="34" r="5"/><path d="M21 17l-7 12M27 17l7 12M16 35h16"/></svg>',
    'heart': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M24 40S7 30 7 18a8.5 8.5 0 0 1 17-2.5A8.5 8.5 0 0 1 41 18c0 12-17 22-17 22z"/></svg>',
    'horizon': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 32h40"/><path d="M13 32a11 11 0 0 1 22 0"/><path d="M24 9v5M10.5 15.5l3.5 3.5M37.5 15.5L34 19M4 24h4M40 24h4" opacity=".7"/><path d="M10 39h28" opacity=".45"/></svg>',
}

def wave_svg():
    bars = []
    n = 46
    for i in range(n):
        t = i / (n - 1)
        env = math.sin(math.pi * t) ** 0.8
        h = 14 + 150 * env * (0.45 + 0.55 * abs(math.sin(i * 0.9) * math.cos(i * 0.37)))
        x = 5 + i * (470 / n)
        bars.append(f'<rect x="{x:.1f}" y="{100 - h / 2:.1f}" width="5" height="{h:.1f}" rx="2.5"/>')
    return ('<svg viewBox="0 0 480 200" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wv" x1="0" y1="0" x2="1" y2="0">'
            '<stop offset="0" stop-color="#ffd89a" stop-opacity=".55"/><stop offset=".5" stop-color="#f6b860"/><stop offset="1" stop-color="#f08a7a" stop-opacity=".6"/>'
            '</linearGradient></defs><g fill="url(#wv)">' + ''.join(bars) + '</g></svg>')

WAVE = f'<div class="wave-art"><div class="stars s1"></div>{wave_svg()}</div>'

def starmap_svg():
    # The Observatory's picture: needs as points of light, joined into one map of the sky.
    nodes = {'a': (240, 205, 7), 'b': (150, 150, 4.5), 'c': (330, 140, 5), 'd': (120, 250, 4), 'e': (205, 300, 5), 'f': (310, 285, 4.5),
             'g': (380, 220, 4), 'h': (260, 95, 4), 'i': (80, 170, 3), 'j': (410, 130, 3), 'k': (160, 60, 3), 'l': (360, 330, 3),
             'm': (70, 320, 3), 'n': (430, 290, 2.5)}
    edges = ['ab', 'ac', 'ae', 'af', 'bd', 'bh', 'ch', 'cg', 'fg', 'ed', 'bi', 'cj', 'hk', 'fl', 'dm', 'gn', 'ef', 'id']
    lines = ''.join(f'<line x1="{nodes[p][0]}" y1="{nodes[p][1]}" x2="{nodes[q][0]}" y2="{nodes[q][1]}"/>' for p, q in edges)
    rings = ''.join(f'<circle cx="240" cy="205" r="{r}"/>' for r in (70, 130, 190))
    halos = ''.join(f'<circle cx="{x}" cy="{y}" r="{r * 2.6:.1f}"/>' for x, y, r in nodes.values() if r >= 4.5)
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}"/>' for x, y, r in nodes.values())
    return ('<svg viewBox="0 0 480 400" aria-hidden="true"><defs><linearGradient id="sm" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="#ffd89a"/><stop offset=".55" stop-color="#f6b860"/><stop offset="1" stop-color="#f08a7a"/></linearGradient></defs>'
            f'<g fill="none" stroke="#ffd89a" stroke-opacity=".16" stroke-dasharray="2 7">{rings}</g>'
            f'<g stroke="#ffd89a" stroke-opacity=".42" stroke-width="1.2" stroke-linecap="round">{lines}</g>'
            f'<g fill="#f6b860" fill-opacity=".16">{halos}</g>'
            f'<g fill="url(#sm)">{dots}</g></svg>')

STARMAP = f'<div class="wave-art map-art"><div class="stars s1"></div>{starmap_svg()}</div>'

# The programs, in the order they appear everywhere: on the programs page, on the home page's cards,
# in the previous and next links under each program page, and in the lists that name the other
# programs. To reorder them, change the order here. (They were numbered, "01 — Program", until the
# foundation asked on 17 November 2026 for the numbers to go.)
#
# Their names and words are the foundation's own, as the foundation wrote them in the site's editor
# in November 2026 (when the first two programs took the names they have here). The fourth is
# "Global Human Needs Observatory" throughout, as the foundation settled on 17 November 2026; its
# address keeps the earlier name (programs/global-needs-observatory/) so links to it still work.
PROGRAMS = [
    ('scholarship-fund', 'The Peace Engineering Scholarship Fund', 'Ending Financial Gatekeeping in Peace Education'),
    ('research-initiative', 'The Global Peace Education Research Initiative', 'Peace Education Research On A Global Scale'),
    ('archive', 'The Archive Program', 'A multilingual, global digital library preserving peace education history'),
    ('global-needs-observatory', 'Global Human Needs Observatory', 'A needs-based framework and infrastructure for peace engineering'),
]

def give_card(kicker, h, p, label):
    return f'''<div class="give-card">
              <span class="way-n">{kicker}</span>
              <h3>{h}</h3>
              <p>{p}</p>
              <a class="btn btn-sun" href="{{r}}donate/" data-donate>{label}</a>
            </div>'''

def other_programs(current):
    links = ''.join(
        f'\n              <a href="{{r}}programs/{slug}/"><b>{t}</b><small>{sub}</small></a>'
        for slug, t, sub in PROGRAMS if slug != current)
    return f'''<div class="side-list">
              <h4>More programs</h4>{links}
              <a href="{{r}}programs/"><b>All Programs</b><small>Ways we bring compassion to life</small></a>
            </div>'''

def pager(current):
    i = [p[0] for p in PROGRAMS].index(current)
    prev = PROGRAMS[i - 1] if i > 0 else None
    nxt = PROGRAMS[i + 1] if i < len(PROGRAMS) - 1 else None
    out = '<nav class="pager" aria-label="More programs">'
    if prev:
        out += f'<a class="prev" href="{{r}}programs/{prev[0]}/"><small>← Previous program</small><b>{prev[1]}</b></a>'
    if nxt:
        out += f'<a class="next" href="{{r}}programs/{nxt[0]}/"><small>Next program →</small><b>{nxt[1]}</b></a>'
    else:
        out += '<a class="next" href="{r}programs/"><small>Back to →</small><b>All Programs</b></a>'
    return out + '</nav>'

# (The Scholarship Fund and Research Initiative pages each ended with the participant globe until
# 17 November 2026, when the foundation asked for it to be taken off both. The home page has its own.)

# Each program page closes with a box asking for support, and the card beside it asks too; both buttons open the
# donate window. Their words are the foundation's, sent on 20 November 2026 (Debra Chew and Thom Bond, by email):
# the boxes' text and the buttons' names, which replaced "Donate here". The boxes' headings and the cards' lines
# are the foundation's own wording from the site's editor that day, written into the pages.
def callout(heading, paragraphs, label, lead=''):
    lead_html = f'\n            <p class="callout-lead">{lead}</p>' if lead else ''
    paras = ''.join(f'\n            <p{cls}>{p}</p>' for cls, p in paragraphs)
    return f'''<div class="callout reveal">
            <h2>{heading}</h2>{lead_html}{paras}
            <div class="cta">
              <a class="btn btn-sun" href="{{r}}donate/" data-donate>{label}</a>
              <a class="btn btn-line" href="{{r}}contact/">Contact Us</a>
            </div>
          </div>'''

# ---------- programs ----------

fund_hero = phero('{r}', 'The Peace Engineering Scholarship Fund', [('Programs', '{r}programs/')], 'Program', 'The Peace Engineering Scholarship Fund', 'Ending Financial Gatekeeping in Peace Education',
    lede='Scholarships and logistical support, so that peace education is never limited by privilege or circumstance.')

fund_body = f'''<section class="pbody">
      <div class="wrap article">
        <div class="prose">
          <p class="lead reveal">To ensure that peace education is available to all, the Fund provides scholarships and logistical support to individuals and groups who would otherwise face financial or geographic barriers</p>

          <h2 class="reveal">What the Fund does</h2>
          <ul class="benefits">
            <li class="reveal"><span>01</span>Expands global access to high-quality peace education</li>
            <li class="reveal"><span>02</span>Supports underserved communities, including those affected by conflict, displacement, or economic hardship</li>
            <li class="reveal"><span>03</span>Accelerates the spread of compassionate communication tools</li>
            <li class="reveal"><span>04</span>Strengthens networks of peace-builders who bring these skills back to their families, organizations, and communities</li>
          </ul>

          <blockquote class="pull reveal">The Fund ensures that the benefits of peace education are not limited by privilege or circumstance.</blockquote>

          {callout('Give Someone the Opportunity to Learn', [
              ('', 'A gift of $240 provides one person with a full-year scholarship to the Compassion Course, and helps remove financial barriers to peace education.'),
              (' class="fine"', 'All contributions are administered by the Compassion Course Foundation for its scholarship program. The Foundation retains discretion over the selection of recipients and distribution of awards in accordance with its scholarship policies.'),
          ], 'Support a Scholarship')}
          {pager('scholarship-fund')}
        </div>
        <aside class="aside" aria-label="Support and more programs">
          {give_card('Support this program', 'Access Matters', '$240 provides one person with a full-year scholarship to the Compassion Course', 'Support a Scholarship')}
          {other_programs('scholarship-fund')}
        </aside>
      </div>
    </section>'''

# This page was "The Compassion Course" until the foundation rewrote it in the editor as its research program.
research_hero = phero('{r}', 'The Global Peace Education Research Initiative', [('Programs', '{r}programs/')], 'Program', 'The Global Peace Education Research Initiative', 'Peace Education Research On A Global Scale')

research_body = f'''<section class="pbody">
      <div class="wrap article">
        <div class="prose">
          <p class="lead reveal">Using validated psychological instruments and real human stories to measure how needs-aware peace education transforms conflict</p>

          <h2 class="reveal">Why Research Matters</h2>
          <p class="reveal">To scale peace education worldwide, educators, policymakers, and funders need scientific evidence that peace education training creates lasting behavioral change for the cultivation of compassion and effective conflict-resolution. We are currently analyzing behavioral shifts across thousands of learners from diverse backgrounds and regions within our well-established global network. Through robust qualitative and quantitative science, we aim to capture the impact of our training and behavioral shifts in nonviolent communication, self-compassion and empathy.</p>

          {callout('Help Build the Evidence for Peace Education', [
              ('', 'Your contribution supports data management, statistical analysis, and research infrastructure to evaluate and strengthen peace education.'),
          ], 'Support Research')}
          {pager('research-initiative')}
        </div>
        <aside class="aside" aria-label="Support and more programs">
          {give_card('Support this program', 'Science Matters', 'Help build the evidence for peace education', 'Support Research')}
          {other_programs('research-initiative')}
        </aside>
      </div>
    </section>'''

archive_hero = phero('{r}', 'The Archive Program', [('Programs', '{r}programs/')], 'Program', 'The Archive Program', 'Preserving 25 years of peace education history',
    extra=facts([('Hundreds', 'of hours', ''), ('25', 'years', ''), ('Over 240', 'languages', '')], 'Becoming an online library of audio courses'))

archive_body = f'''<section class="pbody">
      <div class="wrap article">
        <div class="prose">
          <p class="lead reveal">Creating a multi-lingual, global library by digitizing, translating, and indexing 25 years of archival materials from The Compassion Course conferences, workshops, and teachings from pioneers in nonviolent communication</p>

          <h2 class="reveal">Voices in the collection</h2>
          <ul class="voices reveal">
            <li><b>Thom Bond</b><span>Founder of The Compassion Course, Co-Founder of the New York Center for Nonviolent Communication (NYCNVC), and Author of The Compassion Book</span></li>
            <li><b>Robert Gonzales</b><span>Founder of The Center for Living Compassion and Pioneer in Spiritual Psychology</span></li>
            <li><b>Marshall Rosenberg</b><span>Founder of Nonviolent Communication and Author of Nonviolent Communication: A Language of Life</span></li>
          </ul>

          <h2 class="reveal">From recordings to a living library</h2>
          <p class="reveal">The Archive Program is tasked with acquiring, preserving, translating, organizing and distributing the teachings in the form of an online library of audio courses in over 240 languages.</p>
          <ol class="timeline reveal">
            <li class="done"><b>Acquire</b><span class="tag">Complete</span><span>Gathering decades of conference and workshop recordings.</span></li>
            <li><b>Protect</b><span>Protecting the original recordings for posterity.</span></li>
            <li><b>Translate</b><span>Translating the teachings throughout the globe in over 240 languages.</span></li>
            <li><b>Organize</b><span>Organizing a searchable resource, carefully curated for reference and self-study.</span></li>
            <li><b>Distribute</b><span>Distributing our digital library around the world.</span></li>
          </ol>

          {callout('Help Us Build The Library', [
              ('', 'Your contribution supports archival preservation, digitization, organization, and translation of decades of compassion-centered teaching.'),
          ], 'Support the Archive', lead='Preserve knowledge and expand access.')}
          {pager('archive')}
        </div>
        <aside class="aside" aria-label="Support and more programs">
          {give_card('Support the archive', 'Information Matters', 'Preserve knowledge and expand access of decades of compassion-centered teaching.', 'Support the Archive')}
          {other_programs('archive')}
        </aside>
      </div>
    </section>'''

# The fourth program is still forming. Its text is the foundation's own; the three-line summary under it
# only restates that paragraph.
obs_hero = phero('{r}', 'Global Human Needs Observatory', [('Programs', '{r}programs/')], 'Program · Forming', 'Global Human Needs Observatory', 'A needs-based framework and infrastructure for peace engineering')

obs_body = f'''<section class="pbody">
      <div class="wrap article">
        <div class="prose">
          <p class="lead reveal">Mapping universal human needs, procuring resource data, and applying Intelligence to create breakthrough conflict resolution strategies.</p>

          <h2 class="reveal">What the Observatory is</h2>
          <p class="reveal">Rooted in the Needs Awareness framework, the <strong>Global Human Needs Observatory</strong> is a scientifically credible system to identify and track universal human needs (such as autonomy, connection, meaning, safety, nutrition, security) on an individual, group, community and regional level, intelligently linking lived experiences to verified local resources.</p>
          <dl class="glance reveal">
            <div><dt>Tracks</dt><dd>Universal human needs, such as autonomy, connection, meaning, safety, nutrition and security</dd></div>
            <div><dt>Across</dt><dd>Individual, group, community and regional levels</dd></div>
            <div><dt>Links</dt><dd>Lived experiences to verified local resources</dd></div>
          </dl>

          {callout('This Program Is Forming', [
              ('', 'Support the rollout of a novel intelligence infrastructure for peace-making. Using advanced data tools to capture, analyze, and track human needs at individual, organizational, community, regional, and global scales, the Observatory aims to uncover new strategies and opportunities for building peace.'),
          ], 'Support Observatory', lead='Address human needs with intelligent strategies.')}
          {pager('global-needs-observatory')}
        </div>
        <aside class="aside" aria-label="Support and more programs">
          {give_card('Support this program', 'Action Matters', 'Address human needs with cutting-edge intelligent strategies for peace-making', 'Support Observatory')}
          {other_programs('global-needs-observatory')}
        </aside>
      </div>
    </section>'''

programs_hero = phero('{r}', 'Programs', [], 'Our programs', 'Ways we bring compassion <em>to life</em>',
    lede='Four programs, one purpose: meaningful, proven and lasting peace education for everyone, everywhere.')

# What the programs page shows for each program: its picture, a few lines, the link's words, and a status if it has one.
PROGRAM_ROWS = {
    'scholarship-fund': ('<img src="{s}img/hands.jpg" alt="" loading="lazy">', 'Scholarships and logistical support, so that peace education is never limited by privilege or circumstance.', 'See More About the Fund', ''),
    'research-initiative': ('<img src="{s}img/online.jpg" alt="" loading="lazy">', 'Evaluating the impact of peace education training with robust science', 'See the Initiative', ''),
    'archive': (WAVE, '25 years of compassion-centered teaching are digitized, translated, and indexed into a global online library in over 240 languages', 'Inside the Archive', ''),
    'global-needs-observatory': (STARMAP, 'Mapping universal human needs, procuring resource data, and applying Intelligence to create breakthrough conflict resolution strategies.', 'Inside the Observatory', 'Forming'),
}

def program_rows():
    rows = []
    for slug, title, sub in PROGRAMS:
        media, text, label, status = PROGRAM_ROWS[slug]
        tag = f' <span class="status">{status}</span>' if status else ''
        rows.append(f'''<article class="prog reveal">
          <a class="prog-media" href="{slug}/" tabindex="-1" aria-hidden="true">{media}</a>
          <div>
            <p class="prog-n">Program{tag}</p>
            <h2><a href="{slug}/">{title}</a></h2>
            <p class="prog-sub">{sub}</p>
            <p>{text}</p>
            <a class="more" href="{slug}/">{label} <span aria-hidden="true">→</span></a>
          </div>
        </article>''')
    return '\n        '.join(rows)

programs_body = f'''<section class="pbody">
      <div class="wrap prog-list">
        {program_rows()}
      </div>
    </section>'''

# ---------- The Promise of Needs Awareness ----------
# The foundation's words (November 2026), shown on the home page and, after "Our History", on About.
# Both pages get exactly this markup, so a change made in the editor on one shows on the other.

# "&#8288;" before each long dash is an invisible joiner: it keeps the dash on the line of the word before it,
# so no line of the paragraph starts with a dash. link: what follows the text (the home page's link to About).
def needs_awareness(link=''):
    return f'''<div class="wrap why-grid promise-grid">
        <div class="why-head reveal">
          <h2 class="big" id="needs-awareness-h">The Promise of <em>Needs Awareness</em></h2>
        </div>
        <div class="why-body">
          <p class="reveal">At the heart of our educational philosophy is <strong>Needs Awareness</strong>&#8288;—an approach that focuses on understanding universal human needs. By helping people recognize the shared human experiences beneath judgments, disagreements, and conflict, Needs Awareness provides a practical foundation for peace at every level of society: from individual self-understanding and emotional resilience to deeper interpersonal empathy, stronger community cooperation, and cross-cultural peacebuilding.</p>
          <p class="reveal">Drawing on founder Thom Bond’s engineering background, the Foundation approaches peace not merely as a moral aspiration, but as something that can be systematically understood, taught, practiced, and evaluated. Through this lens, peace becomes an actionable skill set&#8288;—giving people anywhere in the world the tools to navigate differences and build life-serving relationships and environments.</p>
        </div>{link}
      </div>'''

# ---------- about ----------

about_hero = phero('{r}', 'About', [], 'About us', 'Peace education for <em>everyone</em>',
    lede='The Compassion Course Foundation Inc is a 501(c)(3) nonprofit dedicated to helping individuals gain access to meaningful, proven and lasting peace education, and ultimately co-creating a more humane and sustainable world.')

about_body = f'''<section class="pbody">
      <div class="wrap why-grid">
        <div class="why-head reveal">
          <p class="kicker">Why we exist</p>
          <h2 class="big">Peace is built <em>before</em> conflict begins.</h2>
          <p>Communities around the globe are facing rising levels of polarization, stress, and conflict. While the overwhelming majority of peace efforts focus on resolving conflict after it has escalated, research across psychology, education, and peace studies consistently shows that peace is most effectively built by cultivating the skills, mindsets, and relationships that prevent conflict in the first place. <strong>This is the heart of peace education.</strong></p>
        </div>
        <div class="why-body">
          <p class="reveal">Effective peace education improves all human relationships, from personal to family, to community and region. It equips people with the ability to understand their own needs, communicate effectively, regulate emotions, and empathize across differences. Studies from UNESCO, the Global Partnership for the Prevention of Armed Conflict, and numerous academic programs have affirmed that peace education contributes to:</p>
          <ul class="benefits">
            <li class="reveal"><span>01</span>Reduced interpersonal and community violence</li>
            <li class="reveal"><span>02</span>Improved emotional resilience and self-regulation</li>
            <li class="reveal"><span>03</span>Greater social cohesion and empathy across cultures</li>
            <li class="reveal"><span>04</span>Increased capacity for collaboration and conflict transformation</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="band" aria-label="Our belief">
      <img src="{{s}}img/friends-horizon.jpg" alt="" loading="lazy">
      <div class="wrap band-in reveal">
        <blockquote>“Peace education is not simply a curriculum — it is a strategy for transforming our collective challenges, a survival tool.”</blockquote>
        <p>When people learn concrete tools for understanding and resolving conflict, they are better able to navigate differences, de-escalate tensions, and create environments where everyone’s needs matter.</p>
      </div>
    </section>

    <section class="sec mission" style="padding-top: clamp(80px, 11vw, 140px); background: var(--cream)">
      <div class="wrap">
        <p class="kicker reveal">What we stand for</p>
        <div class="mv">
          <article class="mv-card reveal">
            <span class="mv-ico" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><g stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/></g></svg></span>
            <h2>Our Mission</h2>
            <p>To increase the quality and sustainability of life by maintaining, improving, and expanding our global peace education network</p>
          </article>
          <article class="mv-card reveal">
            <span class="mv-ico" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M4 32h40" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M12 32a12 12 0 0 1 24 0" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M10 40h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".5"/></svg></span>
            <h2>Our Vision</h2>
            <p>A world where peace is learned, practiced, and shared</p>
          </article>
        </div>
      </div>
    </section>

    <section class="sec history" aria-labelledby="history-h">
      <div class="wrap history-grid">
        <div class="history-head reveal">
          <p class="kicker">Since 2002</p>
          <h2 class="big" id="history-h">Our <em>History</em></h2>
          <p class="history-lead">The Compassion Course Foundation, Inc. is the culmination of more than two decades of educational innovation, community building, and dedication to a simple yet profound idea: peace can be learned, practiced, and shared.</p>
        </div>
        <ol class="history-steps">
          <li class="reveal"><b>2002</b><p>Our story began in 2002 when Cofounder and Executive Director Thom Bond encountered the work of Marshall Rosenberg, the creator of Nonviolent Communication (NVC). In 2003, Thom, Marshall Rosenberg, and Nellie Bright co-founded the New York Center for Nonviolent Communication (NYCNVC) with a growing community of educators and practitioners, establishing a hub for compassionate living centered on Needs Awareness—the recognition that universal human needs are fundamental to understanding ourselves, one another, and conflict.</p></li>
          <li class="reveal"><b>2011</b><p>Over the following years, this approach evolved into a comprehensive educational methodology. In 2011, Thom launched The Compassion Course, a structured, year-long online framework grounded in NVC and Needs Awareness that has since served over 50,000 registrants across 120 countries in 20 languages. This global curriculum also became the basis for <em>The Compassion Book</em>, providing practical tools for readers, educators, and practice groups seeking deeper understanding and cooperation.</p></li>
          <li class="reveal"><b>Today</b><p>Today, The Compassion Course Foundation, Inc. represents the next stage of this movement. By transforming an established educational network into a sustainable international resource, the Foundation expands global community coordination and meets the growing worldwide demand for accessible peace education.</p></li>
        </ol>
      </div>
    </section>

    <section class="sec promise" aria-labelledby="needs-awareness-h">
      {needs_awareness()}
    </section>

    <section class="sec programs" aria-labelledby="board-h">
      <div class="wrap">
        <div class="sec-head split reveal">
          <div>
            <p class="kicker">Our board</p>
            <h2 class="big" id="board-h">The people <em>behind</em> the work</h2>
          </div>
          <a class="more" href="{{r}}board/">Meet the Board <span aria-hidden="true">→</span></a>
        </div>
        <div class="mini-board">
          <a class="mini reveal" href="{{r}}board/#thom-bond">
            <div class="portrait"><img src="{THOM_IMG}" alt="" loading="lazy"></div>
            <div><b>Thom Bond</b><small>Cofounder and Executive Director</small></div>
          </a>
          <a class="mini reveal" href="{{r}}board/#debra-chew">
            <div class="portrait"><img src="{DEBRA_IMG}" alt="" loading="lazy"></div>
            <div><b>Debra Chew, M.D., M.P.H</b><small>Secretary and Treasurer</small></div>
          </a>
          <a class="mini reveal" href="{{r}}board/#hyder-mohyuddin">
            <div class="portrait"><img src="{HYDER_IMG}" alt="" loading="lazy"></div>
            <div><b>Hyder Mohyuddin</b><small>Chief Information Officer</small></div>
          </a>
        </div>
      </div>
    </section>

    <section class="sec involved">
      <div class="wrap">
        <div class="sec-head center reveal">
          <p class="kicker">Where to next</p>
          <h2 class="big">Join us in making a difference.</h2>
        </div>
        <div class="ways">
          <a class="way reveal" href="{{r}}donate/" data-donate>
            <span class="way-n">Give</span>
            <h3>Donate Here</h3>
            <p>Fund scholarships and peace education programs</p>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
          <a class="way reveal" href="{{r}}programs/">
            <span class="way-n">Learn</span>
            <h3>Participate</h3>
            <p>Take a course, join an event, and bring what you learn home to the people you love.</p>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
          <a class="way reveal" href="{{r}}news/">
            <span class="way-n">Follow</span>
            <h3>Stay in touch</h3>
            <p>Read the latest essays, listen to the podcast, and join our mailing list.</p>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>'''

# ---------- board ----------

board_hero = phero('{r}', 'Board members', [('About', '{r}about/')], 'Board members', 'The people <em>behind</em> the work',
    lede='Meet the board guiding the Compassion Course Foundation.')

board_body = f'''<section class="pbody">
      <div class="wrap members">
        <article class="member" id="thom-bond">
          <div class="portrait reveal"><img src="{THOM_IMG}" alt="Thom Bond" loading="lazy"></div>
          <div class="reveal">
            <p class="kicker">Cofounder and Executive Director</p>
            <h2>Thom Bond</h2>
            <p>Thom Bond is best known as the creator and leader of The Compassion Course, a comprehensive online training that has served over 50,000 participants and been translated into 20 languages in over 120 countries.</p>
            <p>Thom is the author of The Compassion Book, the creator of “The Exercise – Shifting Toward Compassion” (<a href="https://theexercise.org" target="_blank" rel="noopener">theexercise.org</a>), and “64 Days for Peace”, an open source, online, self-led small-group introductory curriculum.</p>
            <p>He is a founder and the Director of Education for NYCNVC (The New York Center for Nonviolent Communication, a United Nations Civil Society Organization) and the founder and Director of Education for Bushfield Farms (a demonstration farm and educational center, focused on sustainability and social reform). He is a former member and Advisory Board Member for the Communications Coordination Committee for the United Nations (CCCUN).</p>
            {social('{s}', 'social light')}
          </div>
        </article>
        <article class="member" id="debra-chew">
          <div class="portrait reveal"><img src="{DEBRA_IMG}" alt="Debra Chew" loading="lazy"></div>
          <div class="reveal">
            <p class="kicker">Secretary and Treasurer</p>
            <h2>Debra Chew, M.D., M.P.H</h2>
            <p>Dr. Debra Chew, M.D., MPH, is a physician, epidemiologist, educator, and public health leader committed to advancing compassionate, evidence-based care. She has more than three decades of experience in patient care, medical education, hospital leadership, and scientific research, in academia and public health, most recently as the Associate Professor of Medicine at Rutgers New Jersey Medical School and University Hospital in Newark, New Jersey.</p>
            <p>Dr. Chew has trained in Nonviolent Communication and Needs Based Awareness, as a participant of The Compassion Course. She will help lead the Global Peace Education Research Initiative.</p>
          </div>
        </article>
        <article class="member" id="hyder-mohyuddin">
          <div class="portrait reveal"><img src="{HYDER_IMG}" alt="Hyder Mohyuddin" loading="lazy"></div>
          <div class="reveal">
            <p class="kicker">Chief Information Officer</p>
            <h2>Hyder Mohyuddin</h2>
            <p>Hyder Mohyuddin is a software engineer who built this website and maintains the Compassion Course’s online platform.</p>
            <p>Hyder has a major in Computer Science and a minor in Visual Arts from the University of Chicago, and worked there on generative image research. A tutor since 2016, Hyder has also helped teach coding with Code Platoon and Code Your Dreams.</p>
          </div>
        </article>
      </div>
    </section>'''

# ---------- news and updates: things to read and listen to, the dates coming up, and the mailing list ----------

SKEL = '<article class="post-card skel"><div class="post-art"></div><div class="post-text"><i></i><i></i><i></i><i></i></div></article>'

news_hero = phero('{r}', 'News and Updates', [], 'From the Foundation', 'News and <em>Updates</em>',
    lede='Explore our educational resources, see what is coming up, and join our mailing list.')

# The podcast's own address, engineeringpeace.com, forwards to this page, but only over plain http.
PODCAST = 'https://thombond.buzzsprout.com/'
# The episodes the foundation recommends: the title as the foundation gave it, the length, and the episode's page.
EPISODES = [
    ('What Peace Sounds Like', '12 min', 'https://thombond.buzzsprout.com/902635/episodes/2872339-what-peace-sounds-like'),
    ('Peace Educators Speak Out: Tending the Garden of Peace', '71 min', 'https://thombond.buzzsprout.com/902635/episodes/14877502-peace-educators-speak-out-tending-the-garden-of-nonviolence-in-2024'),
    ('Waging Peace from New York to Tel Aviv', '46 min', 'https://thombond.buzzsprout.com/902635/episodes/15239725-waging-peace-from-new-york-to-tel-aviv-the-work-dreams-and-sorrows'),
]
NEEDS_LIST = 'https://static1.squarespace.com/static/5d4cf8c40e6b2e00019c54ae/t/5d785c3c4163c45846e8f54c/1568169020460/needs.pdf'

def episodes():
    return ''.join(f'''
              <li><a href="{url}" target="_blank" rel="noopener"><span class="ep-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.5 5.6v12.8l10.6-6.4z"/></svg></span><span class="ep-text"><b>{title}</b><small>{length}</small></span></a></li>''' for title, length, url in EPISODES)

# Dates written into the page, for as long as they are not events in the database.
#   data-fixed  the date's own name. Once an editor moves a date into the editor's Events list, that name is
#               saved in the database (content.js, DATES_FIELD) and shared/cms.js stops showing this copy.
#   data-until  its last day: after it, shared/cms.js takes the date off the page, so nothing here goes stale.
#   data-date   where it sorts among the events from the database, which join the same list.
# The editor's Events tab reads this list from the built page to offer "Move them into this list".
def fixed_event(name, day, month, year, title, when, datetime, sort, until):
    badge = f'<b>{day}</b><span>{month}</span><small>{year}</small>' if day else f'<b>{month}</b><small>{year}</small>'
    return f'''<li class="event" data-fixed="{name}" data-date="{sort}" data-until="{until}">
                <div class="event-date{'' if day else ' month'}" aria-hidden="true">{badge}</div>
                <div>
                  <h3>{title}</h3>
                  <p class="event-meta"><time datetime="{datetime}">{when}</time></p>
                  <a class="more" href="{{r}}donate/" data-donate>Donate <span aria-hidden="true">→</span></a>
                </div>
              </li>'''

FIXED_EVENTS = '\n              '.join([
    fixed_event('tax-deadline-2026', '31', 'Dec', '2026', 'Deadline for 2026 tax year donations', 'Thursday, December 31, 2026', '2026-12-31', '2026-12-31', '2026-12-31'),
    fixed_event('q4-fundraiser-2026', '', 'Dec', '2026', '4th Quarter Fundraiser', 'December 2026', '2026-12', '2026-12-31', '2026-12-31'),
])

news_body = f'''<section class="pbody paper" id="resources">
      <div class="wrap">
        <div class="sec-head reveal">
          <p class="kicker">Read, listen, practice</p>
          <h2 class="big">Explore our educational <em>resources</em></h2>
        </div>

        <div class="res" data-cms="blog-list" data-href="{{r}}blog/post.html?id=" data-limit="3">
          <div class="res-head reveal">
            <div>
              <h3>Read our latest blog posts</h3>
              <p>Essays and reflections on peace</p>
            </div>
            <a class="more" href="{{r}}blog/" data-cms-more hidden>All essays <span aria-hidden="true">→</span></a>
          </div>
          <div class="posts" data-posts>{SKEL * 3}</div>
          <p class="cms-note" data-cms-empty data-say="No essays yet. Check back soon." hidden></p>
          <p class="cms-note" data-cms-error data-say="We couldn’t load the essays just now. Please try again in a moment." hidden></p>
        </div>

        <div class="res-pair">
          <div class="pod reveal">
            <span class="pod-ico" aria-hidden="true"><svg><use href="{{s}}img/social.svg#podcast"/></svg></span>
            <h3>Tune into recommended podcast episodes</h3>
            <p class="pod-show"><a href="{PODCAST}" target="_blank" rel="noopener">Engineering Peace with Thom Bond</a></p>
            <ol class="eps">{episodes()}
            </ol>
            <a class="more" href="{PODCAST}" target="_blank" rel="noopener">All Episodes <span aria-hidden="true">→</span></a>
          </div>
          <div class="needs-card reveal">
            <span class="mv-ico" aria-hidden="true">{ICON['heart']}</span>
            <h3>Feelings and Needs List</h3>
            <p>A printable reference to keep beside you as you practice.</p>
            <a class="btn btn-ink" href="{NEEDS_LIST}" target="_blank" rel="noopener">Open the List <small>(PDF)</small></a>
          </div>
        </div>
      </div>
    </section>

    <section class="sec dates" id="events">
      <div class="wrap split news-split">
        <div>
          <div class="sec-head reveal">
            <p class="kicker">Dates to know</p>
            <h2 class="big">Events</h2>
          </div>
          <div data-cms="events">
            <ol class="events" data-events-list>
              {FIXED_EVENTS}
            </ol>
            <div class="empty" data-events-empty hidden>
              {ICON['horizon']}
              <h3 data-say="Nothing on the calendar just yet"></h3>
              <p data-events-note data-say="New dates are shared with our mailing list first."></p>
            </div>
          </div>
        </div>
        <div class="form-card reveal" id="mailing-list">
          <h2>Join our Mailing List</h2>
          <p>News from the Foundation, new essays and upcoming events, by email.</p>
          <form class="form" data-form="newsletter">
            <div class="field"><label for="ml-name">Name</label><input id="ml-name" name="name" required maxlength="120" autocomplete="name"></div>
            <div class="field"><label for="ml-place">Town / country <small>(optional)</small></label><input id="ml-place" name="location" maxlength="120"></div>
            <div class="field"><label for="ml-email">Email</label><input id="ml-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
            <button class="btn btn-sun" type="submit">Join the mailing list</button>
            <p class="form-msg" data-form-msg role="status"></p>
          </form>
        </div>
      </div>
    </section>'''

# ---------- essays: the full list, and one essay. They belong to News and Updates ----------

blog_hero = phero('{r}', 'Essays', [('News and Updates', '{r}news/')], 'Essays', 'Writing on <em>peace</em>',
    lede='Essays and reflections from Thom Bond and the Compassion Course community.')

blog_body = f'''<section class="pbody paper">
      <div class="wrap" data-cms="blog-list" data-href="post.html?id=">
        <div class="posts two featured" data-posts>{SKEL * 3}</div>
        <p class="cms-note" data-cms-empty data-say="No essays yet. Check back soon." hidden></p>
        <p class="cms-note" data-cms-error data-say="We couldn’t load the essays just now. Please try again in a moment." hidden></p>
      </div>
    </section>'''

post_hero = f'''<section class="phero post" data-cms="blog-post">
      {sky()}
      <div class="wrap">
        <div class="phero-in">
          {crumbs('{r}', [('News and Updates', '{r}news/')])}
          <p class="eyebrow"><span class="dot"></span>Essay</p>
          <h1 data-post-title><span class="ph-skel"></span><span class="ph-skel short"></span></h1>
          <p class="phero-sub" data-post-sub hidden></p>
          <p class="byline" data-post-by></p>
        </div>
      </div>
    </section>'''

post_body = f'''<section class="pbody">
      <div class="wrap">
        <article class="read" data-post-body aria-live="polite"><p class="cms-note">Loading the essay…</p></article>
        <div class="author" data-post-author hidden>
          <img src="{THOM_IMG}" alt="" loading="lazy">
          <div>
            <b>Thom Bond</b>
            <p>Cofounder and Executive Director of the Compassion Course Foundation, and creator of The Compassion Course. <a href="{{r}}board/#thom-bond">More about Thom →</a></p>
          </div>
        </div>
        <div class="more-posts" data-cms="blog-list" data-href="post.html?id=" data-limit="2" data-exclude-current hidden>
          <div class="sec-head split">
            <div><p class="kicker">Keep reading</p><h2 class="big">More <em>essays</em></h2></div>
            <a class="more" href="./">All essays <span aria-hidden="true">→</span></a>
          </div>
          <div class="posts two" data-posts></div>
        </div>
      </div>
    </section>'''

# ---------- contact ----------

contact_hero = phero('{r}', 'Contact', [], 'Contact', 'We’d love to <em>hear</em> from you',
    lede='Send us a message and we’ll respond as soon as possible.')

# The contact form is the foundation's own Jotform. Its questions, its thank-you note and where its messages
# are sent are all set at jotform.com by the foundation, not here: this page only shows it, in a frame, and
# shared/contact.js keeps the frame as tall as the form. To show a different form, change the number.
# The logo at the top of the card is the form's own, so it shows once whether or not the foundation has pasted
# the styling kept in _reference/jotform/contact-form.css into the form (that styling sizes it; it does not hide
# it). Until 20 November 2026 the page showed its own copy above the form, and the form's showed under it.
JOTFORM = '263233512254045'
JOTFORM_AT = f'https://form.jotform.com/{JOTFORM}'
CONTACT_JS = '\n  <script type="module" src="{s}contact.js"></script>'

contact_body = f'''<section class="pbody">
      <div class="wrap split">
        <div class="contact-aside">
          <div class="side-list addr reveal">
            <h4>Mailing address</h4>
            <address>Compassion Course Foundation Inc<br>PO Box 1031<br>Livingston Manor NY 12758</address>
          </div>
          <div class="give-card reveal">
            <span class="way-n">Support the work</span>
            <h3>Help peace education reach everyone</h3>
            <p>Your gift funds scholarships and peace education programs around the world.</p>
            <a class="btn btn-sun" href="{{r}}donate/" data-donate>Donate Here</a>
          </div>
          <div class="side-list reveal">
            {social('{s}', 'social light')}
          </div>
        </div>
        <div class="form-card jot reveal">
          <div class="jot-clip" data-jotform-clip>
            <iframe class="jot-frame" data-jotform="{JOTFORM}" src="{JOTFORM_AT}?isIframeEmbed=1" title="Contact The Compassion Course Foundation" scrolling="no"></iframe>
          </div>
          <p class="jot-alt" data-jotform-alt hidden>The form is taking a while to appear. <a href="{JOTFORM_AT}" target="_blank" rel="noopener">Open the Form in a New Tab</a></p>
        </div>
      </div>
    </section>'''


# ---------- donate (also where Stripe returns donors: /donate?success=true or ?canceled=true) ----------

donate_hero = phero('{r}', 'Donate', [], 'Donate', 'Give to the <em>work</em>',
    lede='Your gift funds scholarships and peace education programs throughout the world.')

donate_body = f"""<section class="pbody">
      <div class="wrap split">
        <div class="split-head">
          <p class="kicker reveal">What giving supports</p>
          <h2 class="big reveal">Peace education for everyone, <em>everywhere</em>.</h2>
          <p class="reveal">To ensure that peace education is available to all, the Fund provides scholarships and logistical support to individuals and groups who would otherwise face financial or geographic barriers</p>
          <div class="side-list reveal">
            <h4>Our programs</h4>{''.join(f'{chr(10)}            <a href="{{r}}programs/{slug}/"><b>{t}</b><small>{sub}</small></a>' for slug, t, sub in PROGRAMS)}
          </div>
        </div>
        <div class="form-card give-panel reveal">
          <h2>Make a gift</h2>
          <p>Choose a currency and an amount, then pay securely through Stripe by card, Apple Pay or Google Pay.</p>
          <a class="btn btn-sun" href="#main" data-donate data-donate-auto>Choose an amount</a>
          <noscript><p class="fine">Giving online needs JavaScript switched on in your browser.</p></noscript>
          <ul class="fine-list">
            <li>To receive an email receipt, enter your email address when prompted during checkout.</li>
            <li>The Compassion Course Foundation, Inc. is a 501(c)(3) nonprofit corporation.</li>
          </ul>
        </div>
      </div>
    </section>"""

# ---------- not found (the host serves 404.html for any missing address) ----------

HEAD_404 = r"""
  <meta name="robots" content="noindex">
  <base href="/">
  <script>
    // This page is served for any missing address, at any depth, so every link on it starts from
    // the site's root: "/" on its own domain (the <base> above), or "/<repository>/" on a
    // github.io project address (set here). Then addresses that have moved are forwarded.
    (function () {
      var root = /\.github\.io$/.test(location.hostname) ? '/' + location.pathname.split('/')[1] + '/' : '/';
      if (root !== '/') document.querySelector('base').href = root;

      var path = '/' + location.pathname.slice(root.length).replace(/\/+$/, ''), hash = location.hash, m, to;
      // Program pages on the previous compassioncf.com were named by database id. Two pages of this site
      // were renamed in November 2026, when the foundation gave their programs new names.
      var programs = { ZyIg3cMJCw15DfgstFoW: 'research-initiative', bDzzWW2ECxSOVlSHFSa7: 'scholarship-fund', skFlbSRJEvjbV0rnLPDF: 'archive',
        'compassion-course': 'research-initiative', 'course-fund': 'scholarship-fund' };
      if ((m = path.match(/^\/programs\/([^\/]+)$/))) to = 'programs/' + (programs[m[1]] ? programs[m[1]] + '/' : '');
      else if ((m = path.match(/^\/blog\/([A-Za-z0-9_-]+)$/))) to = 'blog/post.html?id=' + encodeURIComponent(m[1]);
      else if (path === '/events') { to = 'news/'; hash = hash || '#events'; }   // Events and Blog became one page, News and Updates
      else if (path === '/volunteer') to = 'contact/';   // the volunteer page was taken down
      else if ((m = path.match(/^\/v1(\/.*)?$/))) to = (m[1] || '/').slice(1);   // this site, while it was one of five designs under review
      else if (/^\/admin\/.+/.test(path)) to = 'admin/';   // inner addresses of the previous admin panel
      else if (/^\/(home|v[2-5](\/.*)?)$/.test(path)) to = '';
      if (to != null) {
        document.documentElement.style.visibility = 'hidden';
        location.replace(root + to + (to.indexOf('?') < 0 ? location.search : '') + hash);
      }
    })();
  </script>"""

# With <base> set, "#main" would point at the home page; keep the skip link on this page.
SKIP_404 = """
  <script>document.querySelector('.skip').setAttribute('href', location.pathname + location.search + '#main');</script>"""

notfound_hero = phero('{r}', 'Page not found', [], 'Page not found', 'We couldn’t find <em>that page</em>',
    lede='The address may be out of date, or the page may have moved when the site was redesigned.')

notfound_body = f"""<section class="pbody">
      <div class="wrap">
        <div class="empty">
          {ICON['horizon']}
          <h2>Let’s find your way back</h2>
          <p>These are good places to start.</p>
          <div class="cta">
            <a class="btn btn-ink" href="{{r}}">Home</a>
            <a class="btn btn-line" href="{{r}}programs/">Programs</a>
            <a class="btn btn-line" href="{{r}}news/">News and Updates</a>
            <a class="btn btn-line" href="{{r}}contact/">Contact Us</a>
          </div>
        </div>
      </div>
    </section>"""

# ---------- the editor: sign-in, essays, events, inbox, mailing list. Everything in it is drawn by shared/admin/app.js ----------

# This page is a tool, so it has no hero: the "no-hero" body class makes the header solid and starts
# the editor right under it. The heading is there for screen readers only.
admin_body = """<section class="pbody">
      <div class="wrap">
        <h1 class="sr" data-no-edit>Site editor</h1>
        <div class="adm" data-admin-app>
          <p class="adm-load">Loading the editor…</p>
          <noscript><p class="adm-load">The editor needs JavaScript switched on in your browser.</p></noscript>
        </div>
      </div>
    </section>"""

ADMIN_JS = '\n  <script type="module" src="{s}admin/app.js"></script>'
NOINDEX = '\n  <meta name="robots" content="noindex">'

CMS_JS = '\n  <script type="module" src="{s}cms.js"></script>'

PAGES = [
    ('about/index.html', 'About us', 'Why peace education matters, our history, and who we are: the Compassion Course Foundation, a 501(c)(3) nonprofit.', 'about', about_hero, about_body, ''),
    ('programs/index.html', 'Programs', 'The Peace Engineering Scholarship Fund, the Global Peace Education Research Initiative, the Archive Program and the Global Human Needs Observatory.', 'programs', programs_hero, programs_body, ''),
    ('programs/scholarship-fund/index.html', 'The Peace Engineering Scholarship Fund', 'The Peace Engineering Scholarship Fund: scholarships and logistical support, so that peace education is never limited by privilege or circumstance.', 'programs', fund_hero, fund_body, ''),
    ('programs/research-initiative/index.html', 'The Global Peace Education Research Initiative', 'The Global Peace Education Research Initiative: evaluating the impact of peace education training with robust science.', 'programs', research_hero, research_body, ''),
    ('programs/archive/index.html', 'The Archive Program', 'The Archive Program: a multilingual, global digital library preserving 25 years of peace education history.', 'programs', archive_hero, archive_body, ''),
    ('programs/global-needs-observatory/index.html', 'Global Human Needs Observatory', 'Global Human Needs Observatory: a needs-based framework and infrastructure for peace engineering. This program is forming.', 'programs', obs_hero, obs_body, ''),
    ('news/index.html', 'News and Updates', 'Essays, recommended podcast episodes, the Feelings and Needs List, upcoming dates and the mailing list of the Compassion Course Foundation.', 'news', news_hero, news_body, CMS_JS),
    ('board/index.html', 'Board members', 'Meet the board guiding the Compassion Course Foundation.', 'about', board_hero, board_body, ''),
    ('blog/index.html', 'Essays', 'Essays and reflections from Thom Bond and the Compassion Course community.', 'news', blog_hero, blog_body, CMS_JS),
    ('blog/post.html', 'Essay', 'An essay from the Compassion Course Foundation.', 'news', post_hero, post_body, CMS_JS),
    ('contact/index.html', 'Contact us', 'Get in touch with the Compassion Course Foundation.', 'contact', contact_hero, contact_body, CONTACT_JS),
    ('donate/index.html', 'Donate', 'Give to the Compassion Course Foundation: secure online donations through Stripe.', None, donate_hero, donate_body, ''),
]

for path, title, desc, active, hero, body, js in PAGES:
    page(path, title, desc, active, hero, body, js)

page('admin/index.html', 'Site editor', 'Sign in to edit the Compassion Course Foundation website.', None, '', admin_body, ADMIN_JS, head=NOINDEX, body_class='no-hero')
page('404.html', 'Page not found', 'This page could not be found.', None, notfound_hero, notfound_body, SKIP_404, head=HEAD_404)

# Pages this script used to build. Their files are removed so an old copy can't stay published;
# 404.html forwards their addresses (events/ to News and Updates, volunteer/ to the contact page,
# and the two program pages to the addresses they have now).
for old in ('events/index.html', 'volunteer/index.html', 'programs/course-fund/index.html', 'programs/compassion-course/index.html'):
    stale = os.path.join(SITE, old)
    if os.path.exists(stale):
        os.remove(stale)
        try:
            os.rmdir(os.path.dirname(stale))
        except OSError:
            pass
        print('removed', stale)

# ---------- home page: written by hand; its header, footer and program cards come from here ----------

# What each program's card on the home page shows: its picture, one line, the link's words, and a status if it has one.
HOME_CARDS = {
    'scholarship-fund': ('<img src="shared/img/hands.jpg" alt="Many hands stacked together in a circle" loading="lazy">', 'Scholarships and logistical support, so that peace education is never limited by privilege or circumstance', 'See the Fund', ''),
    'research-initiative': ('<img src="shared/img/online.jpg" alt="An online class with many participants on a laptop screen" loading="lazy">', 'Evaluating the impact of peace education training with robust science', 'See the Initiative', ''),
    'archive': (WAVE, '25 years of compassion-centered teaching, digitized, translated, and indexed into a global online library in over 240 languages', 'Inside the Archive', ''),
    'global-needs-observatory': (STARMAP, 'A needs-based framework and infrastructure for peace engineering.', 'Inside the Observatory', 'Forming'),
}

def home_cards():
    cards = []
    for slug, title, sub in PROGRAMS:
        media, text, label, status = HOME_CARDS[slug]
        tag = f' <span class="status">{status}</span>' if status else ''
        cards.append(f'''<article class="card reveal">
            <div class="card-img">{media}</div>
            <div class="card-body">
              <p class="card-n">Program{tag}</p>
              <h3>{title}</h3>
              <p>{text}</p>
              <a href="programs/{slug}/" class="more">{label} <span aria-hidden="true">→</span></a>
            </div>
          </article>''')
    return '<div class="cards">\n          ' + '\n          '.join(cards) + '\n        </div>'

home = os.path.join(SITE, 'index.html')
with open(home, encoding='utf-8') as f:
    h = f.read()
h = re.sub(r'<header class="hdr".*?</header>', lambda m: header('', None, home=True), h, count=1, flags=re.S)
h = re.sub(r'<footer class="ftr">.*?</footer>', lambda m: footer('', home=True), h, count=1, flags=re.S)
h, cards_found = re.subn(r'(<!-- program cards:[^>]*-->).*?(<!-- /program cards -->)', lambda m: f'{m.group(1)}\n        {home_cards()}\n        {m.group(2)}', h, count=1, flags=re.S)
if not cards_found:
    sys.exit('index.html: the "program cards" markers are missing, so the cards were not written')
# The Promise of Needs Awareness, with the home page's link to About: under the title on a wide screen,
# after the text on a narrow one (see .promise-grid in style.css).
about_link = '\n        <a class="more reveal" href="about/">More About Us <span aria-hidden="true">→</span></a>'
h, promise_found = re.subn(r'(<!-- needs awareness:[^>]*-->).*?(<!-- /needs awareness -->)', lambda m: f'{m.group(1)}\n      {needs_awareness(about_link)}\n      {m.group(2)}', h, count=1, flags=re.S)
if not promise_found:
    sys.exit('index.html: the "needs awareness" markers are missing, so that section was not written')
with open(home, 'w', encoding='utf-8', newline='\n') as f:
    f.write(h)
print('synced', home)
