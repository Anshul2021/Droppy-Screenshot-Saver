// Droppy - Screenshot Inbox (Figma Plugin Main Thread)

figma.showUI(__html__, {
  width: 380,
  height: 600,
  title: 'Droppy — Screenshot Inbox'
});

// Helper: Format current time as HH:MM:SS
function getFormattedTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// Helper: Send existing sections list on current page to UI
function sendExistingSectionsToUI() {
  try {
    const sections = figma.currentPage
      .findAll((n) => n.type === 'SECTION')
      .map((s) => ({ id: s.id, name: s.name }));
    figma.ui.postMessage({ type: 'sections-list', sections });
  } catch (err) {
    console.error('[Droppy Plugin] Failed to list sections:', err);
  }
}

// Helper: Create an image rectangle node
function createImageRectangle(item) {
  const bytes = new Uint8Array(item.bytes);
  const image = figma.createImage(bytes);

  const rect = figma.createRectangle();
  const width = Math.max(1, Math.round(item.width || 800));
  const height = Math.max(1, Math.round(item.height || 600));

  rect.resize(width, height);
  rect.fills = [
    {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: 'FILL'
    }
  ];

  rect.name = `Screenshot — ${getFormattedTime()}`;
  return rect;
}

// Send sections on open
sendExistingSectionsToUI();

// Handle messages from UI Iframe
figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  try {
    // Request Sections List
    if (msg.type === 'get-sections') {
      sendExistingSectionsToUI();
      return;
    }

    // Action 1: Single Insert
    if (msg.type === 'insert') {
      if (!msg.bytes || msg.bytes.length === 0) {
        figma.notify('Failed to insert: No image data received', { error: true });
        return;
      }

      const rect = createImageRectangle(msg);

      // Check if Section organization requested
      if (msg.sectionOption === 'new' || (msg.sectionName && !msg.targetSectionId)) {
        const section = figma.createSection();
        section.name = msg.sectionName || `Screenshots — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

        // Center section in viewport
        const pad = 40;
        const totalW = rect.width + pad * 2;
        const totalH = rect.height + pad * 2 + 30;

        section.x = Math.round(figma.viewport.center.x - totalW / 2);
        section.y = Math.round(figma.viewport.center.y - totalH / 2);
        section.resizeWithoutConstraints(totalW, totalH);

        rect.x = pad;
        rect.y = pad + 30;
        section.appendChild(rect);

        figma.currentPage.appendChild(section);
        figma.currentPage.selection = [section];
        figma.viewport.scrollAndZoomIntoView([section]);
      } else if (msg.sectionOption === 'existing' && msg.targetSectionId) {
        const section = figma.getNodeById(msg.targetSectionId);
        if (section && section.type === 'SECTION') {
          rect.x = 40;
          rect.y = section.height + 40;
          section.appendChild(rect);
          section.resizeWithoutConstraints(
            Math.max(section.width, rect.x + rect.width + 40),
            section.y + rect.y + rect.height + 40
          );
          figma.currentPage.selection = [rect];
          figma.viewport.scrollAndZoomIntoView([rect]);
        } else {
          figma.currentPage.appendChild(rect);
          figma.currentPage.selection = [rect];
          figma.viewport.scrollAndZoomIntoView([rect]);
        }
      } else {
        // Normal Canvas Placement
        const selection = figma.currentPage.selection;
        if (selection.length > 0) {
          let maxX = -Infinity;
          let minY = Infinity;
          for (const item of selection) {
            maxX = Math.max(maxX, item.x + item.width);
            minY = Math.min(minY, item.y);
          }
          rect.x = Math.round(maxX + 60);
          rect.y = Math.round(minY);
        } else {
          rect.x = Math.round(figma.viewport.center.x - rect.width / 2);
          rect.y = Math.round(figma.viewport.center.y - rect.height / 2);
        }

        figma.currentPage.appendChild(rect);
        figma.currentPage.selection = [rect];
        figma.viewport.scrollAndZoomIntoView([rect]);
      }

      figma.notify(`Screenshot inserted (${rect.width}×${rect.height})`);
      figma.ui.postMessage({ type: 'insert-complete', filename: msg.filename, success: true });
      sendExistingSectionsToUI();
      return;
    }

    // Action 2: Insert All (Grid Layout inside Section or Canvas)
    if (msg.type === 'insert-all') {
      const items = msg.items || [];
      if (items.length === 0) {
        figma.notify('No screenshots to insert', { error: true });
        return;
      }

      const count = items.length;
      const cols = Math.ceil(Math.sqrt(count));
      const gapX = 60;
      const gapY = 60;
      const pad = 40;

      // Create nodes
      const createdNodes = [];
      for (const item of items) {
        try {
          const rect = createImageRectangle(item);
          createdNodes.push(rect);
        } catch (err) {
          console.error('[Droppy Plugin] Error creating node for item:', item.filename, err);
        }
      }

      if (createdNodes.length === 0) {
        figma.notify('Failed to create screenshot nodes', { error: true });
        return;
      }

      // Group into rows
      const rows = [];
      for (let i = 0; i < createdNodes.length; i += cols) {
        rows.push(createdNodes.slice(i, i + cols));
      }

      // Calculate column widths and row heights
      const colWidths = new Array(cols).fill(0);
      const rowHeights = new Array(rows.length).fill(0);

      rows.forEach((row, rIdx) => {
        row.forEach((rect, cIdx) => {
          colWidths[cIdx] = Math.max(colWidths[cIdx], rect.width);
          rowHeights[rIdx] = Math.max(rowHeights[rIdx], rect.height);
        });
      });

      const totalGridW = colWidths.reduce((a, b) => a + b, 0) + (cols - 1) * gapX;
      const totalGridH = rowHeights.reduce((a, b) => a + b, 0) + (rows.length - 1) * gapY;

      // Handle Section Placement
      const useSection = msg.sectionOption !== 'none';

      if (useSection) {
        let section = null;
        if (msg.sectionOption === 'existing' && msg.targetSectionId) {
          const found = figma.getNodeById(msg.targetSectionId);
          if (found && found.type === 'SECTION') section = found;
        }

        if (!section) {
          section = figma.createSection();
          section.name = msg.sectionName || `Screenshots — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          section.x = Math.round(figma.viewport.center.x - (totalGridW + pad * 2) / 2);
          section.y = Math.round(figma.viewport.center.y - (totalGridH + pad * 2 + 30) / 2);
          figma.currentPage.appendChild(section);
        }

        const sectionW = totalGridW + pad * 2;
        const sectionH = totalGridH + pad * 2 + 40;
        section.resizeWithoutConstraints(sectionW, sectionH);

        // Position items inside Section
        let curY = pad + 30;
        rows.forEach((row, rIdx) => {
          let curX = pad;
          row.forEach((rect, cIdx) => {
            rect.x = curX;
            rect.y = curY;
            section.appendChild(rect);
            curX += colWidths[cIdx] + gapX;
          });
          curY += rowHeights[rIdx] + gapY;
        });

        figma.currentPage.selection = [section];
        figma.viewport.scrollAndZoomIntoView([section]);
        figma.notify(`Organized ${createdNodes.length} screenshots into Section "${section.name}"`);
      } else {
        // Free Canvas Placement
        let startX = Math.round(figma.viewport.center.x - totalGridW / 2);
        let startY = Math.round(figma.viewport.center.y - totalGridH / 2);

        let curY = startY;
        rows.forEach((row, rIdx) => {
          let curX = startX;
          row.forEach((rect, cIdx) => {
            rect.x = curX;
            rect.y = curY;
            figma.currentPage.appendChild(rect);
            curX += colWidths[cIdx] + gapX;
          });
          curY += rowHeights[rIdx] + gapY;
        });

        figma.currentPage.selection = createdNodes;
        figma.viewport.scrollAndZoomIntoView(createdNodes);
        figma.notify(`Inserted ${createdNodes.length} screenshots in grid`);
      }

      figma.ui.postMessage({ type: 'insert-all-complete', success: true, count: createdNodes.length });
      sendExistingSectionsToUI();
      return;
    }

    // Action 3: Notify
    if (msg.type === 'notify') {
      figma.notify(msg.message, { error: !!msg.isError });
      return;
    }
  } catch (err) {
    console.error('[Droppy Plugin] Main thread error:', err);
    figma.notify('An error occurred in Droppy plugin', { error: true });
  }
};
