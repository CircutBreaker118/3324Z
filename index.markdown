---
layout: default
title: Home
---

<section class="hero hero--immersive" aria-labelledby="hero-heading">
  <canvas class="hero-canvas" id="hero-canvas" aria-hidden="true"></canvas>
  <div class="hero__content">
    <img class="hero__logo" src="/3324Z.png" alt="Circuit BreakerZ team logo" width="200" height="200" decoding="async" />
    <p class="hero__team-id">3324Z</p>
    <h1 id="hero-heading" class="hero__title">Circuit BreakerZ</h1>
    <p class="hero__tagline">VRC Middle School · Science Academy STEM Magnet · North Hollywood</p>
  </div>
</section>

<section class="page-section" data-reveal>
  <p class="lead">
    Welcome to the official home of Team 3324Z. We design, build, and compete with VEX robots as a middle school
    team—learning engineering, coding, and teamwork at every tournament. Explore who we are, what we are working toward,
    and how our season is going.
  </p>
  <div class="hero__actions" data-reveal data-reveal-delay="120">
    <a class="btn btn--primary" href="{{ '/about/' | relative_url }}">About us</a>
    <a class="btn btn--secondary" href="{{ '/statistics/' | relative_url }}">Statistics</a>
  </div>
</section>

<script src="{{ '/assets/js/hero-canvas.js' | relative_url }}" defer></script>
