const routes = new Map([
  ["#overview", "overview"],
  ["#simulator", "simulator"],
  ["#queue", "queue"],
  ["#requests", "queue"],
  ["#comparison", "comparison"],
  ["#activity", "activity"]
]);

const pageLabels = new Map([
  ["overview", "OVERVIEW"],
  ["simulator", "MEMORY SIMULATOR"],
  ["queue", "PROCESS QUEUE"],
  ["comparison", "ALGORITHM COMPARISON"],
  ["activity", "ACTIVITY LOG"]
]);

export function initializeNavigation(manager) {
  const links = [...document.querySelectorAll(".side-nav .nav-link")];
  const views = [...document.querySelectorAll(".page-view")];
  const breadcrumb = document.querySelector(".breadcrumb strong");

  function renderRoute() {
    const rawHash = window.location.hash;
    const hash = routes.has(rawHash) ? rawHash : "#overview";
    const page = routes.get(hash);

    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash);
    }

    for (const view of views) {
      view.hidden = view.dataset.page !== page;
    }

    for (const link of links) {
      const linkHref = link.getAttribute("href");
      const active = (linkHref === hash) || (page === "queue" && (linkHref === "#queue" || linkHref === "#requests"));
      link.classList.toggle("selected", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }

    if (breadcrumb && pageLabels.has(page)) {
      breadcrumb.textContent = pageLabels.get(page);
    }

    if (manager && typeof manager.notify === "function") {
      manager.notify();
    }
  }

  const selector = 'a[href="#overview"], a[href="#simulator"], a[href="#queue"], a[href="#requests"], a[href="#comparison"], a[href="#activity"]';
  for (const link of document.querySelectorAll(selector)) {
    link.addEventListener("click", event => {
      const targetHash = link.getAttribute("href");
      if (window.location.hash === targetHash) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  window.addEventListener("hashchange", () => {
    renderRoute();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  renderRoute();
}
