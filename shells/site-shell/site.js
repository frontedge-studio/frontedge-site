(function () {
  const navLinks = Array.from(document.querySelectorAll('.nav-links a[data-link]'));
  const header = document.querySelector('header');

  // Keep year current (safe everywhere)
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Helpers ----------
  function setActive(id) {
    navLinks.forEach(a => {
      a.dataset.active = (a.dataset.link === id) ? "true" : "false";
    });
  }

  function normalizePath(pathname) {
    // "/play" -> "play", "/play/" -> "play", "/" -> "home"
    const p = (pathname || "/").toLowerCase();
    if (p === "/" || p === "") return "home";
    const trimmed = p.replace(/^\/+|\/+$/g, ""); // remove leading/trailing slashes
    const first = trimmed.split("/")[0] || "home";
    return first;
  }

  // ---------- Scroll-spy (ONLY for anchor links) ----------
  const sections = navLinks.length
    ? navLinks
        .map(a => {
          const href = a.getAttribute('href') || '';
          if (!href.startsWith('#')) return null;
          return document.getElementById(href.slice(1));
        })
        .filter(Boolean)
    : [];

  let sectionTops = [];

  function getNavHeight() {
    return header ? header.getBoundingClientRect().height : 0;
  }

  function computeSectionTops() {
    sectionTops = sections.map(sec => ({
      id: sec.id,
      top: sec.getBoundingClientRect().top + window.scrollY
    }));
    sectionTops.sort((a, b) => a.top - b.top);
  }

  function isAtBottom() {
    const scrollPos = window.scrollY + window.innerHeight;
    return scrollPos >= (document.documentElement.scrollHeight - 2);
  }

  function updateActiveFromScroll() {
    if (!sections.length) return;

    if (!sectionTops.length) computeSectionTops();

    if (isAtBottom()) {
      const last = sectionTops[sectionTops.length - 1];
      if (last) setActive(last.id);
      return;
    }

    const line = getNavHeight() + 18;
    const y = window.scrollY + line;

    let current = sectionTops[0]?.id || "home";
    for (let i = 0; i < sectionTops.length; i++) {
      if (sectionTops[i].top <= y) current = sectionTops[i].id;
      else break;
    }

    setActive(current);
  }

  // Root page anchor behavior (only if we actually have sections)
  if (sections.length) {
    navLinks.forEach(a => {
      a.addEventListener('click', () => {
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('#')) return;
        setActive(href.slice(1));
      });
    });

    window.addEventListener('load', () => {
      computeSectionTops();
      updateActiveFromScroll();
      setTimeout(() => { computeSectionTops(); updateActiveFromScroll(); }, 250);
    });

    window.addEventListener('resize', () => {
      computeSectionTops();
      updateActiveFromScroll();
    });

    window.addEventListener('scroll', updateActiveFromScroll, { passive: true });

    // Initial
    computeSectionTops();
    updateActiveFromScroll();
    } else {
    // Hub pages: no anchor sections, so highlight based on URL path.
    const path = (window.location.pathname || "/").toLowerCase();

    // Normalize "/play" and "/play/" to "play"
    const trimmed = path.replace(/^\/+|\/+$/g, "");
    const first = trimmed.split("/")[0]; // "", "play", "tools", "labs", etc.

    let id = "home";
    if (first === "play") id = "play";
    else if (first === "tools") id = "tools";
    else if (first === "labs") id = "labs";
    else if (first === "") id = "home";

    setActive(id);
  }

  // ---------- Mobile menu (guarded) ----------
  const menuBtn = document.querySelector('.menu-btn');
  const menuOverlay = document.getElementById('mobileMenu');
  const menuClose = document.querySelector('.menu-close');

  function openMenu() {
    if (!menuOverlay) return;
    menuOverlay.dataset.open = "true";
    menuOverlay.setAttribute('aria-hidden', 'false');
    menuBtn?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    if (!menuOverlay) return;
    delete menuOverlay.dataset.open;
    menuOverlay.setAttribute('aria-hidden', 'true');
    menuBtn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  menuBtn?.addEventListener('click', openMenu);
  menuClose?.addEventListener('click', closeMenu);

  menuOverlay?.addEventListener('click', (e) => {
    if (e.target === menuOverlay) closeMenu();
  });

  // Close when selecting ANY link; only setActive for anchor links
  menuOverlay?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#') && a.dataset.link && navLinks.length) {
        setActive(a.dataset.link);
      }
      closeMenu();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
})();
