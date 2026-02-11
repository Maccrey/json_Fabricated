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
    }
};

// DOM Elements
const els = {
    dropZone: document.getElementById('dropZone'),
    jsonInput: document.getElementById('jsonInput'),
    inputStatus: document.getElementById('inputStatus'),
    fieldList: document.getElementById('fieldList'),
    outputPreview: document.getElementById('outputPreview'),
    btnCopy: document.getElementById('copyBtn'),
    filenameInput: document.getElementById('filenameInput'),
    exportBtns: document.querySelectorAll('.export-controls button[data-type]'),
    toast: document.getElementById('toast'),
    toast: document.getElementById('toast'),
    optUseTab: document.getElementById('useTab'),
    optSingleLine: document.getElementById('singleLine'),
    optStartIndent: document.getElementById('startIndent'),
    mappingRemove: null // Will be init in setupMappingUI
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

    try {
        const parsed = JSON.parse(rawText);

        // Normalize: Ensure we have an array of objects
        if (Array.isArray(parsed)) {
            appState.originalData = parsed;
        } else if (typeof parsed === 'object' && parsed !== null) {
            // Single object -> Array of 1
            appState.originalData = [parsed];
        } else {
            throw new Error('Valid JSON but not an ID/Object list');
        }

        els.inputStatus.textContent = `Loaded ${appState.originalData.length} items`;
        els.inputStatus.style.color = '#00f2fe';

        extractFields();
        renderFieldList();
        updateMappingSelect();
        updatePreview();

    } catch (err) {
        els.inputStatus.textContent = 'Invalid JSON';
        els.inputStatus.style.color = '#ff4b4b';
        console.error(err);
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

function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    setTimeout(() => {
        els.toast.classList.add('hidden');
    }, 3000);
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
    els.mappingFrom = document.getElementById('mappingFrom');
    els.mappingTo = document.getElementById('mappingTo');
    els.mappingRemove = document.getElementById('mappingRemove');
    els.addMappingBtn = document.getElementById('addMappingBtn');
    els.mappingList = document.getElementById('mappingList');

    els.addMappingBtn.addEventListener('click', addMappingRule);

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

    els.mappingSelect.innerHTML = '';
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
}

function addMappingRule() {
    const field = els.mappingSelect.value;
    const fromVal = els.mappingFrom.value.trim();
    const toVal = els.mappingTo.value.trim();

    if (!field || !fromVal) {
        showToast('필드와 현재 값을 입력해주세요.');
        return;
    }

    // Check duplicate
    const exists = appState.mappings && appState.mappings.some(r => r.field === field && r.from === fromVal);
    if (exists) {
        showToast('이미 존재하는 규칙입니다.');
        return;
    }

    if (!appState.mappings) appState.mappings = [];

    appState.mappings.push({ field, from: fromVal, to: toVal });

    // Clear inputs
    els.mappingFrom.value = '';
    els.mappingTo.value = '';

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
