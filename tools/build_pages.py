"""Builds the site's pages from the templates in this file.

    python tools/build_pages.py

Every page except the home page is written whole: about/, programs/ and its three program
pages, events/, board/, blog/ and blog/post.html, volunteer/, contact/, donate/ and 404.html.
They share the header, footer and newsletter block defined below, so change those here.

Pages written by this script start with a "Built by" comment. Change them here and run the
script; edits made in those .html files are overwritten by the next run.

The home page (index.html) is written by hand. This script only replaces its <header> and
<footer> so they match the other pages.
"""
import math, os, re, sys

SITE = sys.argv[1] if len(sys.argv) > 1 else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

THOM_IMG = 'https://images.squarespace-cdn.com/content/v1/5dfa821b21876f38ff1126c5/1582068821253-37SLPK803AAVS3ZD061T/TMB-2018-small-4.jpg'
DEBRA_IMG = 'https://njms.rutgers.edu/mbmapp/public_html/pictures/ChewDebra.jpg'

NAV = [('about', 'About'), ('programs', 'Programs'), ('events', 'Events'), ('blog', 'Blog'), ('volunteer', 'Get involved'), ('contact', 'Contact')]

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

def footer(r, home=False, news_href='#newsletter'):
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
        <a href="{r}events/">Events</a>
        <a href="{r}blog/">Blog</a>
        <a href="{r}board/">Board members</a>
      </div>
      <div>
        <h4>Get involved</h4>
        <a href="{r}donate/" data-donate>Donate</a>
        <a href="{r}volunteer/">Volunteer</a>
        <a href="{news_href}">Newsletter</a>
        <a href="{r}contact/">Contact us</a>
      </div>
    </div>
    <div class="wrap ftr-base">© <span data-year>2026</span> Compassion Course Foundation, Inc. All rights reserved.</div>
  </footer>'''

def newsletter(s, n):
    return f'''<section class="sec news" id="newsletter">
      <div class="wrap news-in reveal">
        <img src="{s}img/mark-white.png" alt="" width="64" height="60">
        <h2>Letters from the dawn</h2>
        <p>Occasional, hopeful news from our community — stories, events and new ways to take part.</p>
        <form class="news-form" data-form="newsletter">
          <label class="sr" for="email{n}">Email address</label>
          <input id="email{n}" name="email" type="email" required maxlength="200" placeholder="you@example.com" autocomplete="email">
          <button class="btn btn-sun" type="submit">Subscribe</button>
          <p class="form-msg" data-form-msg role="status"></p>
        </form>
      </div>
    </section>'''

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

def page(path, title, desc, active, hero, body, n, extra_js='', home_link=False, head='', news=True):
    depth = path.count('/')  # 'about/index.html' -> 1
    r = '../' * depth
    s = r + 'shared/'
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
<body>
  <a class="skip" href="#main">Skip to content</a>

  {header(r, active)}

  <main id="main">
    {hero.replace('{r}', r).replace('{s}', s)}

    {body.replace('{r}', r).replace('{s}', s)}

    {newsletter(s, n) if news else ''}
  </main>

  {footer(r, news_href='#newsletter' if news else r + '#newsletter')}

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

PROGRAMS = [
    ('compassion-course', 'The Compassion Course', 'A Global Pathway to Peace'),
    ('course-fund', 'Removing Barriers', 'The Compassion Course Fund'),
    ('archive', 'The Archive Program', 'A library for the world'),
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
              <a href="{{r}}programs/"><b>All programs</b><small>Ways we bring compassion to life</small></a>
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
        out += '<a class="next" href="{r}programs/"><small>Back to →</small><b>All programs</b></a>'
    return out + '</nav>'

GLOBE_FACTS = [('3,898', 'places', '3898'), ('487', 'regions', '487'), ('6', 'continents', '')]

# ---------- programs ----------

course_hero = phero('{r}', 'The Compassion Course', [('Programs', '{r}programs/')], 'Program · 01', 'The Compassion Course', 'A Global Pathway to Peace',
    extra=facts([('15', 'years', ''), ('32,000+', 'participants', ''), ('120+', 'countries', ''), ('20', 'languages', '')], 'Changing lives around the world'))

course_body = f'''<section class="pbody">
      <div class="wrap article">
        <div class="prose">
          <p class="lead reveal">Changing lives for 15 years, in over 120 countries, in 20 languages. A year-long journey into the practical “how&nbsp;to” of compassion.</p>

          <h2 class="reveal">It has been proven to work</h2>
          <p class="reveal">The course provides the practical “how to” of creating more understanding, empathy, and compassion in our daily lives. The course starts with foundational concepts and practices that help us understand what engenders compassion and what blocks it, and as the year progresses, we work with more advanced practices that help us effectively bring more compassion into our everyday lives.</p>
          <ol class="movements reveal" aria-label="How the year unfolds">
            <li><small>First</small><b>Foundations</b><span>What engenders compassion, and what blocks it.</span></li>
            <li><small>Then</small><b>Deeper practice</b><span>More advanced practices as the year progresses.</span></li>
            <li><small>Always</small><b>Everyday life</b><span>Bringing more compassion into our everyday lives.</span></li>
          </ol>

          <h2 class="reveal">A growing, global community</h2>
          <p class="reveal">What began as a weekly email to share the tools of compassionate communication has grown into a vibrant community of tens of thousands around the world. Today, The Compassion Course is available in almost every major populated area on earth, on every side of every conflict, in native languages — a single, universal learning and teaching community.</p>
          <blockquote class="pull reveal">Its success demonstrates that people everywhere want these skills and are eager to integrate them into their families, workplaces, communities, and personal lives.</blockquote>
          {pager('compassion-course')}
        </div>
        <aside class="aside" aria-label="Support and more programs">
          {give_card('Support this program', 'Open the door for someone new', 'Gifts to the Compassion Course Fund help people join the course who would otherwise face financial or geographic barriers.', 'Give a scholarship')}
          {other_programs('compassion-course')}
        </aside>
      </div>
    </section>

    <section class="globe-band" aria-labelledby="globe-h">
      <div class="sky" aria-hidden="true"><div class="stars s1"></div><div class="stars s2"></div><div class="stars s3"></div></div>
      <div class="wrap globe-band-in">
        <div class="copy reveal">
          <p class="eyebrow"><span class="dot"></span>Community member globe</p>
          <h2 id="globe-h">A world already practising <em>compassion</em></h2>
          <p>Every point of light is a place where people have joined the Compassion Course. Drag the globe to explore, and look for your own corner of the world.</p>{facts(GLOBE_FACTS, 'where people have joined the course')}
        </div>
        <div class="hero-globe">
          <div id="globe"></div>
          <p class="hint"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M9 11.2V5.5a1.5 1.5 0 0 1 3 0V10h.5V8.5a1.5 1.5 0 0 1 3 0V10h.5a1.5 1.5 0 0 1 3 0v4.5A6.5 6.5 0 0 1 12.5 21h-.7a6 6 0 0 1-4.6-2.2L4.5 15.4a1.4 1.4 0 0 1 2-2L9 15z"/></svg> Drag to explore</p>
        </div>
      </div>
    </section>'''

course_js = '''
  <script type="module">
    import { lazyGlobe } from '{s}globe-lazy.js';
    lazyGlobe(document.getElementById('globe'), { marker: '246,184,96', hover: '240,120,100', maxSize: 620 });
  </script>'''

fund_hero = phero('{r}', 'Removing Barriers', [('Programs', '{r}programs/')], 'Program · 02', 'Removing Barriers', 'The Compassion Course Fund',
    lede='Scholarships and logistical support, so that peace education is never limited by privilege or circumstance.')

fund_body = f'''<section class="pbody">
      <div class="wrap article">
        <div class="prose">
          <p class="lead reveal">To ensure that peace education is available to all, the Compassion Course Fund provides scholarships and logistical support to individuals and groups who would otherwise face financial or geographic barriers.</p>

          <h2 class="reveal">What the Fund does</h2>
          <p class="reveal">By doing so, the Fund:</p>
          <ul class="benefits">
            <li class="reveal"><span>01</span>Expands global access to high-quality peace education</li>
            <li class="reveal"><span>02</span>Supports underserved communities, including those affected by conflict, displacement, or economic hardship</li>
            <li class="reveal"><span>03</span>Accelerates the spread of compassionate communication tools</li>
            <li class="reveal"><span>04</span>Strengthens networks of peace-builders who bring these skills back to their families, organizations, and communities</li>
          </ul>

          <blockquote class="pull reveal">The Fund ensures that the benefits of the Compassion Course are not limited by privilege or circumstance.</blockquote>
          <p class="reveal">It fuels a movement that empowers people everywhere to contribute to a more peaceful world.</p>

          <div class="callout reveal">
            <h2>Contribute to the Fund</h2>
            <p>If you would like to know more, or would like to contribute to this program, we’d love to hear from you.</p>
            <div class="cta">
              <a class="btn btn-sun" href="{{r}}donate/" data-donate>Give to the Fund</a>
              <a class="btn btn-line" href="{{r}}volunteer/">Get in touch</a>
            </div>
          </div>
          {pager('course-fund')}
        </div>
        <aside class="aside" aria-label="Support and more programs">
          {give_card('Fund a scholarship', 'Every gift opens a door', 'Your gift goes to scholarships and support for people who couldn’t otherwise take part.', 'Donate to the Fund')}
          {other_programs('course-fund')}
        </aside>
      </div>
    </section>'''

archive_hero = phero('{r}', 'The Archive Program', [('Programs', '{r}programs/')], 'Program · 03', 'The Archive Program', 'Preserving almost 25 years of compassion teaching',
    extra=facts([('Hundreds', 'of hours', ''), ('~25', 'years', ''), ('249', 'languages', '')], 'Becoming an online library of audio courses'))

archive_body = f'''<section class="pbody">
      <div class="wrap article">
        <div class="prose">
          <p class="lead reveal">The CCF has acquired hundreds of hours of digital content, reaching back almost 25 years, of Compassion Course conferences and workshops.</p>

          <h2 class="reveal">Voices in the collection</h2>
          <ul class="voices reveal">
            <li><b>Thom Bond</b><span>Creator of The Compassion Course</span></li>
            <li><b>Robert Gonzales</b><span>Conference and workshop content</span></li>
            <li><b>Marshall Rosenberg</b><span>Never-before-seen 720p video</span></li>
          </ul>

          <h2 class="reveal">From recordings to a living library</h2>
          <p class="reveal">The Archive Program is tasked with acquiring, protecting, translating, organizing and distributing this knowledge in the form of an online library of audio courses in 249 languages.</p>
          <ol class="timeline reveal">
            <li class="done"><b>Acquire</b><span class="tag">Complete</span><span>Gathering decades of conference and workshop recordings.</span></li>
            <li><b>Protect</b><span>Preserving the original recordings for the long term.</span></li>
            <li><b>Translate</b><span>Carrying the teaching into 249 languages.</span></li>
            <li><b>Organize</b><span>Shaping the material into audio courses.</span></li>
            <li><b>Distribute</b><span>Opening it to the world as an online library.</span></li>
          </ol>
          <p class="reveal">The first phase of content acquisition is complete and will shift to maintenance mode after the virtual library opens. The target date for opening is June 24, 2026.</p>

          <div class="callout reveal">
            <h2>Help build the library</h2>
            <p>If you would like to know more, or would like to contribute to this program, we’d love to hear from you.</p>
            <div class="cta">
              <a class="btn btn-ink" href="{{r}}volunteer/">Get in touch</a>
              <a class="btn btn-line" href="{{r}}donate/" data-donate>Support the archive</a>
            </div>
          </div>
          {pager('archive')}
        </div>
        <aside class="aside" aria-label="Support and more programs">
          {give_card('Support the archive', 'Keep the teaching alive', 'Help protect, translate and share decades of compassion teaching with the world.', 'Give to the archive')}
          {other_programs('archive')}
        </aside>
      </div>
    </section>'''

programs_hero = phero('{r}', 'Programs', [], 'Our programs', 'Ways we bring compassion <em>to life</em>',
    lede='Three programs, one purpose: meaningful, proven and lasting peace education for everyone, everywhere.')

programs_body = f'''<section class="pbody">
      <div class="wrap prog-list">
        <article class="prog reveal">
          <a class="prog-media" href="compassion-course/" tabindex="-1" aria-hidden="true"><img src="{{s}}img/online.jpg" alt="" loading="lazy"></a>
          <div>
            <p class="prog-n">01 — Program</p>
            <h2><a href="compassion-course/">The Compassion Course</a></h2>
            <p class="prog-sub">A Global Pathway to Peace</p>
            <p>The practical “how to” of creating more understanding, empathy and compassion in daily life. Changing lives for 15 years, in over 120 countries and 20 languages.</p>
            <a class="more" href="compassion-course/">Explore the course <span aria-hidden="true">→</span></a>
          </div>
        </article>
        <article class="prog reveal">
          <a class="prog-media" href="course-fund/" tabindex="-1" aria-hidden="true"><img src="{{s}}img/hands.jpg" alt="" loading="lazy"></a>
          <div>
            <p class="prog-n">02 — Program</p>
            <h2><a href="course-fund/">Removing Barriers</a></h2>
            <p class="prog-sub">The Compassion Course Fund</p>
            <p>Scholarships and logistical support for individuals and groups who would otherwise face financial or geographic barriers to peace education.</p>
            <a class="more" href="course-fund/">See how the Fund works <span aria-hidden="true">→</span></a>
          </div>
        </article>
        <article class="prog reveal">
          <a class="prog-media" href="archive/" tabindex="-1" aria-hidden="true">{WAVE}</a>
          <div>
            <p class="prog-n">03 — Program</p>
            <h2><a href="archive/">The Archive Program</a></h2>
            <p class="prog-sub">A library for the world</p>
            <p>Hundreds of hours of teaching, reaching back almost 25 years, becoming an online library of audio courses in 249 languages.</p>
            <a class="more" href="archive/">Inside the archive <span aria-hidden="true">→</span></a>
          </div>
        </article>
      </div>
    </section>'''

# ---------- about ----------

about_hero = phero('{r}', 'About', [], 'About us', 'Peace education for <em>everyone</em>',
    lede='The Compassion Course Foundation, Inc. is a 501(c)(3) nonprofit dedicated to helping individuals gain access to meaningful, proven and lasting peace education, and ultimately co-creating a more humane and sustainable world.')

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
            <p>To foster compassion and understanding through educational programs and community initiatives that bring people together.</p>
          </article>
          <article class="mv-card reveal">
            <span class="mv-ico" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M4 32h40" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M12 32a12 12 0 0 1 24 0" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M10 40h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".5"/></svg></span>
            <h2>Our Vision</h2>
            <p>A world where compassion guides our interactions and creates positive change in communities everywhere.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="sec programs" aria-labelledby="board-h">
      <div class="wrap">
        <div class="sec-head split reveal">
          <div>
            <p class="kicker">Our board</p>
            <h2 class="big" id="board-h">The people <em>behind</em> the work</h2>
          </div>
          <a class="more" href="{{r}}board/">Meet the board <span aria-hidden="true">→</span></a>
        </div>
        <div class="mini-board">
          <a class="mini reveal" href="{{r}}board/#thom-bond">
            <div class="portrait"><img src="{THOM_IMG}" alt="" loading="lazy"></div>
            <div><b>Thom Bond</b><small>Cofounder and Executive Director</small></div>
          </a>
          <a class="mini reveal" href="{{r}}board/#debra-chew">
            <div class="portrait"><img src="{DEBRA_IMG}" alt="" loading="lazy"></div>
            <div><b>Dr. Debra Chew, M.D.</b><small>Treasurer</small></div>
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
            <h3>Donate</h3>
            <p>Fund scholarships and community programs that make peace education possible.</p>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
          <a class="way reveal" href="{{r}}volunteer/">
            <span class="way-n">Serve</span>
            <h3>Volunteer</h3>
            <p>Lend your time and talents to a growing, global community of practice.</p>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
          <a class="way reveal" href="{{r}}programs/">
            <span class="way-n">Learn</span>
            <h3>Participate</h3>
            <p>Take a course, join an event, and bring what you learn home to the people you love.</p>
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
            <p>Thom Bond is best known as the creator and leader of The Compassion Course, a comprehensive online training that has served over 32,000 participants and been translated into 20 languages in over 120 countries.</p>
            <p>Thom is the author of The Compassion Book, the creator of “The Exercise – Shifting Toward Compassion” (<a href="https://theexercise.org" target="_blank" rel="noopener">theexercise.org</a>), and “64 Days for Peace”, an open source, online, self-led small-group introductory curriculum.</p>
            <p>He is a founder and the Director of Education for NYCNVC (The New York Center for Nonviolent Communication, a United Nations Civil Society Organization) and the founder and Director of Education for Bushfield Farms (a demonstration farm and educational center, focused on sustainability and social reform). He is a former member and Advisory Board Member for the Communications Coordination Committee for the United Nations (CCCUN).</p>
            {social('{s}', 'social light')}
          </div>
        </article>
        <article class="member" id="debra-chew">
          <div class="portrait reveal"><img src="{DEBRA_IMG}" alt="Dr. Debra Chew" loading="lazy"></div>
          <div class="reveal">
            <p class="kicker">Treasurer</p>
            <h2>Dr. Debra Chew, M.D.</h2>
            <p>Dr. Debra Chew, M.D., MPH, is a physician, epidemiologist, public health leader, and educator committed to advancing compassionate, evidence-based care. She has worked in academia and the public health sector, most recently as the Associate Professor of Medicine at Rutgers New Jersey Medical School and University Hospital in Newark, NJ.</p>
            <p>She has more than three decades of experience in patient care, medical education, and scientific research, and has been the Principal Investigator and Co-Investigator of numerous National Institutes of Health grants.</p>
            <p>Equally important to her is the human side of medicine. Dr. Chew has trained in Nonviolent Communication and Needs Based Awareness, reflecting her belief that healing requires empathy, respect, and human connection. She has particular interest in advancing research in peace education.</p>
          </div>
        </article>
      </div>
    </section>'''

# ---------- events ----------

events_hero = phero('{r}', 'Events', [], 'Events', 'Gather, learn and <em>practise</em>',
    lede='Workshops, gatherings and online sessions from the Compassion Course community.')

events_body = f'''<section class="pbody">
      <div class="wrap" data-cms="events">
        <div class="ev-skel" data-events-loading aria-label="Loading events"><i></i><i></i></div>
        <ol class="events" data-events-list hidden></ol>
        <div class="empty" data-events-empty hidden>
          {ICON['horizon']}
          <h2>Nothing on the calendar just yet</h2>
          <p data-events-note>New gatherings are shared in our newsletter first. In the meantime, explore our programs or join the newsletter below.</p>
          <div class="cta">
            <a class="btn btn-ink" href="{{r}}programs/">Explore programs</a>
            <a class="btn btn-line" href="#newsletter">Join the newsletter</a>
          </div>
        </div>
      </div>
    </section>'''

# ---------- blog ----------

blog_hero = phero('{r}', 'Blog', [], 'Blog', 'Writing on <em>peace</em>',
    lede='Essays and reflections from Thom Bond and the Compassion Course community.')

SKEL = '<article class="post-card skel"><div class="post-art"></div><div class="post-text"><i></i><i></i><i></i><i></i></div></article>'

blog_body = f'''<section class="pbody paper">
      <div class="wrap" data-cms="blog-list" data-href="post.html?id=">
        <div class="posts two featured" data-posts>{SKEL * 3}</div>
        <p class="cms-note" data-cms-empty hidden>No essays yet. Check back soon.</p>
        <p class="cms-note" data-cms-error hidden>We couldn’t load the essays just now. Please try again in a moment.</p>
      </div>
    </section>'''

post_hero = f'''<section class="phero post" data-cms="blog-post">
      {sky()}
      <div class="wrap">
        <div class="phero-in">
          {crumbs('{r}', [('Blog', '{r}blog/')])}
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

# ---------- volunteer ----------

vol_hero = phero('{r}', 'Get involved', [], 'Get involved', 'Lend your <em>light</em>',
    lede='Join our mission as a volunteer. Tell us a little about yourself and how you’d like to help, and we’ll be in touch.')

vol_body = f'''<section class="pbody">
      <div class="wrap split">
        <div class="split-head">
          <p class="kicker reveal">Where help goes furthest</p>
          <h2 class="big reveal">Every act of compassion travels <em>further</em> than we can see.</h2>
          <p class="reveal">Whether you have an hour a month or a skill to share, there’s a place for you in this community.</p>
          <div class="helps">
            <div class="help reveal"><span class="mv-ico" aria-hidden="true">{ICON['translate']}</span><h3>Translate</h3><p>The course is shared in 20 languages, and the archive aims for 249. Help carry the work into yours.</p></div>
            <div class="help reveal"><span class="mv-ico" aria-hidden="true">{ICON['archive']}</span><h3>Preserve</h3><p>Help the <a href="{{r}}programs/archive/">Archive Program</a> protect and organize almost 25 years of recordings.</p></div>
            <div class="help reveal"><span class="mv-ico" aria-hidden="true">{ICON['connect']}</span><h3>Connect</h3><p>Bring peace education to your school, workplace or neighbourhood.</p></div>
            <div class="help reveal"><span class="mv-ico" aria-hidden="true">{ICON['heart']}</span><h3>Give</h3><p>Fund scholarships through <a href="{{r}}programs/course-fund/">the Compassion Course Fund</a>.</p></div>
          </div>
        </div>
        <div class="form-card reveal">
          <h2>Volunteer with us</h2>
          <p>We read every note and will reply as soon as we can.</p>
          <form class="form" data-form="volunteer">
            <div class="form-row">
              <div class="field"><label for="v-name">Full name</label><input id="v-name" name="name" required maxlength="120" autocomplete="name"></div>
              <div class="field"><label for="v-email">Email</label><input id="v-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
            </div>
            <div class="field"><label for="v-phone">Phone <small>(optional)</small></label><input id="v-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"></div>
            <fieldset class="field">
              <legend>I’d like to help with <small>(choose any)</small></legend>
              <div class="chips">
                <label><input type="checkbox" name="interest" value="translation"><span>Translation</span></label>
                <label><input type="checkbox" name="interest" value="archive"><span>Archive &amp; media</span></label>
                <label><input type="checkbox" name="interest" value="community"><span>Community outreach</span></label>
                <label><input type="checkbox" name="interest" value="events"><span>Events</span></label>
                <label><input type="checkbox" name="interest" value="other"><span>Something else</span></label>
              </div>
            </fieldset>
            <div class="field"><label for="v-msg">Message</label><textarea id="v-msg" name="message" maxlength="4000" placeholder="A little about you, and how you’d like to help"></textarea></div>
            <button class="btn btn-sun" type="submit">Send</button>
            <p class="form-msg" data-form-msg role="status"></p>
          </form>
        </div>
      </div>
    </section>'''

# ---------- contact ----------

contact_hero = phero('{r}', 'Contact', [], 'Contact', 'We’d love to <em>hear</em> from you',
    lede='Send us a message and we’ll respond as soon as possible.')

contact_body = f'''<section class="pbody">
      <div class="wrap split">
        <div class="contact-aside">
          <div class="give-card reveal">
            <span class="way-n">Support the work</span>
            <h3>Help peace education reach everyone</h3>
            <p>Your gift funds scholarships and community programs around the world.</p>
            <a class="btn btn-sun" href="{{r}}donate/" data-donate>Donate</a>
          </div>
          <div class="side-list reveal">
            <h4>Other ways to connect</h4>
            <a href="{{r}}volunteer/"><b>Volunteer</b><small>Lend your time and talents</small></a>
            <a href="#newsletter"><b>Newsletter</b><small>Occasional, hopeful news</small></a>
            <a href="{{r}}events/"><b>Events</b><small>Gatherings and online sessions</small></a>
          </div>
          <div class="side-list reveal">
            {social('{s}', 'social light')}
          </div>
        </div>
        <div class="form-card reveal">
          <h2>Send a message</h2>
          <p>Questions about the course, the Foundation, partnerships or anything else.</p>
          <form class="form" data-form="contact">
            <div class="form-row">
              <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" required maxlength="120" autocomplete="name"></div>
              <div class="field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
            </div>
            <div class="field"><label for="c-subject">Subject</label><input id="c-subject" name="subject" required maxlength="200"></div>
            <div class="field"><label for="c-msg">Message</label><textarea id="c-msg" name="message" required maxlength="5000"></textarea></div>
            <button class="btn btn-sun" type="submit">Send message</button>
            <p class="form-msg" data-form-msg role="status"></p>
          </form>
        </div>
      </div>
    </section>'''


# ---------- donate (also where Stripe returns donors: /donate?success=true or ?canceled=true) ----------

donate_hero = phero('{r}', 'Donate', [], 'Donate', 'Give to the <em>work</em>',
    lede='Your gift funds scholarships and community programs, so more people can learn compassion.')

donate_body = f"""<section class="pbody">
      <div class="wrap split">
        <div class="split-head">
          <p class="kicker reveal">What giving supports</p>
          <h2 class="big reveal">Peace education for everyone, <em>everywhere</em>.</h2>
          <p class="reveal">To ensure that peace education is available to all, the Compassion Course Fund provides scholarships and logistical support to individuals and groups who would otherwise face financial or geographic barriers.</p>
          <div class="side-list reveal">
            <h4>Our programs</h4>
            <a href="{{r}}programs/course-fund/"><b>Removing Barriers</b><small>The Compassion Course Fund</small></a>
            <a href="{{r}}programs/compassion-course/"><b>The Compassion Course</b><small>A Global Pathway to Peace</small></a>
            <a href="{{r}}programs/archive/"><b>The Archive Program</b><small>A library for the world</small></a>
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

      var path = '/' + location.pathname.slice(root.length).replace(/\/+$/, ''), m, to;
      // Program pages on the previous compassioncf.com were named by database id.
      var programs = { ZyIg3cMJCw15DfgstFoW: 'compassion-course', bDzzWW2ECxSOVlSHFSa7: 'course-fund', skFlbSRJEvjbV0rnLPDF: 'archive' };
      if ((m = path.match(/^\/programs\/([^\/]+)$/))) to = 'programs/' + (programs[m[1]] ? programs[m[1]] + '/' : '');
      else if ((m = path.match(/^\/blog\/([A-Za-z0-9_-]+)$/))) to = 'blog/post.html?id=' + encodeURIComponent(m[1]);
      else if ((m = path.match(/^\/v1(\/.*)?$/))) to = (m[1] || '/').slice(1);   // this site, while it was one of five designs under review
      else if (/^\/(home|v[2-5](\/.*)?)$/.test(path)) to = '';
      if (to != null) {
        document.documentElement.style.visibility = 'hidden';
        location.replace(root + to + (to.indexOf('?') < 0 ? location.search : '') + location.hash);
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
            <a class="btn btn-line" href="{{r}}blog/">Blog</a>
            <a class="btn btn-line" href="{{r}}contact/">Contact us</a>
          </div>
        </div>
      </div>
    </section>"""

CMS_JS = '\n  <script type="module" src="{s}cms.js"></script>'

PAGES = [
    ('about/index.html', 'About us', 'Why peace education matters, and who we are: the Compassion Course Foundation, a 501(c)(3) nonprofit.', 'about', about_hero, about_body, ''),
    ('programs/index.html', 'Programs', 'The Compassion Course, the Compassion Course Fund and the Archive Program.', 'programs', programs_hero, programs_body, ''),
    ('programs/compassion-course/index.html', 'The Compassion Course', 'The Compassion Course: a global pathway to peace, changing lives for 15 years in over 120 countries and 20 languages.', 'programs', course_hero, course_body, course_js),
    ('programs/course-fund/index.html', 'Removing Barriers: The Compassion Course Fund', 'Scholarships and logistical support so peace education is available to all.', 'programs', fund_hero, fund_body, ''),
    ('programs/archive/index.html', 'The Archive Program', 'Preserving almost 25 years of Compassion Course teaching as an online library of audio courses in 249 languages.', 'programs', archive_hero, archive_body, ''),
    ('events/index.html', 'Events', 'Workshops, gatherings and online sessions from the Compassion Course community.', 'events', events_hero, events_body, CMS_JS),
    ('board/index.html', 'Board members', 'Meet the board guiding the Compassion Course Foundation.', 'about', board_hero, board_body, ''),
    ('blog/index.html', 'Blog', 'Essays and reflections from Thom Bond and the Compassion Course community.', 'blog', blog_hero, blog_body, CMS_JS),
    ('blog/post.html', 'Essay', 'An essay from the Compassion Course Foundation blog.', 'blog', post_hero, post_body, CMS_JS),
    ('volunteer/index.html', 'Volunteer', 'Join the Compassion Course Foundation’s mission as a volunteer.', 'volunteer', vol_hero, vol_body, ''),
    ('contact/index.html', 'Contact us', 'Get in touch with the Compassion Course Foundation.', 'contact', contact_hero, contact_body, ''),
    ('donate/index.html', 'Donate', 'Give to the Compassion Course Foundation: secure online donations through Stripe.', None, donate_hero, donate_body, ''),
]

for i, (path, title, desc, active, hero, body, js) in enumerate(PAGES, start=2):
    page(path, title, desc, active, hero, body, i, js)

page('404.html', 'Page not found', 'This page could not be found.', None, notfound_hero, notfound_body, 0, SKIP_404, head=HEAD_404, news=False)

# ---------- home page: written by hand, only its header and footer come from here ----------
home = os.path.join(SITE, 'index.html')
with open(home, encoding='utf-8') as f:
    h = f.read()
h = re.sub(r'<header class="hdr".*?</header>', lambda m: header('', None, home=True), h, count=1, flags=re.S)
h = re.sub(r'<footer class="ftr">.*?</footer>', lambda m: footer('', home=True), h, count=1, flags=re.S)
with open(home, 'w', encoding='utf-8', newline='\n') as f:
    f.write(h)
print('synced', home)
