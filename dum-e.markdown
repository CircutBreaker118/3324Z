---
layout: default
title: DUM-E
permalink: /dum-e/
body_class: page-dum-e
---

<div class="dum-e-decor" aria-hidden="true">
  <div class="pushback-grid pushback-grid--cups">
    {%- for i in (1..12) -%}
      <span class="pushback-grid__item pushback-grid__item--cup pushback-grid__item--{{ i }}"></span>
    {%- endfor -%}
  </div>
  <div class="pushback-grid pushback-grid--pins">
    {%- for i in (1..12) -%}
      <span class="pushback-grid__item pushback-grid__item--pin pushback-grid__item--{{ i }}"></span>
    {%- endfor -%}
  </div>
</div>

<section class="page-section page-section--foreground">
  <h1>DUM-E</h1>
  <p>
    Our team robot shares a name with DUM-E, Tony Stark’s workshop helper from <em>Iron Man</em>—the earnest robotic arm
    that sweeps, hands over tools, and keeps the lab moving. Like our namesake, our bot is built to show up, work hard,
    and support the team on the field.
  </p>
</section>

{% include cad-showcase.html %}

<section class="page-section page-section--media page-section--foreground">
  <figure class="robot-figure">
    <img src="/Drivetrain.png" alt="3324Z robot drivetrain" width="1200" height="800" loading="lazy" decoding="async" />
    <figcaption>Team 3324Z drivetrain</figcaption>
  </figure>
</section>
