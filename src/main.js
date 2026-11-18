import { renderOverviewPage } from "./pages/overview.js";
import { renderSimulatorPage } from "./pages/simulator.js";
import { renderProcessQueuePage } from "./pages/process-queue.js";
import { renderComparisonPage } from "./pages/comparison.js";
import { renderActivityLogPage } from "./pages/activity-log.js";
import { ProcessManager } from "./process-manager.js";
import { initializeNavigation } from "./navigation.js";
import { initializeOverview } from "./overview.js";
import { initializeSimulator } from "./simulator.js";
import { initializeProcessQueue } from "./process-queue.js";
import { initializeComparison } from "./comparison.js";
import { initializeActivityLog } from "./activity-log.js";
import { initializeTheme } from "./theme.js";

const pageTemplates = {
  overview: renderOverviewPage,
  simulator: renderSimulatorPage,
  queue: renderProcessQueuePage,
  comparison: renderComparisonPage,
  activity: renderActivityLogPage
};

const pageContainer = document.querySelector("#page-container");

for (const [name, renderPage] of Object.entries(pageTemplates)) {
  const page = document.createElement("div");
  page.className = "page-view";
  page.dataset.page = name;
  page.innerHTML = renderPage();
  pageContainer.append(page);
}

const processManager = new ProcessManager();
initializeNavigation(processManager);
initializeOverview(processManager);
initializeSimulator(processManager);
initializeProcessQueue(processManager);
initializeComparison(processManager);
initializeActivityLog(processManager);
initializeTheme();
