const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const navigation = document.querySelector("[data-nav]");
const navigationLinks = [...document.querySelectorAll("[data-nav] a")];

const setMenuState = (isOpen) => {
  if (!menuToggle || !navigation) return;

  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  navigation.classList.toggle("is-open", isOpen);
};

menuToggle?.addEventListener("click", () => {
  setMenuState(menuToggle.getAttribute("aria-expanded") !== "true");
});

navigationLinks.forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuState(false);
});

document.addEventListener("click", (event) => {
  if (!navigation?.classList.contains("is-open")) return;
  if (navigation.contains(event.target) || menuToggle?.contains(event.target)) return;
  setMenuState(false);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 860) setMenuState(false);
});

const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const observedSections = [...document.querySelectorAll("main section[id]")];

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visibleEntry) return;

      navigationLinks.forEach((link) => {
        const isCurrent = link.getAttribute("href") === `#${visibleEntry.target.id}`;
        if (isCurrent) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "-28% 0px -62%", threshold: [0, 0.2, 0.5] },
  );

  observedSections.forEach((section) => sectionObserver.observe(section));
}

const workFilterButtons = [...document.querySelectorAll("[data-work-filter]")];
const workCards = [...document.querySelectorAll("[data-work-card]")];
const workGroups = [...document.querySelectorAll("[data-work-group]")];
const workFilterStatus = document.querySelector("[data-work-filter-status]");

const applyWorkFilter = (filter) => {
  workCards.forEach((card) => {
    card.hidden = filter === "selected" && card.dataset.selected !== "true";
  });

  workGroups.forEach((group) => {
    const visibleCount = [...group.querySelectorAll("[data-work-card]")].filter((card) => !card.hidden).length;
    group.dataset.visibleCount = String(visibleCount);
    group.hidden = visibleCount === 0;
  });

  workFilterButtons.forEach((button) => {
    const isActive = button.dataset.workFilter === filter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (workFilterStatus) {
    const visibleCount = workCards.filter((card) => !card.hidden).length;
    workFilterStatus.textContent =
      filter === "selected" ? `Showing ${visibleCount} selected works` : `Showing all ${visibleCount} works`;
  }
};

workFilterButtons.forEach((button) => {
  button.addEventListener("click", () => applyWorkFilter(button.dataset.workFilter));
});

if (workFilterButtons.length && workCards.length) applyWorkFilter("selected");

const year = document.querySelector("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());
