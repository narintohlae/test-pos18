const API_URL = 'https://script.google.com/macros/s/AKfycbyPMzdWVeyKJZhr_rtSOfnSlbwlN1MZ9UhaQlykyCxpcpmAUM7w9-S3b-EFC_JdXkG5Yg/exec';

let productsData = [];

// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('resultsContainer');
const statusMessage = document.getElementById('statusMessage');

// Initialize: Fetch Data
async function init() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const json = await response.json();
        productsData = json.data;
        
        statusMessage.textContent = 'พร้อมตรวจสอบราคา (ค้นหาจากสินค้ากว่า ' + productsData.length + ' รายการ)';
        console.log('Data loaded:', productsData.length, 'items');
    } catch (error) {
        console.error('Error fetching data:', error);
        statusMessage.innerHTML = '<span style="color: #ef4444;">เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง</span>';
    }
}

// Search Logic
function performSearch() {
    const query = searchInput.value.trim().toLowerCase();
    
    if (!query) return;

    statusMessage.textContent = 'กำลังค้นหา...';
    resultsContainer.innerHTML = '';
    
    // 1. Try exact match (Barcode or ID)
    let product = productsData.find(p => 
        (p['รหัสสินค้า'] && p['รหัสสินค้า'].toLowerCase() === query) || 
        (p['บาร์โค้ดในหน่วยนับ 1'] && p['บาร์โค้ดในหน่วยนับ 1'] === query)
    );

    // 2. Try partial match (Name) if no exact match
    if (!product) {
        product = productsData.find(p => 
            p['ชื่อการค้า'] && p['ชื่อการค้า'].toLowerCase().includes(query)
        );
    }

    if (product) {
        renderProduct(product);
        statusMessage.textContent = '';
    } else {
        statusMessage.textContent = 'ไม่พบสินค้าที่ตรงกับ "' + query + '"';
    }
}

// Helper to extract price
function getPrice(product) {
    const unit1 = product['หน่วยนับที่ 1'];
    // Look for price in fields like "หน่วย/กล่อง", "หน่วย/ขวด", etc.
    const priceKey = 'หน่วย/' + unit1;
    let price = product[priceKey];

    // If not found, check other possible fields or levels
    if (price === undefined || price === "" || price === null || price == 0) {
        // Fallback: check values in price 1, price 2, price 3 if exist
        price = product['ราคา 1'] || product['ราคา 2'] || product['ระดับที่ 1'] || "0.00";
    }

    // Clean up price (remove non-numeric if needed, or parse)
    if (typeof price === 'string') {
        // Handle cases like "1/55" or ranges if necessary, for now just parse float
        const match = price.match(/[0-9.]+/);
        price = match ? match[0] : "0.00";
    }

    const numericPrice = parseFloat(price);
    return isNaN(numericPrice) ? 0 : numericPrice;
}

// Render Result
function renderProduct(product) {
    const price = getPrice(product);
    const unit = product['หน่วยนับที่ 1'] || 'ชิ้น';
    const barcode = product['บาร์โค้ดในหน่วยนับ 1'] || 'ไม่มีบาร์โค้ด';
    const productId = product['รหัสสินค้า'] || 'N/A';

    const card = document.createElement('div');
    card.className = 'product-card glass';
    
    card.innerHTML = `
        <div class="product-id">ID: ${productId}</div>
        <div class="product-name">${product['ชื่อการค้า']}</div>
        <div class="barcode-badge">Barcode: ${barcode}</div>
        
        <div class="price-section">
            <div class="price-label">ราคาประมาณการ</div>
            <div class="price-value">฿${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
            <div class="unit-label">ต่อ 1 ${unit}</div>
        </div>
    `;

    resultsContainer.appendChild(card);
}

// Events
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

// Auto-focus search input
window.addEventListener('load', () => {
    searchInput.focus();
    init();
});
