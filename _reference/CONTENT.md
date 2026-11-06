# compassioncf.com — content reference

Source: `site/` is the saveweb2zip export of https://compassioncf.com/ (a Vite/React SPA;
most content — programs, events, board, blog — is loaded from Firestore at runtime and is
NOT in the export). `logo-tm.png` is the live `/Logo_TM.png`.

## Static copy found in the bundle
- Org: Compassion Course Foundation, Inc.
- Tagline: "Peace Education for Everyone, Everywhere, All at Once."
- Mission: "To foster compassion and understanding through educational programs and community initiatives that bring people together."
- Vision: "A world where compassion guides our interactions and creates positive change in communities everywhere."
- Get Involved: "Join us in making a difference. Whether through volunteering, donating, or participating in our programs."
- Nav: Home, About, Programs, Events, Board, Blog, Contact Us, Donate
- Footer: Quick Links (About Us, Programs, Events, Board Members), Get Involved (Donate, Newsletter), Connect (Facebook, Twitter, Instagram, LinkedIn — all `href="#"`)
- Contact intro: "We'd love to hear from you. Send us a message and we'll respond as soon as possible."
- Volunteer: "Join our mission as a volunteer..."

## About page
- aroundTheWorld: "Communities are facing rising levels of polarization, stress, and conflict. While many efforts focus on resolving conflict after it has escalated, research across psychology, education, and peace studies consistently shows that peace is most effectively built by cultivating the skills, mindsets, and relationships that prevent conflict in the first place. This is the heart of peace education."
- peaceEducationIntro: "Peace education equips people with the ability to understand their own needs, communicate effectively, regulate emotions, and empathize across differences. Studies from UNESCO, the Global Partnership for the Prevention of Armed Conflict, and numerous academic programs have affirmed that peace education contributes to:"
- benefits: Reduced interpersonal and community violence; Improved emotional resilience and self-regulation; Greater social cohesion and empathy across cultures; Increased capacity for collaboration and conflict transformation
- conclusion: "When people learn concrete tools for connection and compassion, they are better able to navigate differences, de-escalate tensions, and create environments where everyone's needs matter. In this way, peace education is not simply a curriculum — it is a strategy for transforming the cultural roots of our collective challenges."

## Globe data
From compassion-course-website `src/data/markerPoints.ts`: 3,898 participant locations, clustered into 487 regions (3° grid) → `shared/clusters.js`.
