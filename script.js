/**
 * JSON Re-Formatter Logic
 * Core functionality: JSON parsing, field management, formatting, and formatting.
 */

// State
let appState = {
    originalData: [], // Array of objects elements
    fields: [],       // List of all available keys
    selectedFields: [], // Keys selected by user (ordered)
    mappings: [],       // Value mapping rules
    options: {
        useTab: true,
        singleLine: false,
        startIndent: 0
    },
    fontSize: 14,  // Default font size in pixels (output)
    inputFontSize: 14,  // Default font size for input
    tableViewVisible: false,  // Table view toggle state
    fieldColors: {},  // Map of field names to rainbow color indices
    colorCodingEnabled: false  // Color coding toggle state
};

// DOM Elements
const els = {
    dropZone: document.getElementById('dropZone'),
    jsonInput: document.getElementById('jsonInput'),
    inputStatus: document.getElementById('inputStatus'),
    fieldList: document.getElementById('fieldList'),
    outputPreview: document.getElementById('outputPreview'),
    btnCopy: document.getElementById('copyBtn'),
    btnZoomIn: document.getElementById('zoomInBtn'),
    btnZoomOut: document.getElementById('zoomOutBtn'),
    btnInputZoomIn: document.getElementById('inputZoomInBtn'),
    btnInputZoomOut: document.getElementById('inputZoomOutBtn'),
    btnClearInput: document.getElementById('clearInputBtn'),
    filenameInput: document.getElementById('filenameInput'),
    exportBtns: document.querySelectorAll('.export-controls button[data-type]'),
    toast: document.getElementById('toast'),
    toast: document.getElementById('toast'),
    optUseTab: document.getElementById('useTab'),
    optSingleLine: document.getElementById('singleLine'),
    optStartIndent: document.getElementById('startIndent'),
    mappingRemove: null, // Will be init in setupMappingUI
    toggleTableViewBtn: document.getElementById('toggleTableViewBtn'),
    toggleColorCodingBtn: document.getElementById('toggleColorCodingBtn'),
    tableViewContainer: document.getElementById('tableViewContainer'),
    dataTable: document.getElementById('dataTable'),
    highlightOverlay: document.getElementById('highlightOverlay'),
    openFullEditorBtn: document.getElementById('openFullEditorBtn'),
    fullEditorModal: document.getElementById('fullEditorModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    modalDataTable: document.getElementById('modalDataTable'),
    addColumnBtn: document.getElementById('addColumnBtn'),
    addRowBtn: document.getElementById('addRowBtn')
};

// --- Initialization ---
function init() {
    setupEventListeners();
    setupMappingUI();
}

function setupEventListeners() {
    // 1. File Upload / Input
    els.jsonInput.addEventListener('input', debounce(handleInput, 300));

    // Drag & Drop
    els.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.dropZone.classList.add('dragover');
    });
    els.dropZone.addEventListener('dragleave', () => {
        els.dropZone.classList.remove('dragover');
    });
    els.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        els.dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/json' || file.name.endsWith('.json')) {
            readFile(file);
        } else {
            showToast('JSON 파일만 업로드 가능합니다.');
        }
    });

    // 2. Options
    els.optUseTab.addEventListener('change', (e) => {
        appState.options.useTab = e.target.checked;
        updatePreview();
    });
    els.optStartIndent.addEventListener('change', (e) => {
        appState.options.startIndent = parseInt(e.target.value, 10);
        updatePreview();
    });
    els.optSingleLine.addEventListener('change', (e) => {
        appState.options.singleLine = e.target.checked;
        updatePreview();
    });

    // 3. Actions
    els.btnCopy.addEventListener('click', copyToClipboard);
    els.btnZoomIn.addEventListener('click', zoomIn);
    els.btnZoomOut.addEventListener('click', zoomOut);

    // Input panel actions
    els.btnInputZoomIn.addEventListener('click', inputZoomIn);
    els.btnInputZoomOut.addEventListener('click', inputZoomOut);
    els.btnClearInput.addEventListener('click', clearInput);

    // Table view toggle
    els.toggleTableViewBtn.addEventListener('click', toggleTableView);
    els.toggleColorCodingBtn.addEventListener('click', toggleColorCoding);

    // Full editor modal
    els.openFullEditorBtn.addEventListener('click', openFullEditor);
    els.closeModalBtn.addEventListener('click', closeFullEditor);
    els.addColumnBtn.addEventListener('click', addColumn);
    els.addRowBtn.addEventListener('click', addRow);

    // Export Data Binding
    els.exportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type; // txt, json, csv
            downloadFile(type);
        });
    });
}

// --- Logic ---

function readFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        els.jsonInput.value = e.target.result;
        handleInput();
    };
    reader.readAsText(file);
}

function handleInput() {
    const rawText = els.jsonInput.value.trim();
    if (!rawText) {
        resetState();
        return;
    }
    parseJSON(rawText);
}

function parseJSON(jsonStr) {
    try {
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed) || parsed.length === 0) {
            showStatus('Array of objects required', false);
            return;
        }

        appState.originalData = parsed;

        // Extract fields
        const fieldSet = new Set();
        parsed.forEach(item => {
            Object.keys(item).forEach(key => fieldSet.add(key));
        });
        appState.fields = Array.from(fieldSet);

        // Assign rainbow colors to fields
        appState.fieldColors = {};
        appState.fields.forEach((field, index) => {
            appState.fieldColors[field] = index % 8; // 8 rainbow colors
        });

        // Default: select all
        appState.selectedFields = [...appState.fields];

        renderFieldList();
        updateMappingSelect();
        updatePreview();
        applyRainbowColorsToInput();
        showStatus(`Loaded ${parsed.length} items`, true);
    } catch (err) {
        showStatus('Invalid JSON: ' + err.message, false);
    }
}

function resetState() {
    appState.originalData = [];
    appState.fields = [];
    appState.selectedFields = [];
    els.fieldList.innerHTML = '<div class="empty-state">데이터를 입력하면 필드가 표시됩니다.</div>';
    els.outputPreview.textContent = '// 결과가 여기에 표시됩니다...';
    els.inputStatus.textContent = 'Waiting...';
}

function extractFields() {
    // Get all unique keys from all objects
    const keys = new Set();
    appState.originalData.forEach(item => {
        if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach(k => keys.add(k));
        }
    });
    appState.fields = Array.from(keys);

    // By default, select all fields in found order
    if (appState.selectedFields.length === 0) {
        appState.selectedFields = [...appState.fields];
    } else {
        // Keep existing selection if valid, add new ones if any
        // For simplicity in V1, let's just reset selection on new file load
        appState.selectedFields = [...appState.fields];
    }
}

function renderFieldList() {
    els.fieldList.innerHTML = '';

    // We render based on selectedFields order first, then unselected ones?
    // Requirements say "Change order". So we should allow reordering of ALL fields?
    // Or just selected ones? Usually re-ordering implies output order.
    // Let's render ALL fields, but order them such that selected ones are at top?
    // For V1, let's behave like this: 
    // The list shows ALL fields. Dragging changes the layout order.
    // The OUTPUT order is determined by the Order of items in 'selectedFields'.
    // BUT, if we just use checkboxes, the array order might not match visual order logic easily if we don't sync.
    // STRATEGY:
    // 1. We maintain `appState.fields` as the master list of keys (visual order).
    // 2. We render `appState.fields`.
    // 3. `appState.selectedFields` is just a subset. 
    // WAIT. If I change order in UI, I want the OUTPUT order to change.
    // So `appState.selectedFields` should be the source of truth for ORDER.

    // Updated Strategy:
    // 1. Use `appState.selectedFields` as the primary ordered list.
    // 2. Any fields NOT in `selectedFields` but in `appState.fields` go to the bottom?
    //    Or we just keep one master list `appState.fields` which serves as the ORDER,
    //    and checkbox just toggles visibility/inclusion.

    // Let's go with: `appState.fields` determines the UI list order.
    // `appState.selectedFields` will be re-generated based on the UI list order + checked status.

    appState.fields.forEach((field, index) => {
        const chip = document.createElement('div');
        chip.className = 'field-chip';
        chip.draggable = true;
        chip.dataset.index = index; // Store initial index or unique ID
        chip.dataset.field = field;

        const isSelected = appState.selectedFields.includes(field);

        chip.innerHTML = `
            <span class="drag-handle">☰</span>
            <input type="checkbox" value="${field}" ${isSelected ? 'checked' : ''}>
            <span>${field}</span>
        `;

        // 1. Checkbox Event
        const checkbox = chip.querySelector('input');
        checkbox.addEventListener('change', () => {
            updateSelectedFieldsState();
            updatePreview();
        });

        // 2. Drag Events
        chip.addEventListener('dragstart', handleDragStart);
        chip.addEventListener('dragenter', handleDragEnter);
        chip.addEventListener('dragover', handleDragOver);
        chip.addEventListener('dragleave', handleDragLeave);
        chip.addEventListener('drop', handleDrop);
        chip.addEventListener('dragend', handleDragEnd);

        els.fieldList.appendChild(chip);
    });
}

// --- DnD Handlers ---
let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation(); // stops the browser from redirecting.
    }

    if (dragSrcEl !== this) {
        // Swap DOM elements? Or Reorder Array?
        // Let's Swap DOM for visual feedback first
        // actually inserting before/after is better for lists.

        // Simple swap logic:
        // els.fieldList.insertBefore(dragSrcEl, this); // Moves src before target

        // Better: Check position
        const list = els.fieldList;
        const allChips = [...list.querySelectorAll('.field-chip')];
        const srcIndex = allChips.indexOf(dragSrcEl);
        const targetIndex = allChips.indexOf(this);

        if (srcIndex < targetIndex) {
            // Moving down: insert after target
            this.after(dragSrcEl);
        } else {
            // Moving up: insert before target
            this.before(dragSrcEl);
        }

        // Now Sync State
        updateFieldOrderFromDOM();
        updateSelectedFieldsState();
        updatePreview();
    }

    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    els.fieldList.querySelectorAll('.field-chip').forEach(chip => {
        chip.classList.remove('over');
    });
}

function updateFieldOrderFromDOM() {
    const newOrder = [];
    els.fieldList.querySelectorAll('.field-chip').forEach(chip => {
        newOrder.push(chip.dataset.field);
    });
    appState.fields = newOrder;
}

function updateSelectedFieldsState() {
    // Re-build selectedFields based on current DOM order + checked status
    const newSelected = [];
    els.fieldList.querySelectorAll('.field-chip').forEach(chip => {
        const checkbox = chip.querySelector('input');
        if (checkbox.checked) {
            newSelected.push(chip.dataset.field);
        }
    });
    appState.selectedFields = newSelected;
}

function updatePreview() {
    if (appState.originalData.length === 0) return;

    const formattedData = generateOutput();
    els.outputPreview.textContent = formattedData;
}

function generateOutput(format = 'txt') {
    // 1. Filter and Reorder Data
    const processed = appState.originalData.map(item => {
        const filteredItem = {};
        appState.selectedFields.forEach(key => {
            // Handle missing keys gracefully
            let val = item[key] !== undefined ? item[key] : '';

            // Apply Mappings
            if (appState.mappings && appState.mappings.length > 0) {
                // Find rule. Convert to string for safe comparison
                const rule = appState.mappings.find(r => r.field === key && String(r.from).trim() === String(val).trim());
                if (rule) {
                    if (rule.type === 'remove') {
                        val = null; // Mark for removal
                    } else {
                        val = rule.to;
                    }
                }
            }

            // Store (nulls will be filtered in generateOutput)
            filteredItem[key] = val;
        });
        return filteredItem;
    });

    // 2. Format
    if (format === 'json') {
        return JSON.stringify(processed, null, 2);
    }
    else if (format === 'csv') {
        // Header
        let csv = appState.selectedFields.join(',') + '\n';
        // Rows
        csv += processed.map(item => {
            return appState.selectedFields.map(key => {
                let val = String(item[key]);
                // Escape quotes
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',');
        }).join('\n');
        return csv;
    }
    else {
        // TXT (Custom)
        const separator = appState.options.useTab ? '\t' : ' ';

        if (appState.options.singleLine) {
            // All props in one line? No, requirement says:
            // "JSON results" -> "Value Value Value"
            return processed.map(item => {
                return Object.values(item).join(separator);
            }).join(' '); // Single line for WHOLE output? Or single line per item?
            // "Single Line" usually means one item per line vs pretty printed.
            // Let's assume standard is One Item Per Line.
            // If user checks "Single Line", maybe join everything?
            // Actually usually "Single Line" in JSON context means Minified.
            // But here for TXT, let's assume it means remove newlines between items.
            // Re-reading PRD: "띄어쓰기·엔터 규칙을 복수 조합"
            // Let's stick to "One line per item" as default.
        }

        const indent = ' '.repeat(appState.options.startIndent);
        return processed.map(item => {
            // Filter out nulls
            const values = Object.values(item).filter(v => v !== null && v !== "");
            return indent + values.join(separator);
        }).join('\n');
    }
}

// --- Utils ---

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function copyToClipboard() {
    const text = els.outputPreview.textContent;
    if (!text || text.startsWith('//')) return;

    navigator.clipboard.writeText(text).then(() => {
        showToast('클립보드에 복사되었습니다.');
    }).catch(err => {
        console.error('Copy failed', err);
        showToast('복사에 실패했습니다.');
    });
}

function zoomIn() {
    appState.fontSize = Math.min(appState.fontSize + 2, 32); // Max 32px
    updateFontSize();
}

function zoomOut() {
    appState.fontSize = Math.max(appState.fontSize - 2, 8); // Min 8px
    updateFontSize();
}

function updateFontSize() {
    els.outputPreview.style.fontSize = appState.fontSize + 'px';
}

function inputZoomIn() {
    appState.inputFontSize = Math.min(appState.inputFontSize + 2, 32); // Max 32px
    updateInputFontSize();
}

function inputZoomOut() {
    appState.inputFontSize = Math.max(appState.inputFontSize - 2, 8); // Min 8px
    updateInputFontSize();
}

function updateInputFontSize() {
    els.jsonInput.style.fontSize = appState.inputFontSize + 'px';
}

function clearInput() {
    els.jsonInput.value = '';
    resetState();
}

function applyRainbowColorsToInput() {
    // This is a simplified approach using CSS classes
    // For full syntax highlighting, we'd need a library or contenteditable div
    // For now, we'll add a data attribute to help with styling
    if (appState.fields.length > 0) {
        els.jsonInput.setAttribute('data-rainbow-enabled', 'true');
    }
}

function toggleTableView() {
    appState.tableViewVisible = !appState.tableViewVisible;

    if (appState.tableViewVisible) {
        renderTableView();
        els.tableViewContainer.classList.remove('hidden');
        els.toggleTableViewBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
            텍스트 보기
        `;
    } else {
        els.tableViewContainer.classList.add('hidden');
        els.toggleTableViewBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
            </svg>
            표 형식 보기
        `;
    }
}

function renderTableView() {
    if (!appState.originalData || appState.originalData.length === 0) {
        els.dataTable.innerHTML = '<tr><td>데이터가 없습니다</td></tr>';
        return;
    }

    // Build table header with editable field names
    let html = '<thead><tr>';
    appState.fields.forEach((field, index) => {
        const colorClass = `rainbow-${appState.fieldColors[field]}`;
        html += `<th class="${colorClass}" contenteditable="true" data-field-index="${index}">${field}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Build table rows with editable cells
    appState.originalData.forEach((item, rowIndex) => {
        html += '<tr>';
        appState.fields.forEach((field, colIndex) => {
            const value = item[field] !== undefined ? item[field] : '';
            const colorClass = `rainbow-${appState.fieldColors[field]}`;
            html += `<td class="${colorClass}" contenteditable="true" data-row="${rowIndex}" data-field="${field}">${value}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody>';
    els.dataTable.innerHTML = html;

    // Add event listeners for editing
    attachTableEditListeners();
}

function toggleColorCoding() {
    appState.colorCodingEnabled = !appState.colorCodingEnabled;

    if (appState.colorCodingEnabled) {
        applyColorCodingToInput();
        els.toggleColorCodingBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor"></path>
            </svg>
            색 구분 해제
        `;
    } else {
        removeColorCodingFromInput();
        els.toggleColorCodingBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 2a10 10 0 0 1 0 20"></path>
            </svg>
            색 구분
        `;
    }
}

function applyColorCodingToInput() {
    if (!appState.originalData || appState.originalData.length === 0) return;

    // Enable color coding mode
    els.jsonInput.classList.add('color-coded');
    els.highlightOverlay.classList.add('active');

    // Update overlay on input
    updateColorCodedOverlay();

    // Add input listener to keep overlay in sync
    els.jsonInput.addEventListener('input', updateColorCodedOverlay);
    els.jsonInput.addEventListener('scroll', syncOverlayScroll);
}

function removeColorCodingFromInput() {
    els.jsonInput.classList.remove('color-coded');
    els.highlightOverlay.classList.remove('active');
    els.highlightOverlay.innerHTML = '';

    // Remove listeners
    els.jsonInput.removeEventListener('input', updateColorCodedOverlay);
    els.jsonInput.removeEventListener('scroll', syncOverlayScroll);
}

function updateColorCodedOverlay() {
    const text = els.jsonInput.value;
    if (!text.trim()) {
        els.highlightOverlay.innerHTML = '';
        return;
    }

    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            els.highlightOverlay.textContent = text; // If not an array, just show plain text
            return;
        }

        // Apply rainbow colors to values based on field position
        let coloredHTML = text;

        // Simple approach: color each value based on its field
        appState.fields.forEach((field, index) => {
            const colorIndex = appState.fieldColors[field];
            const colorVar = `var(--rainbow-${colorIndex})`;

            // Match field: value pattern and wrap values in colored spans
            // This is a simplified regex approach
            // It tries to match a field name and then capture its value,
            // handling various JSON value types (strings, numbers, booleans, null, arrays, objects)
            const fieldPattern = new RegExp(`("${field}"\\s*:\\s*)((".*?(?<!\\\\)")|([\\d.-]+)|(true|false|null)|(\\[.*?\\])|(\\{.*?\\}))`, 'gs');

            coloredHTML = coloredHTML.replace(fieldPattern, (match, p1, p2) => {
                // p1 is the "field": part, p2 is the value part
                return `${p1}<span style="color: ${colorVar}">${p2}</span>`;
            });
        });

        els.highlightOverlay.innerHTML = coloredHTML;
    } catch (e) {
        // If JSON is invalid, just show plain text
        els.highlightOverlay.textContent = text;
    }
}

function syncOverlayScroll() {
    els.highlightOverlay.scrollTop = els.jsonInput.scrollTop;
    els.highlightOverlay.scrollLeft = els.jsonInput.scrollLeft;
}

function attachTableEditListeners() {
    // Listen for cell value changes
    const cells = els.dataTable.querySelectorAll('td[contenteditable]');
    cells.forEach(cell => {
        cell.addEventListener('blur', handleCellEdit);
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                cell.blur();
            }
        });
    });

    // Listen for header (field name) changes
    const headers = els.dataTable.querySelectorAll('th[contenteditable]');
    headers.forEach(header => {
        header.addEventListener('blur', handleHeaderEdit);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                header.blur();
            }
        });
    });
}

function handleCellEdit(e) {
    const cell = e.target;
    const rowIndex = parseInt(cell.dataset.row);
    const field = cell.dataset.field;
    const newValue = cell.textContent.trim();

    // Update original data
    if (appState.originalData[rowIndex]) {
        // Try to parse as number if it looks like one
        let parsedValue = newValue;
        if (!isNaN(newValue) && newValue !== '') {
            parsedValue = parseFloat(newValue);
        } else if (newValue === 'true') {
            parsedValue = true;
        } else if (newValue === 'false') {
            parsedValue = false;
        } else if (newValue === 'null') {
            parsedValue = null;
        }

        appState.originalData[rowIndex][field] = parsedValue;

        // Sync back to input textarea
        syncDataToInput();
        updatePreview();
        showToast('값이 업데이트되었습니다.');
    }
}

function handleHeaderEdit(e) {
    const header = e.target;
    const fieldIndex = parseInt(header.dataset.fieldIndex);
    const oldFieldName = appState.fields[fieldIndex];
    const newFieldName = header.textContent.trim();

    if (!newFieldName || newFieldName === oldFieldName) {
        header.textContent = oldFieldName; // Revert if empty or unchanged
        return;
    }

    // Check for duplicate field names
    if (appState.fields.includes(newFieldName) && newFieldName !== oldFieldName) {
        showToast('이미 존재하는 필드명입니다.');
        header.textContent = oldFieldName;
        return;
    }

    // Update field name in all data objects
    appState.originalData.forEach(item => {
        if (item.hasOwnProperty(oldFieldName)) {
            item[newFieldName] = item[oldFieldName];
            delete item[oldFieldName];
        }
    });

    // Update fields array
    appState.fields[fieldIndex] = newFieldName;

    // Update selectedFields if it contains the old field name
    const selectedIndex = appState.selectedFields.indexOf(oldFieldName);
    if (selectedIndex !== -1) {
        appState.selectedFields[selectedIndex] = newFieldName;
    }

    // Update field colors mapping
    if (appState.fieldColors[oldFieldName] !== undefined) {
        appState.fieldColors[newFieldName] = appState.fieldColors[oldFieldName];
        delete appState.fieldColors[oldFieldName];
    }

    // Update mappings if they reference the old field
    if (appState.mappings) {
        appState.mappings.forEach(mapping => {
            if (mapping.field === oldFieldName) {
                mapping.field = newFieldName;
            }
        });
    }

    // Sync back to input and update UI
    syncDataToInput();
    renderFieldList();
    updateMappingSelect();
    updatePreview();
    showToast(`필드명이 "${oldFieldName}"에서 "${newFieldName}"로 변경되었습니다.`);
}

function syncDataToInput() {
    // Update the input textarea with the modified data
    const jsonString = JSON.stringify(appState.originalData, null, 2);
    els.jsonInput.value = jsonString;

    // If color coding is enabled, update the overlay
    if (appState.colorCodingEnabled) {
        updateColorCodedOverlay();
    }
}

function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    setTimeout(() => {
        els.toast.classList.add('hidden');
    }, 3000);
}

// ===== Full Editor Modal Functions =====

function openFullEditor() {
    if (!appState.originalData || appState.originalData.length === 0) {
        showToast('먼저 JSON 데이터를 입력하세요.');
        return;
    }

    els.fullEditorModal.classList.remove('hidden');
    renderModalTable();
}

function closeFullEditor() {
    els.fullEditorModal.classList.add('hidden');
}

function renderModalTable() {
    if (!appState.originalData || appState.originalData.length === 0) {
        els.modalDataTable.innerHTML = '<tr><td>데이터가 없습니다</td></tr>';
        return;
    }

    // Build table header with editable field names and delete buttons
    let html = '<thead><tr><th class="row-number">#</th>';
    appState.fields.forEach((field, index) => {
        const colorClass = `rainbow-${appState.fieldColors[field]}`;
        html += `<th class="${colorClass}">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                <span contenteditable="true" data-field-index="${index}" class="editable-header">${field}</span>
                <button class="delete-col-btn" data-col-index="${index}">×</button>
            </div>
        </th>`;
    });
    html += '</tr></thead><tbody>';

    // Build table rows with editable cells and delete buttons
    appState.originalData.forEach((item, rowIndex) => {
        html += `<tr><td class="row-number">${rowIndex + 1}</td>`;
        appState.fields.forEach((field) => {
            const value = item[field] !== undefined ? item[field] : '';
            const colorClass = `rainbow-${appState.fieldColors[field]}`;
            html += `<td class="${colorClass}" contenteditable="true" data-row="${rowIndex}" data-field="${field}">${value}</td>`;
        });
        html += `<td><button class="delete-row-btn" data-row-index="${rowIndex}">삭제</button></td></tr>`;
    });

    html += '</tbody>';
    els.modalDataTable.innerHTML = html;

    // Add event listeners
    attachModalTableListeners();
}

function attachModalTableListeners() {
    // Cell editing
    const cells = els.modalDataTable.querySelectorAll('td[contenteditable]');
    cells.forEach(cell => {
        cell.addEventListener('blur', handleModalCellEdit);
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                cell.blur();
            }
        });
    });

    // Header editing
    const headers = els.modalDataTable.querySelectorAll('.editable-header');
    headers.forEach(header => {
        header.addEventListener('blur', handleModalHeaderEdit);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                header.blur();
            }
        });
    });

    // Delete column buttons
    const deleteColBtns = els.modalDataTable.querySelectorAll('.delete-col-btn');
    deleteColBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const colIndex = parseInt(e.target.dataset.colIndex);
            deleteColumn(colIndex);
        });
    });

    // Delete row buttons
    const deleteRowBtns = els.modalDataTable.querySelectorAll('.delete-row-btn');
    deleteRowBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const rowIndex = parseInt(e.target.dataset.rowIndex);
            deleteRow(rowIndex);
        });
    });
}

function handleModalCellEdit(e) {
    const cell = e.target;
    const rowIndex = parseInt(cell.dataset.row);
    const field = cell.dataset.field;
    const newValue = cell.textContent.trim();

    if (appState.originalData[rowIndex]) {
        let parsedValue = newValue;
        if (!isNaN(newValue) && newValue !== '') {
            parsedValue = parseFloat(newValue);
        } else if (newValue === 'true') {
            parsedValue = true;
        } else if (newValue === 'false') {
            parsedValue = false;
        } else if (newValue === 'null') {
            parsedValue = null;
        }

        appState.originalData[rowIndex][field] = parsedValue;
        syncDataToInput();
        updatePreview();
    }
}

function handleModalHeaderEdit(e) {
    const header = e.target;
    const fieldIndex = parseInt(header.dataset.fieldIndex);
    const oldFieldName = appState.fields[fieldIndex];
    const newFieldName = header.textContent.trim();

    if (!newFieldName || newFieldName === oldFieldName) {
        header.textContent = oldFieldName;
        return;
    }

    if (appState.fields.includes(newFieldName) && newFieldName !== oldFieldName) {
        showToast('이미 존재하는 필드명입니다.');
        header.textContent = oldFieldName;
        return;
    }

    // Update field name in all data objects
    appState.originalData.forEach(item => {
        if (item.hasOwnProperty(oldFieldName)) {
            item[newFieldName] = item[oldFieldName];
            delete item[oldFieldName];
        }
    });

    appState.fields[fieldIndex] = newFieldName;

    const selectedIndex = appState.selectedFields.indexOf(oldFieldName);
    if (selectedIndex !== -1) {
        appState.selectedFields[selectedIndex] = newFieldName;
    }

    if (appState.fieldColors[oldFieldName] !== undefined) {
        appState.fieldColors[newFieldName] = appState.fieldColors[oldFieldName];
        delete appState.fieldColors[oldFieldName];
    }

    syncDataToInput();
    renderFieldList();
    updateMappingSelect();
    updatePreview();
    showToast(`필드명 변경: "${oldFieldName}" → "${newFieldName}"`);
}

function addRow() {
    const newRow = {};
    appState.fields.forEach(field => {
        newRow[field] = '';
    });

    appState.originalData.push(newRow);
    syncDataToInput();
    updatePreview();
    renderModalTable();
    showToast('새 행이 추가되었습니다.');
}

function addColumn() {
    const newFieldName = prompt('새 필드명을 입력하세요:', 'newField');

    if (!newFieldName || !newFieldName.trim()) {
        return;
    }

    const trimmedName = newFieldName.trim();

    if (appState.fields.includes(trimmedName)) {
        showToast('이미 존재하는 필드명입니다.');
        return;
    }

    // Add new field to all data objects
    appState.originalData.forEach(item => {
        item[trimmedName] = '';
    });

    appState.fields.push(trimmedName);
    appState.selectedFields.push(trimmedName);
    appState.fieldColors[trimmedName] = appState.fields.length % 8;

    syncDataToInput();
    renderFieldList();
    updateMappingSelect();
    updatePreview();
    renderModalTable();
    showToast(`새 열 "${trimmedName}"이 추가되었습니다.`);
}

function deleteRow(rowIndex) {
    if (!confirm(`${rowIndex + 1}번 행을 삭제하시겠습니까?`)) {
        return;
    }

    appState.originalData.splice(rowIndex, 1);
    syncDataToInput();
    updatePreview();
    renderModalTable();
    showToast('행이 삭제되었습니다.');
}

function deleteColumn(colIndex) {
    const fieldName = appState.fields[colIndex];

    if (!confirm(`"${fieldName}" 열을 삭제하시겠습니까?`)) {
        return;
    }

    // Remove field from all data objects
    appState.originalData.forEach(item => {
        delete item[fieldName];
    });

    appState.fields.splice(colIndex, 1);

    const selectedIndex = appState.selectedFields.indexOf(fieldName);
    if (selectedIndex !== -1) {
        appState.selectedFields.splice(selectedIndex, 1);
    }

    delete appState.fieldColors[fieldName];

    syncDataToInput();
    renderFieldList();
    updateMappingSelect();
    updatePreview();
    renderModalTable();
    showToast(`열 "${fieldName}"이 삭제되었습니다.`);
}

function downloadFile(type) {
    if (appState.originalData.length === 0) return;

    let content = '';
    let mime = 'text/plain';

    if (type === 'json') {
        content = generateOutput('json');
        mime = 'application/json';
    } else if (type === 'csv') {
        content = generateOutput('csv');
        mime = 'text/csv';
    } else {
        content = generateOutput('txt');
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    let filename = els.filenameInput.value.trim() || 'result';
    if (!filename.endsWith('.' + type)) filename += '.' + type;

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Initialize
init();

// --- Mapping Logic ---

function setupMappingUI() {
    // Populate select
    els.mappingSelect = document.getElementById('mappingFieldSelect');
    els.mappingFromSelect = document.getElementById('mappingFromSelect');
    els.mappingTo = document.getElementById('mappingTo');
    els.mappingRemove = document.getElementById('mappingRemove');
    els.addMappingBtn = document.getElementById('addMappingBtn');
    els.mappingList = document.getElementById('mappingList');

    els.addMappingBtn.addEventListener('click', addMappingRule);

    // When field changes, populate value dropdown
    els.mappingSelect.addEventListener('change', updateMappingValueSelect);

    // Toggle "To" input when Remove is checked
    els.mappingRemove.addEventListener('change', (e) => {
        if (e.target.checked) {
            els.mappingTo.value = '';
            els.mappingTo.disabled = true;
            els.mappingTo.placeholder = "(삭제됨)";
        } else {
            els.mappingTo.disabled = false;
            els.mappingTo.placeholder = "새 값 (예: 도시)";
        }
    });
}

function updateMappingSelect() {
    if (!els.mappingSelect) return;

    // Save current selection if possible
    const currentVal = els.mappingSelect.value;

    els.mappingSelect.innerHTML = '<option value="">필드를 선택하세요</option>';
    appState.fields.forEach(field => {
        const opt = document.createElement('option');
        opt.value = field;
        opt.textContent = field;
        els.mappingSelect.appendChild(opt);
    });

    // Restore or first
    if (appState.fields.includes(currentVal)) {
        els.mappingSelect.value = currentVal;
    }

    // Update value dropdown if field is selected
    if (els.mappingSelect.value) {
        updateMappingValueSelect();
    }
}

function updateMappingValueSelect() {
    const selectedField = els.mappingSelect.value;
    if (!selectedField || !els.mappingFromSelect) return;

    // Get unique values for this field
    const uniqueValues = new Set();
    appState.originalData.forEach(item => {
        const val = item[selectedField];
        if (val !== undefined && val !== null && val !== '') {
            uniqueValues.add(String(val));
        }
    });

    // Populate dropdown
    els.mappingFromSelect.innerHTML = '<option value="">값을 선택하세요</option>';
    Array.from(uniqueValues).sort().forEach(value => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        els.mappingFromSelect.appendChild(opt);
    });
}

function addMappingRule() {
    const field = els.mappingSelect.value;
    const fromVal = els.mappingFromSelect.value.trim();
    const isRemove = els.mappingRemove.checked;
    const toVal = isRemove ? null : els.mappingTo.value.trim();

    if (!field || !fromVal) {
        showToast('필드와 현재 값을 선택해주세요.');
        return;
    }

    // Check duplicate
    const exists = appState.mappings && appState.mappings.some(r => r.field === field && r.from === fromVal);
    if (exists) {
        showToast('이미 존재하는 규칙입니다.');
        return;
    }

    if (!appState.mappings) appState.mappings = [];

    appState.mappings.push({
        field,
        from: fromVal,
        to: toVal,
        type: isRemove ? 'remove' : 'replace'
    });

    // Clear inputs
    els.mappingFromSelect.value = '';
    els.mappingTo.value = '';
    els.mappingRemove.checked = false;
    els.mappingTo.disabled = false;
    els.mappingTo.placeholder = "새 값 (예: 도시)";

    renderMappingList();
    updatePreview();
}

function removeMappingRule(index) {
    appState.mappings.splice(index, 1);
    renderMappingList();
    updatePreview();
}

function renderMappingList() {
    els.mappingList.innerHTML = '';
    if (!appState.mappings || appState.mappings.length === 0) return;

    appState.mappings.forEach((rule, idx) => {
        const item = document.createElement('div');
        item.className = 'mapping-item';

        let visualArrow = '';
        if (rule.type === 'remove') {
            visualArrow = `<span class="mapping-tag removed">삭제</span>`;
        } else {
            visualArrow = `<span class="mapping-arrow">➜</span><span class="mapping-val" title="${rule.to}">${rule.to}</span>`;
        }

        item.innerHTML = `
            <div class="mapping-info">
                <span class="mapping-tag">${rule.field}</span>
                <span class="mapping-val" title="${rule.from}">${rule.from}</span>
                ${visualArrow}
            </div>
            <button class="remove-btn" onclick="removeMappingRule(${idx})">×</button>
        `;
        // Attach event listener via JS
        item.querySelector('.remove-btn').onclick = () => removeMappingRule(idx);

        els.mappingList.appendChild(item);
    });
}
