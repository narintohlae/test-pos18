const API_URL = 'https://script.google.com/macros/s/AKfycbyPMzdWVeyKJZhr_rtSOfnSlbwlN1MZ9UhaQlykyCxpcpmAUM7w9-S3b-EFC_JdXkG5Yg/exec';

let productsData = [];
let codeReader;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const scanBtn = document.getElementById('scanBtn');
const resultsContainer = document.getElementById('resultsContainer');
const statusMessage = document.getElementById('statusMessage');
const scannerDrawer = document.getElementById('scannerDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const closeScanner = document.getElementById('closeScanner');
const searchSuggestions = document.getElementById('searchSuggestions');

let searchDebounceTimer;


// Initialize: Fetch Data
async function init() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const json = await response.json();
        productsData = json.data;
        
        statusMessage.textContent = 'พร้อมตรวจสอบราคา (สินค้า ' + productsData.length + ' รายการ)';
        codeReader = new ZXing.BrowserMultiFormatReader();
    } catch (error) {
        console.error('Error:', error);
        statusMessage.innerHTML = '<span style="color: #ef4444;">เกิดข้อผิดพลาดในการโหลดข้อมูล</span>';
    }
}

// Search Logic
function performSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;

    statusMessage.textContent = 'กำลังค้นหา...';
    resultsContainer.innerHTML = '';
    
    let results = []; // Array of { product, matchedUnitIndex }
    const MAX_RESULTS = 50;

    // 1. Check Exact Matches (ID and Barcodes)
    for (const p of productsData) {
        let matchedUnitIndex = -1;
        let isMatch = false;

        // Check Product ID
        if (p['รหัสสินค้า'] && p['รหัสสินค้า'].toString().toLowerCase() === query) {
            isMatch = true;
        }
        // Check Barcode 1
        else if (p['บาร์โค้ดในหน่วยนับ 1'] && p['บาร์โค้ดในหน่วยนับ 1'].toString() === query) {
            isMatch = true;
            matchedUnitIndex = 0;
        }
        // Check Barcode 2
        else if (p['บาร์โค้ดในหน่วยนับ 2'] && p['บาร์โค้ดในหน่วยนับ 2'].toString() === query) {
            isMatch = true;
            matchedUnitIndex = 1;
        }
        // Check Barcode 3
        else if (p['บาร์โค้ดในหน่วยนับ 3'] && p['บาร์โค้ดในหน่วยนับ 3'].toString() === query) {
            isMatch = true;
            matchedUnitIndex = 2;
        }

        if (isMatch) {
            results.push({ product: p, matchedUnitIndex });
            // If it's an exact barcode/ID match, we might want to prioritize it and potentially stop here
            // But for now, let's keep going to see if there are other matches (though unlikely for exact ID)
        }
    }

    // 2. Partial Name Match (only if no exact matches or if searching by name)
    // We add these if they aren't already in the results
    if (results.length === 0 || isNaN(query)) { 
        for (const p of productsData) {
            if (results.length >= MAX_RESULTS) break;
            
            // Avoid duplicates
            if (results.some(r => r.product === p)) continue;

            if (p['ชื่อการค้า'] && p['ชื่อการค้า'].toString().toLowerCase().includes(query)) {
                results.push({ product: p, matchedUnitIndex: -1 });
            }
        }
    }

    if (results.length > 0) {
        statusMessage.textContent = `พบสินค้า ${results.length} รายการ ที่ตรงกับ "${query}"`;
        results.forEach(res => renderProduct(res.product, res.matchedUnitIndex));
        if (results.length === 1) {
            window.scrollTo({ top: resultsContainer.offsetTop - 20, behavior: 'smooth' });
        }
    } else {
        statusMessage.textContent = 'ไม่พบสินค้าที่ตรงกับ "' + query + '"';
    }
}

// Suggestions Logic
function updateSuggestions() {
    const query = searchInput.value.trim().toLowerCase();
    
    if (query.length < 2) {
        searchSuggestions.classList.remove('active');
        return;
    }

    const matches = [];
    const MAX_SUGGESTIONS = 8;

    for (const p of productsData) {
        if (matches.length >= MAX_SUGGESTIONS) break;

        const name = (p['ชื่อการค้า'] || '').toString().toLowerCase();
        const id = (p['รหัสสินค้า'] || '').toString().toLowerCase();
        const b1 = (p['บาร์โค้ดในหน่วยนับ 1'] || '').toString();

        if (name.includes(query) || id === query || b1 === query) {
            matches.push(p);
        }
    }

    if (matches.length > 0) {
        searchSuggestions.innerHTML = matches.map(p => {
            const tiers = getPricingTiers(p);
            const price = tiers.length > 0 ? `฿${tiers[0].price.toLocaleString()}` : '';
            return `
                <div class="suggestion-item" data-id="${p['รหัสสินค้า']}">
                    <div class="suggestion-info">
                        <span class="suggestion-name">${p['ชื่อการค้า']}</span>
                        <span class="suggestion-barcode">${p['บาร์โค้ดในหน่วยนับ 1'] || ''}</span>
                    </div>
                    <div class="suggestion-price">${price}</div>
                </div>
            `;
        }).join('');
        searchSuggestions.classList.add('active');
    } else {
        searchSuggestions.classList.remove('active');
    }
}

function handleSuggestionClick(e) {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;

    const productId = item.dataset.id;
    const product = productsData.find(p => p['รหัสสินค้า'].toString() === productId);
    
    if (product) {
        searchInput.value = product['ชื่อการค้า'];
        searchSuggestions.classList.remove('active');
        
        // Trigger specific search for this product
        resultsContainer.innerHTML = '';
        renderProduct(product, -1);
        statusMessage.textContent = '';
        window.scrollTo({ top: resultsContainer.offsetTop - 20, behavior: 'smooth' });
    }
}


// Pricing Logic
function getPricingTiers(product) {
    const tiers = [];
    const parsePrice = (val) => {
        if (!val) return 0;
        const match = val.toString().match(/[0-9.]+/);
        return match ? parseFloat(match[0]) : 0;
    };

    // Level 1: O/P
    if (parsePrice(product['ราคา 1']) > 0) {
        tiers.push({ price: parsePrice(product['ราคา 1']), unit: product['หน่วย 1'] || product['หน่วยนับที่ 1'] || 'ชิ้น' });
    }
    // Level 2: Q/R
    if (parsePrice(product['ราคา 2']) > 0) {
        tiers.push({ price: parsePrice(product['ราคา 2']), unit: product['หน่วย 2'] || 'หน่วยที่ 2' });
    }
    // Level 3: S/T
    if (parsePrice(product['ราคา 3']) > 0) {
        tiers.push({ price: parsePrice(product['ราคา 3']), unit: product['หน่วย 3'] || 'หน่วยที่ 3' });
    }

    if (tiers.length === 0) {
        let fallbackPrice = 0;
        let fallbackUnit = product['หน่วยนับที่ 1'] || 'ชิ้น';
        if (product['ระดับที่ 1'] && product['ระดับที่ 1'].toString().includes('/')) {
            fallbackPrice = parsePrice(product['ระดับที่ 1'].split('/')[1]);
        } else {
            fallbackPrice = parsePrice(product['หน่วย/' + fallbackUnit]);
        }
        tiers.push({ price: fallbackPrice, unit: fallbackUnit });
    }
    return tiers;
}

// Render Result
function renderProduct(product, matchedUnitIndex) {
    const tiers = getPricingTiers(product);
    const productId = product['รหัสสินค้า'] || 'N/A';
    
    // Display primary barcode found or default to Barcode 1
    const displayBarcode = matchedUnitIndex >= 0 
        ? product[`บาร์โค้ดในหน่วยนับ ${matchedUnitIndex + 1}`] 
        : (product['บาร์โค้ดในหน่วยนับ 1'] || 'N/A');

    const card = document.createElement('div');
    card.className = 'product-card glass';
    
    const pricesHtml = tiers.map((tier, index) => {
        // Highlight the specific unit if it matched the barcode
        const isMatched = (index === matchedUnitIndex);
        return `
            <div class="price-tier ${index === 0 ? 'primary-tier' : 'secondary-tier'} ${isMatched ? 'highlight-tier' : ''}">
                <div class="price-label">
                    ${index === 0 ? 'ราคามาตรฐาน' : 'ระดับราคา ' + (index + 1)}
                    ${isMatched ? '<span class="match-badge">✓ ตรงกับบาร์โค้ด</span>' : ''}
                </div>
                <div class="price-value">฿${tier.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
                <div class="unit-label">ต่อ 1 ${tier.unit}</div>
            </div>
        `;
    }).join('');

    card.innerHTML = `
        <div class="product-id">ID: ${productId}</div>
        <div class="product-name">${product['ชื่อการค้า']}</div>
        <div class="barcode-badge">Barcode: ${displayBarcode}</div>
        <div class="price-section multi-price">${pricesHtml}</div>
    `;

    resultsContainer.appendChild(card);
}

// Scanner Functions
async function openScanner() {
    scannerDrawer.classList.add('active');
    drawerOverlay.classList.add('active');
    
    try {
        const videoInputDevices = await codeReader.listVideoInputDevices();
        
        // Try to find back camera
        let selectedDeviceId = videoInputDevices[0].deviceId;
        for (const device of videoInputDevices) {
            const label = device.label.toLowerCase();
            if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                selectedDeviceId = device.deviceId;
                break;
            }
        }

        await codeReader.decodeFromVideoDevice(selectedDeviceId, 'video', (result, err) => {
            if (result) {
                searchInput.value = result.text;
                closeScannerDrawer();
                performSearch();
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error(err);
            }
        });
    } catch (err) {
        console.error(err);
        statusMessage.textContent = "ไม่สามารถเปิดกล้องได้";
        closeScannerDrawer();
    }
}


function closeScannerDrawer() {
    scannerDrawer.classList.remove('active');
    drawerOverlay.classList.remove('active');
    if (codeReader) {
        codeReader.reset();
    }
}


// Events
searchBtn.addEventListener('click', () => {
    searchSuggestions.classList.remove('active');
    performSearch();
});
searchInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') {
        searchSuggestions.classList.remove('active');
        performSearch(); 
    }
});
searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(updateSuggestions, 300);
});
searchSuggestions.addEventListener('click', handleSuggestionClick);
scanBtn.addEventListener('click', openScanner);
closeScanner.addEventListener('click', closeScannerDrawer);
drawerOverlay.addEventListener('click', closeScannerDrawer);
document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-wrapper')) {
        searchSuggestions.classList.remove('active');
    }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) closeScannerDrawer(); });


window.addEventListener('load', () => {
    searchInput.focus();
    init();
});
