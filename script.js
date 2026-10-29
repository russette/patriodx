const PAYSTACK_PUBLIC_KEY =
    "pk_live_e1462983063e834b226acdca9492e980762a6ddd";
const SUPABASE_URL = "https://saerujjsfzyxkyacbvgr.supabase.co";
const SUPABASE_KEY = "sb_publishable_l50YIYtYLXkjWE1iQSTyoA_GkrIKWn7";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let products = [];
let customers = [];
let sales = [];
let invoices = [];

let currentUser = null;
let currentBusiness = null;
let currentPlan = "free";
let editingProductId = null;
let socialFeedMode = "latest";

// =========================================================
// PLAN LIMITS
// =========================================================

const PLAN_LIMITS = {
    free: {
        products: 20,
        customers: 20,
        salesPerMonth: 30,
        invoicesPerMonth: 5
    },

    pro: {
        products: Infinity,
        customers: Infinity,
        salesPerMonth: Infinity,
        invoicesPerMonth: Infinity
    },

    business: {
        products: Infinity,
        customers: Infinity,
        salesPerMonth: Infinity,
        invoicesPerMonth: Infinity
    }
};


// =========================================================
// BASIC HELPERS
// =========================================================

function money(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function safe(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function renderClickableMentions(content) {
    return safe(content).replace(
        /(^|[\s(])@([A-Za-z0-9_.-]{2,30})\b/g,
        function (match, prefix, username) {
            return prefix +
                `<a href="#" class="patriodx-mention-link"
                    data-mention-username="${username}"
                    style="color:var(--primary-color, #6366f1);
                           font-weight:600;
                           text-decoration:none;">
                    @${username}</a>`;
        }
    );
}
document.addEventListener("click", async function (event) {
    const mention = event.target.closest(".patriodx-mention-link");

    if (!mention) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const username = mention.dataset.mentionUsername;

    if (!username) {
        return;
    }

    try {
        const { data: profile, error } = await supabaseClient
            .from("profiles")
            .select("id")
            .ilike("username", username)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!profile) {
            showPATRIODXToast(
                "This user could not be found.",
                "info"
            );
            return;
        }

        await loadPublicProfile(profile.id);

        const profileCard =
            document.getElementById("publicProfileCard");

        if (profileCard) {
            profileCard.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    } catch (error) {
        console.error("Could not open tagged profile:", error);

        showPATRIODXToast(
            "Could not open this profile. Please try again.",
            "error"
        );
    }
});
function todayString() {
    return new Date().toISOString().split("T")[0];
}

function createReference() {
    return "INV-" + Date.now();
}

function formatDate(date) {
    if (!date) return "—";

    const d = new Date(date);

    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleDateString();
}
function formatMessageTime(date) {
    if (!date) return "";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) return "";

    return parsed.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}

// =========================================================
// PLAN CHECKING
// =========================================================

function loadPlan() {

    if (!currentBusiness) {
        currentPlan = "free";
        return;
    }

    currentPlan =
        String(currentBusiness.plan || "free").toLowerCase();

    if (!PLAN_LIMITS[currentPlan]) {
        currentPlan = "free";
    }

    console.log("PATRIODX plan:", currentPlan);
}

function getSalesThisMonth() {

    const now = new Date();

    return sales.filter(sale => {

        if (!sale.created_at) return false;

        const date = new Date(sale.created_at);

        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
        );

    }).length;
}

function getInvoicesThisMonth() {

    const now = new Date();

    return invoices.filter(invoice => {

        if (!invoice.created_at) return false;

        const date = new Date(invoice.created_at);

        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
        );

    }).length;
}

function canCreate(type) {

    const limits =
        PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

    if (type === "product") {

        if (products.length >= limits.products) {

          showPATRIODXToast(
    "Free plan limit reached: 20 products. Upgrade to Pro for unlimited products.",
    "warning"
);

            return false;
        }
    }

    if (type === "customer") {

        if (customers.length >= limits.customers) {

           showPATRIODXToast(
    "Free plan limit reached: 20 customers. Upgrade to Pro for unlimited customers.",
    "warning"
);
            return false;
        }
    }

    if (type === "sale") {

        const count =
            getSalesThisMonth();

        if (count >= limits.salesPerMonth) {

           showPATRIODXToast(
    "Free plan limit reached: 30 customers. Upgrade to Pro for unlimited sales.",
    "warning"
);
            return false;
        }
    }

    if (type === "invoice") {

        const count =
            getInvoicesThisMonth();

        if (count >= limits.invoicesPerMonth) {

            showPATRIODXToast(
    "Free plan limit reached: 5 invoices this month. Upgrade to Pro for unlimited invoices.",
    "warning"
);

            return false;
        }
    }

    return true;
}


// =========================================================
// AUTH / SUPABASE
// =========================================================

async function loadUser() {

    try {

        const {
            data: { session },
            error
        } = await supabaseClient.auth.getSession();

       if (error) {
    console.error("Session loading error:", error);

    showPATRIODXToast(
        "Unable to connect to PATRIODX.",
        "error"
    );

    return false;
}
        if (!session || !session.user) {
            console.log("No active PATRIODX session.");
            window.location.href = "auth.html";
            return false;
        }

        currentUser = session.user;

        console.log(
            "PATRIODX session restored:",
            currentUser.email
        );

        const userEmail =
            document.getElementById("userEmail");

        if (userEmail) {
            userEmail.textContent =
                currentUser.email || "Account";
        }

       const { data: businesses, error: businessError } =
    await supabaseClient
        .from("businesses")
        .select("*")
        .eq("owner_id", currentUser.id);

const business = businesses?.[0] || null;
        if (businessError) {
            console.error(
                "Business loading error:",
                businessError
            );

           showPATRIODXToast(
    "Your PATRIODX business account could not be loaded.",
    "error"
);
            return false;
        }

        if (!business) {
            console.error(
                "No business account found for:",
                currentUser.id
            );

            showPATRIODXToast(
    "Your PATRIODX business account could not be found.",
    "error"
);

            return false;
        }

        currentBusiness = business;

        loadPlan();

        return true;

    } catch (error) {

        console.error(
            "Unexpected PATRIODX session error:",
            error
        );

       showPATRIODXToast(
    "Unable to restore your PATRIODX account.",
    "error"
);

        return false;
    }
}


// =========================================================
// LOAD DATA
// =========================================================

async function loadData() {

    if (!currentBusiness) return;

    const businessId =
        currentBusiness.id;

    const [
        productsResult,
        customersResult,
        salesResult,
        invoicesResult
    ] = await Promise.all([

        supabaseClient
            .from("products")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("customers")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("sales")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("invoices")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            })
    ]);

    if (productsResult.error) {
        console.error(productsResult.error);
    }

    if (customersResult.error) {
        console.error(customersResult.error);
    }

    if (salesResult.error) {
        console.error(salesResult.error);
    }

    if (invoicesResult.error) {
        console.error(invoicesResult.error);
    }

    products =
        productsResult.data || [];

    customers =
        customersResult.data || [];

    sales =
        salesResult.data || [];

    invoices =
        invoicesResult.data || [];
}


/* =========================================================
   PATRIODX NAVIGATION COMPATIBILITY
   All navigation goes through the app router.
========================================================= */

function scrollToSection(id) {

    if (typeof navigatePATRIODX === "function") {

        let pageId = id;

        /*
           Support the old AI section name.
        */
        if (pageId === "ai") {
            pageId = "patriodxAI";
        }

        navigatePATRIODX(pageId);
        return;
    }

    /*
       Fallback only if router has not loaded yet.
    */
    const section = document.getElementById(id);

    if (section) {
        section.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}


function setupNavigation() {

    /*
       The main PATRIODX router handles navigation.
       This function intentionally does not add
       another click listener.
    */

    return;
}
/* =========================================================
   HEADER SEARCH
========================================================= */

function setupHeaderSearch() {

    const searchButton =
        document.getElementById(
            "headerSearchButton"
        );

    const searchPanel =
        document.getElementById(
            "globalSearchPanel"
        );

    const searchInput =
        document.getElementById(
            "globalSearchInput"
        );

    const closeButton =
        document.getElementById(
            "closeGlobalSearch"
        );

    if (
        !searchButton ||
        !searchPanel ||
        !searchInput ||
        !closeButton
    ) {
        return;
    }

    searchButton.addEventListener(
        "click",
        function() {

            searchPanel.style.display =
                "block";

            searchInput.focus();

            if (
                typeof lucide !==
                "undefined"
            ) {

                lucide.createIcons();

            }
        }
    );

    closeButton.addEventListener(
        "click",
        function() {

            searchPanel.style.display =
                "none";

            searchInput.value = "";

            const results =
                document.getElementById(
                    "globalSearchResults"
                );

            if (results) {

                results.style.display =
                    "none";

            }
        }
    );

}

setupHeaderSearch();
// =========================================================
// DARK MODE
// =========================================================

function setupDarkMode() {

    const button =
        document.getElementById("themeToggle");

    const settingsToggle =
        document.getElementById(
            "settingsDarkModeToggle"
        );

    const savedTheme =
        localStorage.getItem("patriodxTheme");

    function isDarkMode() {

        return document.body.classList.contains(
            "dark-mode"
        );
    }

    function updateThemeUI() {

        const dark = isDarkMode();

        // Existing header/sidebar dark-mode button
        if (button) {

            button.innerHTML =
                dark
                    ? '<i data-lucide="sun"></i>'
                    : '<i data-lucide="moon"></i>';

            button.setAttribute(
                "aria-label",
                dark
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            );

            button.setAttribute(
                "title",
                dark
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            );
        }

        // Settings & Activity toggle
        if (settingsToggle) {

            settingsToggle.checked = dark;
        }

        if (
            typeof lucide !== "undefined"
        ) {

            lucide.createIcons();
        }
    }

    function setDarkMode(dark) {

        document.body.classList.toggle(
            "dark-mode",
            dark
        );

        localStorage.setItem(
            "patriodxTheme",
            dark
                ? "dark"
                : "light"
        );

        updateThemeUI();
    }


    // Load saved theme
    if (savedTheme === "dark") {

        document.body.classList.add(
            "dark-mode"
        );
    }


    // Existing dark-mode button
    if (button) {

        button.addEventListener(
            "click",
            function() {

                setDarkMode(
                    !isDarkMode()
                );
            }
        );
    }


    // Settings & Activity dark-mode toggle
   if (settingsToggle) {

    settingsToggle.addEventListener(
        "change",
        function() {

            const enabled =
                this.checked;

            document.body.classList.toggle(
                "dark-mode",
                enabled
            );

            localStorage.setItem(
                "patriodxTheme",
                enabled
                    ? "dark"
                    : "light"
            );

            updateThemeUI();

        }
    );
}


    updateThemeUI();
}
function calculateProductPerformance() {
const performance = new Map();


products.forEach(product => {
    performance.set(String(product.id), {
        id: product.id,
        name: product.name || "Unnamed product",
        stock: Math.max(0, Number(product.stock) || 0),
        unitsSold: 0,
        revenue: 0,
        saleCount: 0
    });
});

sales.forEach(sale => {
    let item = null;

    if (sale.product_id != null) {
        item = performance.get(String(sale.product_id)) || null;
    }

    // Fall back to the recorded product name for older sales
    // that don't have a matching product_id.
    if (!item && sale.product_name) {
        const matchingName = String(sale.product_name)
            .trim()
            .toLowerCase();

        item = Array.from(performance.values()).find(product =>
            String(product.name).trim().toLowerCase() === matchingName
        ) || null;
    }

    // Keep sales for deleted products out of current-product
    // rankings, but include them in overall recorded totals.
    if (item) {
        item.unitsSold += Math.max(0, Number(sale.quantity) || 0);
        item.revenue += Math.max(0, Number(sale.total) || 0);
        item.saleCount += 1;
    }
});

return Array.from(performance.values());


}

function renderProductPerformance() {
const section = document.getElementById("businessProductPerformance");

if (!section) return;

const bestSellersContainer =
    document.getElementById("performanceBestSellers");

const noSalesContainer =
    document.getElementById("performanceNoSales");

const productPerformance = calculateProductPerformance();

const totalUnits = sales.reduce((sum, sale) => {
    return sum + Math.max(0, Number(sale.quantity) || 0);
}, 0);

const totalRevenue = sales.reduce((sum, sale) => {
    return sum + Math.max(0, Number(sale.total) || 0);
}, 0);

const productsSold = productPerformance.filter(product =>
    product.unitsSold > 0
).length;

const productsWithoutSales = productPerformance.filter(product =>
    product.unitsSold === 0
);

const summary = {
    performanceTotalUnits: totalUnits,
    performanceTotalRevenue: money(totalRevenue),
    performanceProductsSold: productsSold,
    performanceProductsWithoutSales: productsWithoutSales.length
};

Object.entries(summary).forEach(([id, value]) => {
    const element = document.getElementById(id);

    if (element) {
        element.textContent =
            typeof value === "number"
                ? value.toLocaleString()
                : value;
    }
});

const rankedProducts = productPerformance
    .filter(product => product.unitsSold > 0)
    .sort((a, b) =>
        b.unitsSold - a.unitsSold ||
        b.revenue - a.revenue
    )
    .slice(0, 5);

if (bestSellersContainer) {
    if (!rankedProducts.length) {
        bestSellersContainer.innerHTML = `
            <div class="business-performance-empty">
                <i data-lucide="chart-no-axes-column"></i>
                <span>No product sales have been recorded yet.</span>
            </div>
        `;
    } else {
        bestSellersContainer.innerHTML = rankedProducts.map(
            (product, index) => `
                <div class="business-performance-product-row">
                    <span class="business-performance-rank">
                        ${index + 1}
                    </span>

                    <div class="business-performance-product-info">
                        <strong>${safe(product.name)}</strong>
                        <span>${product.unitsSold.toLocaleString()} units sold</span>
                    </div>

                    <div class="business-performance-product-revenue">
                        <strong>${money(product.revenue)}</strong>
                        <span>Revenue</span>
                    </div>
                </div>
            `
        ).join("");
    }
}

if (noSalesContainer) {
    if (!productsWithoutSales.length) {
        noSalesContainer.innerHTML = `
            <div class="business-performance-empty success">
                <i data-lucide="circle-check"></i>
                <span>Every current product has at least one recorded sale.</span>
            </div>
        `;
    } else {
        noSalesContainer.innerHTML = productsWithoutSales
            .slice(0, 5)
            .map(product => `
                <div class="business-performance-no-sales-row">
                    <div class="business-performance-no-sales-icon">
                        <i data-lucide="package"></i>
                    </div>

                    <div class="business-performance-product-info">
                        <strong>${safe(product.name)}</strong>
                        <span>${product.stock.toLocaleString()} units currently in stock</span>
                    </div>

                    <span class="business-performance-no-sales-badge">
                        No sales
                    </span>
                </div>
            `).join("");

        if (productsWithoutSales.length > 5) {
            noSalesContainer.insertAdjacentHTML(
                "beforeend",
                `<p class="business-performance-more">
                    And ${(productsWithoutSales.length - 5).toLocaleString()} more products
                </p>`
            );
        }
    }
}

if (typeof lucide !== "undefined") {
    lucide.createIcons();
}


}

function renderInventorySummary() {
const totalProducts = products.length;


const totalUnits = products.reduce((total, product) => {
    return total + Math.max(0, Number(product.stock) || 0);
}, 0);

const lowStock = products.filter(product => {
    const stock = Math.max(0, Number(product.stock) || 0);
    return stock > 0 && stock <= 5;
}).length;

const outOfStock = products.filter(product => {
    return Math.max(0, Number(product.stock) || 0) === 0;
}).length;

const values = {
    inventoryTotalProducts: totalProducts,
    inventoryTotalUnits: totalUnits,
    inventoryLowStock: lowStock,
    inventoryOutOfStock: outOfStock
};

Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value.toLocaleString();
    }
});


}

function setInventorySummaryFilter(filter) {
const stockFilter = document.getElementById("productStockFilter");


if (!stockFilter) return;

stockFilter.value = filter;

const productsSection = document.getElementById("products");

if (productsSection) {
    productsSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

renderProducts();


}
function renderInventoryAlerts() {
const list = document.getElementById("inventoryAlertList");
const count = document.getElementById("inventoryAlertCount");


if (!list || !count) return;

const alerts = products
    .map(product => ({
        ...product,
        availableStock: Math.max(0, Number(product.stock) || 0)
    }))
    .filter(product => product.availableStock <= 5)
    .sort((a, b) => a.availableStock - b.availableStock);

count.textContent = `${alerts.length} alert${alerts.length === 1 ? "" : "s"}`;

if (alerts.length === 0) {
    list.innerHTML = `
        <div class="business-inventory-alert-empty">
            <i data-lucide="check-circle"></i>
            <span>Your inventory is looking good. No restocking alerts.</span>
        </div>
    `;

    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
}

list.innerHTML = alerts.map(product => {
    const outOfStock = product.availableStock === 0;

    return `
        <div class="business-inventory-alert-row">

            <div class="business-inventory-alert-symbol ${outOfStock ? "critical" : "warning"}">
                <i data-lucide="${outOfStock ? "package-x" : "alert-triangle"}"></i>
            </div>

            <div class="business-inventory-alert-details">
                <strong>${safe(product.name || "Unnamed product")}</strong>
                <span>${outOfStock ? "Out of stock — restocking needed" : `${product.availableStock} unit${product.availableStock === 1 ? "" : "s"} remaining`}</span>
            </div>

            <span class="business-inventory-alert-status ${outOfStock ? "critical" : "warning"}">
                ${outOfStock ? "Out of stock" : "Low stock"}
            </span>

            <button
                type="button"
                class="business-inventory-alert-action"
                onclick="setInventorySummaryFilter('${outOfStock ? "out-of-stock" : "low-stock"}')"
            >
                View
                <i data-lucide="arrow-up-right"></i>
            </button>

        </div>
    `;
}).join("");

if (typeof lucide !== "undefined") lucide.createIcons();

}


// =========================================================
// PRODUCT DISPLAY
// =========================================================

function renderProducts() {
    const container = document.getElementById("productsList");
if (!container) return;

renderInventorySummary();
renderInventoryAlerts();
renderProductPerformance();
    const searchInput = document.getElementById("productSearch");
    const stockFilter = document.getElementById("productStockFilter");

    const search = searchInput
        ? searchInput.value.toLowerCase().trim()
        : "";

    const selectedStatus = stockFilter
        ? stockFilter.value
        : "all";

    const filtered = products.filter(product => {
        const name = String(product.name || "").toLowerCase();
        const stock = Math.max(0, Number(product.stock) || 0);

        const matchesSearch = name.includes(search);

        let status = "in-stock";

        if (stock === 0) {
            status = "out-of-stock";
        } else if (stock <= 5) {
            status = "low-stock";
        }

        const matchesStatus =
            selectedStatus === "all" ||
            selectedStatus === status;

        return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
        const hasProducts = products.length > 0;

        container.innerHTML = `
            <div class="empty-state business-products-empty">
                <div class="empty-icon">
                    <i data-lucide="package"></i>
                </div>

                <h3>${
                    hasProducts
                        ? "No matching products"
                        : "Your inventory is empty"
                }</h3>

                <p>${
                    hasProducts
                        ? "Try another search or choose a different stock filter."
                        : "Add your first product to start managing your inventory."
                }</p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }

    container.innerHTML = filtered.map(product => {
        const stock = Math.max(0, Number(product.stock) || 0);
        const price = Math.max(0, Number(product.price) || 0);
        const inventoryValue = stock * price;

        let stockStatus = "In stock";
        let stockClass = "in-stock";
        let stockIcon = "check-circle";

        if (stock === 0) {
            stockStatus = "Out of stock";
            stockClass = "out-of-stock";
            stockIcon = "x-circle";
        } else if (stock <= 5) {
            stockStatus = "Low stock";
            stockClass = "low-stock";
            stockIcon = "alert-triangle";
        }

        return `
            <article class="item-card business-product-card">

                <div class="business-product-top">
                    <div class="business-product-icon">
                        <i data-lucide="package"></i>
                    </div>

                    <span class="business-product-status ${stockClass}">
                        <i data-lucide="${stockIcon}"></i>
                        ${stockStatus}
                    </span>
                </div>

                <div class="business-product-information">
                    <h3>${safe(product.name)}</h3>

                    <p class="business-product-label">
                        Selling price
                    </p>

                    <div class="business-product-price">
                        ${money(price)}
                    </div>
                </div>

                <div class="business-product-metrics">
                    <div class="business-product-metric">
                        <span>Quantity available</span>
                        <strong>${stock.toLocaleString()}</strong>
                    </div>

                    <div class="business-product-metric">
                        <span>Stock value</span>
                        <strong>${money(inventoryValue)}</strong>
                    </div>
                </div>

                <div class="card-actions business-product-actions">
                    <button
                        type="button"
                        onclick="openProductModal('${product.id}')"
                    >
                        <i data-lucide="pencil"></i>
                        Edit product
                    </button>

                    <button
                        type="button"
                        class="danger-btn"
                        onclick="deleteProduct('${product.id}')"
                    >
                        <i data-lucide="trash-2"></i>
                        Delete
                    </button>
                </div>

            </article>
        `;
    }).join("");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
function showPATRIODXConfirm(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");

        overlay.className = "patriodx-confirm-overlay";

        overlay.innerHTML = `
            <div
                class="patriodx-confirm-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="patriodxConfirmTitle"
                aria-describedby="patriodxConfirmMessage"
            >
                <h3 id="patriodxConfirmTitle"></h3>

                <p id="patriodxConfirmMessage"></p>

                <div class="patriodx-confirm-actions">
                    <button
                        type="button"
                        class="secondary-btn"
                        id="patriodxConfirmCancel"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        class="danger-btn"
                        id="patriodxConfirmDelete"
                    >
                        Delete
                    </button>
                </div>
            </div>
        `;

        overlay.querySelector("#patriodxConfirmTitle").textContent = title;
        overlay.querySelector("#patriodxConfirmMessage").textContent = message;

        const cancelButton = overlay.querySelector("#patriodxConfirmCancel");
        const deleteButton = overlay.querySelector("#patriodxConfirmDelete");

        let finished = false;

        function closeDialog(confirmed) {
            if (finished) return;

            finished = true;

            document.removeEventListener("keydown", handleKeydown);
            overlay.remove();

            resolve(confirmed);
        }

        function handleKeydown(event) {
            if (event.key === "Escape") {
                closeDialog(false);
            }
        }

        cancelButton.addEventListener("click", () => {
            closeDialog(false);
        });

        deleteButton.addEventListener("click", () => {
            closeDialog(true);
        });

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                closeDialog(false);
            }
        });

        document.addEventListener("keydown", handleKeydown);

        document.body.appendChild(overlay);

        cancelButton.focus();
    });
}
async function deleteProduct(id) {

    const confirmed =
    await showPATRIODXConfirm(
        "Delete Product",
        "Are you sure you want to delete this product?"
    );

if (!confirmed) {
    return;
}

    const { error } =
        await supabaseClient
            .from("products")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

      showPATRIODXToast(
    "Could not delete product.",
    "error"
);

        return;
    }

    await loadData();

    renderAll();
}


// =========================================================
// CUSTOMER MODAL
// =========================================================

function openCustomerModal() {

    const modal =
        document.getElementById(
            "customerModal"
        );

    const form =
        document.getElementById(
            "customerForm"
        );

    if (!modal || !form) return;

    form.reset();

    modal.classList.add("active");
}

function closeCustomerModal() {

    const modal =
        document.getElementById(
            "customerModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}
// =========================================================
// PATRIODX PRODUCT IMAGE PREVIEW
// =========================================================

function previewProductImage(input) {
    const file = input.files && input.files[0];

    const container = document.getElementById(
        "productImagePreviewContainer"
    );

    const preview = document.getElementById(
        "productImagePreview"
    );

    if (!container || !preview) return;

    if (!file) {
        container.style.display = "none";
        preview.removeAttribute("src");
        return;
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    ];

    if (!allowedTypes.includes(file.type)) {
        showPATRIODXToast(
            "Please choose a JPG, PNG, WEBP, or GIF image.",
            "warning"
        );

        input.value = "";
        container.style.display = "none";
        preview.removeAttribute("src");
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showPATRIODXToast(
            "Your picture must be 5 MB or smaller.",
            "warning"
        );

        input.value = "";
        container.style.display = "none";
        preview.removeAttribute("src");
        return;
    }

    preview.src = URL.createObjectURL(file);
    container.style.display = "block";
}
// =========================================================
// SAVE PRODUCT — ADD AND EDIT
// =========================================================

async function saveProduct(event) {
    event.preventDefault();

    if (!currentBusiness) {
        showPATRIODXToast(
            "Your business could not be loaded. Please try again.",
            "error"
        );
        return;
    }

    const productId =
        document.getElementById("productId").value.trim();

    // Apply creation limits only to new products.
    if (!productId && !canCreate("product")) {
        return;
    }

    const name =
        document.getElementById("productName").value.trim();

   const price =
    Number(document.getElementById("productPrice").value);

const costPriceInput =
    document.getElementById("productCostPrice");

const costPriceValue =
    costPriceInput ? costPriceInput.value.trim() : "";

const costPrice =
    costPriceValue === "" ? null : Number(costPriceValue);

const stock =
    Number(document.getElementById("productStock").value);

    if (!name) {
        showPATRIODXToast(
            "Product name is required.",
            "warning"
        );
        return;
    }

    if (
        document.getElementById("productPrice").value === "" ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        showPATRIODXToast(
            "Enter a valid product price.",
            "warning"
        );
        return;
    }
    if (
        costPriceValue !== "" &&
        (!Number.isFinite(costPrice) || costPrice < 0)
    ) {
        showPATRIODXToast(
            "Enter a valid cost price, or leave it blank if unknown.",
            "warning"
        );
        return;
    }
    if (
        document.getElementById("productStock").value === "" ||
        !Number.isInteger(stock) ||
        stock < 0
    ) {
        showPATRIODXToast(
            "Enter a valid stock quantity.",
            "warning"
        );
        return;
    }

     // =========================================================
// UPLOAD PRODUCT IMAGE TO SUPABASE STORAGE
// =========================================================

const imageFileInput = document.getElementById(
    "productImageFile"
);

const imageFile = imageFileInput?.files?.[0];

let productImageUrl = document.getElementById(
    "productImageUrl"
).value.trim() || null;

if (imageFile) {
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    ];

    if (!allowedTypes.includes(imageFile.type)) {
        showPATRIODXToast(
            "Please select a valid image file.",
            "warning"
        );
        return;
    }

    if (imageFile.size > 5 * 1024 * 1024) {
        showPATRIODXToast(
            "Your picture must be 5 MB or smaller.",
            "warning"
        );
        return;
    }

    const extension = imageFile.name
        .split(".")
        .pop()
        .toLowerCase();

    const safeExtension = [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "gif"
    ].includes(extension)
        ? extension
        : "jpg";

    const imagePath =
        `${currentBusiness.id}/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;

    showPATRIODXToast(
        "Uploading product picture...",
        "info"
    );

    const { error: uploadError } = await supabaseClient
        .storage
        .from("product-images")
        .upload(imagePath, imageFile, {
            contentType: imageFile.type,
            upsert: false
        });

    if (uploadError) {
        console.error(
            "PATRIODX product image upload error:",
            uploadError
        );

        showPATRIODXToast(
            "Picture upload failed. Please try again.",
            "error"
        );

        return;
    }

    const { data: imageData } = supabaseClient
        .storage
        .from("product-images")
        .getPublicUrl(imagePath);

    productImageUrl = imageData.publicUrl;
}

// =========================================================
// SAVE PRODUCT — EXISTING DATABASE STRUCTURE
// =========================================================

const productData = {
    business_id: currentBusiness.id,
    name,
    price,
    cost_price: costPrice,
    stock,
    description: document.getElementById("productDescription").value.trim(),
    category: document.getElementById("productCategory").value.trim(),
    image_url: productImageUrl,
    is_published: document.getElementById("productPublish").checked
};
    let query;

    if (productId) {
        // Update the existing product belonging to this business.
        query = supabaseClient
            .from("products")
            .update(productData)
            .eq("id", productId)
            .eq("business_id", currentBusiness.id);
    } else {
        // Create a new product.
        query = supabaseClient
            .from("products")
            .insert(productData);
    }

    const { error } = await query;

    if (error) {
        console.error("PATRIODX save product error:", error);

        showPATRIODXToast(
            productId
                ? "Could not update product."
                : "Could not save product.",
            "error"
        );
        return;
    }

    closeProductModal();

    await loadData();

    renderAll();

    showPATRIODXToast(
        productId
            ? "Product updated successfully."
            : "Product saved successfully.",
        "success"
    );
}


async function saveCustomer(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    if (!canCreate("customer")) {
        return;
    }

    const name =
        document.getElementById(
            "customerName"
        ).value.trim();

    const email =
        document.getElementById(
            "customerEmail"
        ).value.trim();

    const phone =
        document.getElementById(
            "customerPhone"
        ).value.trim();

    if (!name) {
showPATRIODXToast(
    "Customer name is required.",
    "warning"
);

        return;
    }

    const { error } =
        await supabaseClient
            .from("customers")
            .insert({
                business_id:
                    currentBusiness.id,
                name,
                email,
                phone
            });

    if (error) {

        console.error(error);

       showPATRIODXToast(
    "Could not save customer.",
    "error"
);

        return;
    }

    closeCustomerModal();

    await loadData();

    renderAll();
}


// =========================================================
// CUSTOMERS DISPLAY
// =========================================================

function renderCustomers() {
    const container = document.getElementById("customersList");

    if (!container) return;

    const searchInput = document.getElementById("customerSearch");

    const search = searchInput
        ? searchInput.value.toLowerCase().trim()
        : "";

    const filtered = customers.filter(customer => {
        const name = String(customer.name || "").toLowerCase();
        const email = String(customer.email || "").toLowerCase();
        const phone = String(customer.phone || "").toLowerCase();

        return (
            name.includes(search) ||
            email.includes(search) ||
            phone.includes(search)
        );
    });

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state business-customers-empty">
                <div class="business-customer-empty-icon">
                    <i data-lucide="users"></i>
                </div>

                <h3>${search ? "No matching customers" : "Your customer directory is empty"}</h3>

                <p>
                    ${
                        search
                            ? "Try searching with another name, email, or phone number."
                            : "Add your first customer to keep important business contacts organised."
                    }
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }

    container.innerHTML = filtered.map(customer => {
        const name = String(customer.name || "Customer");

        const initials = name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("") || "C";

        const email = customer.email || "";
        const phone = customer.phone || "";

        return `
            <article class="item-card business-customer-card">

                <div class="business-customer-top">
                    <div class="business-customer-avatar">
                        ${safe(initials)}
                    </div>

                    <span class="business-customer-badge">
                        <i data-lucide="user-round-check"></i>
                        Customer
                    </span>
                </div>

                <div class="business-customer-information">
                    <h3>${safe(name)}</h3>

                    <p class="business-customer-label">
                        Contact information
                    </p>

                    <div class="business-customer-contact">
                        <div class="business-customer-contact-row">
                            <i data-lucide="mail"></i>
                            <span>${safe(email || "No email provided")}</span>
                        </div>

                        <div class="business-customer-contact-row">
                            <i data-lucide="phone"></i>
                            <span>${safe(phone || "No phone provided")}</span>
                        </div>
                    </div>
                </div>

                <div class="business-customer-footer">
                    <div>
                        <span>Customer since</span>
                        <strong>${safe(formatDate(customer.created_at))}</strong>
                    </div>

                    <button
                        type="button"
                        class="danger-btn business-customer-delete"
                        onclick="deleteCustomer('${customer.id}')"
                        aria-label="Delete ${safe(name)}"
                        title="Delete customer"
                    >
                        <i data-lucide="trash-2"></i>
                        Delete
                    </button>
                </div>

            </article>
        `;
    }).join("");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
async function deleteCustomer(id) {

  const confirmed =
    await showPATRIODXConfirm(
        "Delete Customer",
        "Are you sure you want to delete this customer?"
    );

if (!confirmed) {
    return;
}

    const { error } =
        await supabaseClient
            .from("customers")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

       showPATRIODXToast(
    "Could not delete customer.",
    "error"
);

        return;
    }

    await loadData();

    renderAll();
}


// =========================================================
// SALE MODAL
// =========================================================

function openSaleModal() {

    const modal =
        document.getElementById(
            "saleModal"
        );

    const select =
        document.getElementById(
            "saleProduct"
        );

    if (!modal || !select) return;

    select.innerHTML = `
        <option value="">
            Select a product
        </option>
    `;

    products.forEach(product => {

        select.innerHTML += `
            <option value="${product.id}">
                ${safe(product.name)}
                —
                ${money(product.price)}
                —
                Stock: ${product.stock}
            </option>
        `;
    });

    document.getElementById(
        "saleQuantity"
    ).value = 1;

    updateSaleTotal();

    modal.classList.add("active");
}

function closeSaleModal() {

    const modal =
        document.getElementById(
            "saleModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}

function updateSaleTotal() {

    const productId =
        document.getElementById(
            "saleProduct"
        )?.value;

    const quantity =
        Number(
            document.getElementById(
                "saleQuantity"
            )?.value || 0
        );

    const product =
        products.find(
            p => p.id === productId
        );

    const total =
        product
            ? Number(product.price) *
              quantity
            : 0;

    const display =
        document.getElementById(
            "saleTotal"
        );

    if (display) {
        display.textContent =
            money(total);
    }
}

async function saveSale(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    if (!canCreate("sale")) {
        return;
    }

    const productId =
        document.getElementById(
            "saleProduct"
        ).value;

    const quantity =
        Number(
            document.getElementById(
                "saleQuantity"
            ).value
        );

    const product =
        products.find(
            p => p.id === productId
        );

   if (!product) {

    showPATRIODXToast(
        "Please select a product.",
        "warning"
    );

    return;
}

if (quantity <= 0) {

    showPATRIODXToast(
        "Quantity must be at least 1.",
        "warning"
    );

    return;
}

if (quantity > product.stock) {

    showPATRIODXToast(
        "Not enough stock.",
        "warning"
    );

    return;
}

    const total =
        Number(product.price) *
        quantity;

    const {
        data: sale,
        error: saleError
    } =
        await supabaseClient
            .from("sales")
                       .insert({
                business_id:
                    currentBusiness.id,

                product_id:
                    product.id,

                product_name:
                    product.name,

                quantity,

                total,

                unit_cost:
                    product.cost_price == null
                        ? null
                        : Number(product.cost_price)
            })
            .select()
            .single();

    if (saleError) {

        console.error(saleError);

      showPATRIODXToast(
    "Could not record sale.",
    "error"
);
        return;
    }

    const { error: stockError } =
        await supabaseClient
            .from("products")
            .update({
                stock:
                    product.stock -
                    quantity,

                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                product.id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (stockError) {

        console.error(stockError);

        await supabaseClient
            .from("sales")
            .delete()
            .eq(
                "id",
                sale.id
            );

     showPATRIODXToast(
    "Sale could not update stock.",
    "error"
);
        return;
    }

    closeSaleModal();

    await loadData();

    renderAll();
}


// =========================================================
// SALES DISPLAY — PATRIODX ORDER MANAGEMENT
// =========================================================

function renderSales() {
    const container = document.getElementById("salesList");

    if (!container) return;

    const searchInput = document.getElementById("salesSearch");
    const search = searchInput
        ? searchInput.value.toLowerCase().trim()
        : "";

    const filtered = sales.filter(sale => {
        const productName = String(sale.product_name || "").toLowerCase();
        const quantity = String(sale.quantity ?? "");
        const date = formatDate(sale.created_at).toLowerCase();
        const total = money(sale.total).toLowerCase();

        return (
            productName.includes(search) ||
            quantity.includes(search) ||
            date.includes(search) ||
            total.includes(search)
        );
    });

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state business-sales-empty">
                <div class="business-sales-empty-icon">
                    <i data-lucide="shopping-bag"></i>
                </div>

                <h3>${search ? "No matching sales" : "No sales recorded yet"}</h3>

                <p>
                    ${
                        search
                            ? "Try searching by product, quantity, date, or total."
                            : "Your completed sales will appear here when you record your first transaction."
                    }
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }

    container.innerHTML = filtered.map(sale => {
        const productName = String(sale.product_name || "Product");
        const quantity = Math.max(0, Number(sale.quantity) || 0);
        const total = Math.max(0, Number(sale.total) || 0);

        return `
            <article class="sale-card business-sale-card">

                <div class="business-sale-product">
                    <div class="business-sale-product-icon">
                        <i data-lucide="package-check"></i>
                    </div>

                    <div class="business-sale-product-info">
                        <span class="business-sale-reference">
                            SALES RECORD
                        </span>

                        <h3>${safe(productName)}</h3>

                        <div class="business-sale-date">
                            <i data-lucide="calendar-days"></i>
                            <span>${safe(formatDate(sale.created_at))}</span>
                        </div>
                    </div>
                </div>

                <div class="business-sale-quantity">
                    <span>Quantity sold</span>
                    <strong>${quantity.toLocaleString()}</strong>
                </div>

                <div class="business-sale-total">
                    <span>Sale total</span>
                    <strong>${money(total)}</strong>
                </div>

                <div class="business-sale-actions">
                    <button
                        type="button"
                        class="danger-btn"
                        onclick="deleteSale('${sale.id}')"
                        aria-label="Delete sale for ${safe(productName)}"
                        title="Delete sale"
                    >
                        <i data-lucide="trash-2"></i>
                        Delete
                    </button>
                </div>

            </article>
        `;
    }).join("");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

async function deleteSale(id) {

    const sale =
        sales.find(
            s => s.id === id
        );

    if (!sale) return;

  const confirmed =
    await showPATRIODXConfirm(
        "Delete Sale",
        "Are you sure you want to delete this sale?"
    );

if (!confirmed) {
    return;
}

    const { error } =
        await supabaseClient
            .from("sales")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

     showPATRIODXToast(
    "Could not delete sale.",
    "error"
);
        return;
    }

    if (sale.product_id) {

        const product =
            products.find(
                p => p.id === sale.product_id
            );

        if (product) {

            await supabaseClient
                .from("products")
                .update({
                    stock:
                        Number(product.stock) +
                        Number(sale.quantity),

                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    product.id
                )
                .eq(
                    "business_id",
                    currentBusiness.id
                );
        }
    }

    await loadData();

    renderAll();
}


// =========================================================
// INVOICE MODAL
// =========================================================

function openInvoiceModal() {

    const modal =
        document.getElementById(
            "invoiceModal"
        );

    if (!modal) return;

    const customerSelect =
        document.getElementById(
            "invoiceCustomer"
        );

    const productSelect =
        document.getElementById(
            "invoiceProduct"
        );

    customerSelect.innerHTML = `
        <option value="">
            Select a customer
        </option>
    `;

    customers.forEach(customer => {

        customerSelect.innerHTML += `
            <option value="${customer.id}">
                ${safe(customer.name)}
            </option>
        `;
    });

    productSelect.innerHTML = `
        <option value="">
            Select a product
        </option>
    `;

    products.forEach(product => {

        productSelect.innerHTML += `
            <option value="${product.id}">
                ${safe(product.name)}
                —
                ${money(product.price)}
            </option>
        `;
    });

    document.getElementById(
        "invoiceNumber"
    ).value =
        createReference();

    document.getElementById(
        "invoiceDueDate"
    ).value =
        todayString();

    document.getElementById(
        "invoiceQuantity"
    ).value = 1;

    document.getElementById(
        "invoiceDiscount"
    ).value = 0;

    document.getElementById(
        "invoiceTax"
    ).value = 0;

    updateInvoiceTotal();

    modal.classList.add("active");
}

function closeInvoiceModal() {

    const modal =
        document.getElementById(
            "invoiceModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}

function updateInvoiceTotal() {

    const productId =
        document.getElementById(
            "invoiceProduct"
        )?.value;

    const quantity =
        Number(
            document.getElementById(
                "invoiceQuantity"
            )?.value || 0
        );

    const discount =
        Number(
            document.getElementById(
                "invoiceDiscount"
            )?.value || 0
        );

    const taxRate =
        Number(
            document.getElementById(
                "invoiceTax"
            )?.value || 0
        );

    const product =
        products.find(
            p => p.id === productId
        );

    const subtotal =
        product
            ? Number(product.price) *
              quantity
            : 0;

    const afterDiscount =
        Math.max(
            0,
            subtotal - discount
        );

    const tax =
        afterDiscount *
        (taxRate / 100);

    const total =
        afterDiscount + tax;

    document.getElementById(
        "invoiceSubtotal"
    ).textContent =
        money(subtotal);

    document.getElementById(
        "invoiceDiscountDisplay"
    ).textContent =
        "-" + money(discount);

    document.getElementById(
        "invoiceTaxDisplay"
    ).textContent =
        money(tax);

    document.getElementById(
        "invoiceTotal"
    ).textContent =
        money(total);
}

async function saveInvoice(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    if (!canCreate("invoice")) {
        return;
    }

    const invoiceNumber =
        document.getElementById(
            "invoiceNumber"
        ).value;

    const customerId =
        document.getElementById(
            "invoiceCustomer"
        ).value;

    const productId =
        document.getElementById(
            "invoiceProduct"
        ).value;

    const quantity =
        Number(
            document.getElementById(
                "invoiceQuantity"
            ).value
        );

    const dueDate =
        document.getElementById(
            "invoiceDueDate"
        ).value;

    const discount =
        Number(
            document.getElementById(
                "invoiceDiscount"
            ).value || 0
        );

    const taxRate =
        Number(
            document.getElementById(
                "invoiceTax"
            ).value || 0
        );

    const customer =
        customers.find(
            c => c.id === customerId
        );

    const product =
        products.find(
            p => p.id === productId
        );

    if (!customer || !product) {

      showPATRIODXToast(
    "Please select a customer and product.",
    "warning"
);

        return;
    }

    const subtotal =
        Number(product.price) *
        quantity;

    const afterDiscount =
        Math.max(
            0,
            subtotal - discount
        );

    const tax =
        afterDiscount *
        (taxRate / 100);

    const total =
        afterDiscount + tax;

    const { error } =
        await supabaseClient
            .from("invoices")
            .insert({

                business_id:
                    currentBusiness.id,

                invoice_number:
                    invoiceNumber,

                customer_id:
                    customer.id,

                customer_name:
                    customer.name,

                product_id:
                    product.id,

                product_name:
                    product.name,

                quantity,

                subtotal,

                discount,

                tax_rate:
                    taxRate,

                tax,

                total,

                due_date:
                    dueDate,

                status:
                    "unpaid"
            });

    if (error) {

        console.error(error);

    showPATRIODXToast(
    "Could not create invoice.",
    "error"
);

        return;
    }

    closeInvoiceModal();

    await loadData();

    renderAll();
}

// =========================================================
// PATRIODX — INVOICE FINANCIAL OVERVIEW
// =========================================================

function renderInvoiceSummary() {
    const summaryElements = {
        total: document.getElementById("invoiceSummaryTotal"),
        paid: document.getElementById("invoiceSummaryPaid"),
        outstanding: document.getElementById("invoiceSummaryOutstanding"),
        overdue: document.getElementById("invoiceSummaryOverdue"),
        paidCount: document.getElementById("invoiceSummaryPaidCount"),
        outstandingCount: document.getElementById("invoiceSummaryOutstandingCount"),
        overdueCount: document.getElementById("invoiceSummaryOverdueCount")
    };

    // Do nothing if the summary HTML is not on this page.
    if (!summaryElements.total) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totals = {
        total: 0,
        paid: 0,
        outstanding: 0,
        overdue: 0,
        paidCount: 0,
        outstandingCount: 0,
        overdueCount: 0
    };

    invoices.forEach(invoice => {
        const amount = Math.max(0, Number(invoice.total) || 0);
        const isPaid = invoice.status === "paid";

        const dueDate = invoice.due_date
            ? new Date(`${String(invoice.due_date).slice(0, 10)}T00:00:00`)
            : null;

        const validDueDate =
            dueDate && !Number.isNaN(dueDate.getTime());

        const isOverdue =
            !isPaid &&
            validDueDate &&
            dueDate < today;

        totals.total += amount;

        if (isPaid) {
            totals.paid += amount;
            totals.paidCount++;
        } else {
            totals.outstanding += amount;
            totals.outstandingCount++;

            if (isOverdue) {
                totals.overdue += amount;
                totals.overdueCount++;
            }
        }
    });

    summaryElements.total.textContent = money(totals.total);
    summaryElements.paid.textContent = money(totals.paid);
    summaryElements.outstanding.textContent = money(totals.outstanding);
    summaryElements.overdue.textContent = money(totals.overdue);

    summaryElements.paidCount.textContent =
        `${totals.paidCount} paid invoice${totals.paidCount === 1 ? "" : "s"}`;

    summaryElements.outstandingCount.textContent =
        `${totals.outstandingCount} unpaid invoice${totals.outstandingCount === 1 ? "" : "s"}`;

    summaryElements.overdueCount.textContent =
        `${totals.overdueCount} overdue invoice${totals.overdueCount === 1 ? "" : "s"}`;
}
// =========================================================
// PATRIODX — INVOICE MANAGEMENT DISPLAY
// =========================================================

function renderInvoices() {
    const container = document.getElementById("invoicesList");

    if (!container) return;
renderInvoiceSummary();
    const searchInput = document.getElementById("invoiceSearch");
    const statusFilter = document.getElementById("invoiceStatusFilter");

    const search = searchInput
        ? searchInput.value.toLowerCase().trim()
        : "";

    const status = statusFilter
        ? statusFilter.value
        : "all";

    const filtered = invoices.filter(invoice => {
        const invoiceNumber = String(
            invoice.invoice_number || ""
        ).toLowerCase();

        const customerName = String(
            invoice.customer_name || ""
        ).toLowerCase();

        const productName = String(
            invoice.product_name || ""
        ).toLowerCase();

        const dueDate = formatDate(invoice.due_date).toLowerCase();

        const matchesSearch = [
            invoiceNumber,
            customerName,
            productName,
            dueDate
        ].some(value => value.includes(search));

        const matchesStatus =
            status === "all" || invoice.status === status;

        return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
        const hasInvoices = invoices.length > 0;

        container.innerHTML = `
            <div class="empty-state business-invoices-empty">
                <div class="business-invoice-empty-icon">
                    <i data-lucide="receipt"></i>
                </div>

                <h3>${
                    hasInvoices
                        ? "No matching invoices"
                        : "No invoices created yet"
                }</h3>

                <p>${
                    hasInvoices
                        ? "Try changing your search or payment-status filter."
                        : "Create an invoice to start tracking customer payments."
                }</p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }

    container.innerHTML = filtered.map(invoice => {
        const isPaid = invoice.status === "paid";

        const dueDate = invoice.due_date
            ? new Date(invoice.due_date)
            : null;

        const validDueDate = dueDate &&
            !Number.isNaN(dueDate.getTime());

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdue =
            !isPaid &&
            validDueDate &&
            dueDate < today;

        const statusLabel = isPaid
            ? "Paid"
            : overdue
                ? "Overdue"
                : "Unpaid";

        const statusClass = isPaid
            ? "paid"
            : overdue
                ? "overdue"
                : "unpaid";

        const statusIcon = isPaid
            ? "circle-check"
            : overdue
                ? "alert-circle"
                : "clock-3";

        const invoiceNumber = safe(
            invoice.invoice_number || "Invoice"
        );

        const customerName = safe(
            invoice.customer_name || "Customer"
        );

        const productName = safe(
            invoice.product_name || "Product"
        );

        return `
            <article class="invoice-card business-invoice-card">

                <div class="business-invoice-main">

                    <div class="business-invoice-icon">
                        <i data-lucide="receipt-text"></i>
                    </div>

                    <div class="business-invoice-details">

                        <div class="business-invoice-reference">
                            <span>INVOICE</span>
                            <strong>${invoiceNumber}</strong>
                        </div>

                        <h3>${customerName}</h3>

                        <p class="business-invoice-product">
                            <i data-lucide="package"></i>
                            ${productName}
                            <span>·</span>
                            Qty: ${Math.max(
                                0,
                                Number(invoice.quantity) || 0
                            ).toLocaleString()}
                        </p>

                        <p class="business-invoice-due">
                            <i data-lucide="calendar-days"></i>
                            Due: ${safe(formatDate(invoice.due_date))}
                        </p>

                    </div>
                </div>

                <div class="business-invoice-payment">

                    <span class="business-invoice-status ${statusClass}">
                        <i data-lucide="${statusIcon}"></i>
                        ${statusLabel}
                    </span>

                    <span class="business-invoice-total-label">
                        Invoice total
                    </span>

                    <strong class="business-invoice-total">
                        ${money(invoice.total)}
                    </strong>

                </div>

                <div class="business-invoice-actions">

                    <button
                        type="button"
                        class="business-invoice-view"
                        onclick="viewInvoice('${invoice.id}')"
                    >
                        <i data-lucide="eye"></i>
                        View
                    </button>

                    <button
                        type="button"
                        class="business-invoice-toggle"
                        onclick="toggleInvoiceStatus('${invoice.id}')"
                    >
                        <i data-lucide="${isPaid ? "rotate-ccw" : "check"}"></i>
                        Mark ${isPaid ? "Unpaid" : "Paid"}
                    </button>

                    <button
                        type="button"
                        class="danger-btn business-invoice-delete"
                        onclick="deleteInvoice('${invoice.id}')"
                    >
                        <i data-lucide="trash-2"></i>
                        Delete
                    </button>

                </div>

            </article>
        `;
    }).join("");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

async function toggleInvoiceStatus(id) {

    const invoice =
        invoices.find(
            i => i.id === id
        );

    if (!invoice) return;

    const newStatus =
        invoice.status === "paid"
            ? "unpaid"
            : "paid";

    const { error } =
        await supabaseClient
            .from("invoices")
            .update({
                status: newStatus
            })
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

       showPATRIODXToast(
    "Could not update invoice.",
    "error"
);
        return;
    }

    await loadData();

    renderAll();
}

async function deleteInvoice(id) {

  const confirmed =
    await showPATRIODXConfirm(
        "Delete Invoice",
        "Are you sure you want to delete this invoice?"
    );

if (!confirmed) {
    return;
}
    const { error } =
        await supabaseClient
            .from("invoices")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

       showPATRIODXToast(
    "Could not delete invoice.",
    "error"
);
        return;
    }

    await loadData();

    renderAll();
}

function viewInvoice(id) {

    const invoice =
        invoices.find(
            i => i.id === id
        );

    if (!invoice) return;

    const modal =
        document.getElementById(
            "invoiceViewModal"
        );

    const content =
        document.getElementById(
            "invoiceViewContent"
        );

    content.innerHTML = `

        <div class="invoice-view">

            <p class="eyebrow">
                PATRIODX INVOICE
            </p>

            <h2>
                ${safe(
                    invoice.invoice_number
                )}
            </h2>

            <hr>

            <p>
                <strong>Customer:</strong>
                ${safe(
                    invoice.customer_name
                )}
            </p>

            <p>
                <strong>Product:</strong>
                ${safe(
                    invoice.product_name
                )}
            </p>

            <p>
                <strong>Quantity:</strong>
                ${invoice.quantity}
            </p>

            <p>
                <strong>Due Date:</strong>
                ${formatDate(
                    invoice.due_date
                )}
            </p>

            <hr>

            <p>
                Subtotal:
                ${money(invoice.subtotal)}
            </p>

            <p>
                Discount:
                -${money(invoice.discount)}
            </p>

            <p>
                Tax:
                ${money(invoice.tax)}
            </p>

            <h2>
                Total:
                ${money(invoice.total)}
            </h2>

            <p>
                Status:
                ${
                    invoice.status === "paid"
    ? '<i data-lucide="circle-check"></i> Paid'
    : '<i data-lucide="clock-3"></i> Unpaid'
                }
            </p>

        </div>
    `;

    modal.classList.add("active");
}

function closeInvoiceViewModal() {

    const modal =
        document.getElementById(
            "invoiceViewModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}


// =========================================================
// STATS
// =========================================================

function renderStats() {

    const totalRevenue =
        sales.reduce(
            (sum, sale) =>
                sum +
                Number(sale.total || 0),
            0
        );

    const today =
        todayString();

    const todayRevenue =
        sales
            .filter(sale =>
                sale.created_at &&
                sale.created_at.startsWith(
                    today
                )
            )
            .reduce(
                (sum, sale) =>
                    sum +
                    Number(
                        sale.total || 0
                    ),
                0
            );

    document.getElementById(
        "totalRevenue"
    ).textContent =
        money(totalRevenue);

    document.getElementById(
        "todayRevenue"
    ).textContent =
        money(todayRevenue);

    document.getElementById(
        "totalProducts"
    ).textContent =
        products.length;

    document.getElementById(
        "totalCustomers"
    ).textContent =
        customers.length;

    document.getElementById(
        "totalSales"
    ).textContent =
        sales.length;

    document.getElementById(
        "paidInvoices"
    ).textContent =
        invoices.filter(
            i => i.status === "paid"
        ).length;

    document.getElementById(
        "unpaidInvoices"
    ).textContent =
        invoices.filter(
            i => i.status !== "paid"
        ).length;

    document.getElementById(
        "lowStockProducts"
    ).textContent =
        products.filter(
            p => Number(p.stock) <= 5
        ).length;
}


// =========================================================
// ANALYTICS
// =========================================================

function renderAnalytics() {

    const totalRevenue =
        sales.reduce(
            (sum, sale) =>
                sum +
                Number(sale.total || 0),
            0
        );

    const totalUnits =
        sales.reduce(
            (sum, sale) =>
                sum +
                Number(
                    sale.quantity || 0
                ),
            0
        );

    const average =
        sales.length
            ? totalRevenue /
              sales.length
            : 0;

    const inventoryValue =
        products.reduce(
            (sum, product) =>
                sum +
                Number(
                    product.price || 0
                ) *
                Number(
                    product.stock || 0
                ),
            0
        );

    const largest =
        sales.length
            ? Math.max(
                ...sales.map(
                    s =>
                        Number(
                            s.total || 0
                        )
                )
            )
            : 0;

    document.getElementById(
        "averageSale"
    ).textContent =
        money(average);

    document.getElementById(
        "unitsInStock"
    ).textContent =
        products.reduce(
            (sum, product) =>
                sum +
                Number(
                    product.stock || 0
                ),
            0
        );

    document.getElementById(
        "inventoryValue"
    ).textContent =
        money(inventoryValue);

    document.getElementById(
        "overviewRevenue"
    ).textContent =
        money(totalRevenue);

    document.getElementById(
        "unitsSold"
    ).textContent =
        totalUnits;

    document.getElementById(
        "overviewAverage"
    ).textContent =
        money(average);

    document.getElementById(
        "largestSale"
    ).textContent =
        money(largest);


    // BEST SELLER

    const productSales = {};

    sales.forEach(sale => {

        const name =
            sale.product_name ||
            "Unknown";

        productSales[name] =
            (
                productSales[name] ||
                0
            ) +
            Number(
                sale.quantity || 0
            );
    });

    let bestSeller = "—";

    Object.keys(
        productSales
    ).forEach(name => {

        if (
            bestSeller === "—" ||
            productSales[name] >
            productSales[bestSeller]
        ) {

            bestSeller =
                name;
        }
    });

    document.getElementById(
        "bestSeller"
    ).textContent =
        bestSeller;


    // TOP PRODUCTS

    const topProducts =
        Object.entries(
            productSales
        )
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(0, 5);

    const topContainer =
        document.getElementById(
            "topProducts"
        );

    if (topContainer) {

        if (!topProducts.length) {

            topContainer.innerHTML =
                `<div class="empty-state">No sales yet.</div>`;

        } else {

            topContainer.innerHTML =
                topProducts
                    .map(
                        ([name, quantity]) => `
                            <div class="overview-row">
                                <span>
                                    ${safe(name)}
                                </span>

                                <strong>
                                    ${quantity} sold
                                </strong>
                            </div>
                        `
                    )
                    .join("");
        }
    }


    // INVENTORY ALERTS

    const alertContainer =
        document.getElementById(
            "inventoryAlerts"
        );

    if (alertContainer) {

        const lowStock =
            products.filter(
                p => Number(p.stock) <= 5
            );

        if (!lowStock.length) {

            alertContainer.innerHTML = `
                <div class="success-message">
                  '<i data-lucide="circle-check"></i> All products have healthy stock levels.'
                </div>
            `;

        } else {

            alertContainer.innerHTML =
                lowStock
                    .map(
                        product => `
                            <div class="overview-row">
                                <span>
                                    ${safe(product.name)}
                                </span>

                                <strong>
                                    ${product.stock} left
                                </strong>
                            </div>
                        `
                    )
                    .join("");
        }
    }


   // =====================================================
// REVENUE TREND — DAILY SALES ANALYTICS
// =====================================================

const chart = document.getElementById("revenueChart");

if (!chart) return;

const periodFilter = document.getElementById("revenuePeriodFilter");
const selectedPeriod = periodFilter ? periodFilter.value : "30";

const validSales = sales.filter(sale => {
    if (!sale.created_at) return false;

    const amount = Number(sale.total);

    return Number.isFinite(amount) && amount >= 0;
});

if (!validSales.length) {
    chart.innerHTML = `
        <div class="empty-chart business-chart-empty">
            <i data-lucide="chart-no-axes-combined"></i>
            <h4>Your revenue trend will appear here</h4>
            <p>Record sales to see how your revenue changes over time.</p>
        </div>
    `;

    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
}

const dailyRevenue = new Map();

validSales.forEach(sale => {
    const dateKey = String(sale.created_at).slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;

    dailyRevenue.set(
        dateKey,
        (dailyRevenue.get(dateKey) || 0) + Number(sale.total)
    );
});

const today = todayString();

let startDate = null;

if (selectedPeriod !== "all") {
    const days = Number(selectedPeriod);
    const start = new Date(`${today}T12:00:00`);

    start.setDate(start.getDate() - days + 1);

    startDate = [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, "0"),
        String(start.getDate()).padStart(2, "0")
    ].join("-");
}

let dates = Array.from(dailyRevenue.keys())
    .filter(date => date <= today)
    .filter(date => !startDate || date >= startDate)
    .sort();

if (selectedPeriod !== "all") {
    const days = Number(selectedPeriod);
    const start = new Date(`${today}T12:00:00`);

    start.setDate(start.getDate() - days + 1);

    const cursor = new Date(start);
    dates = [];

    for (let i = 0; i < days; i++) {
        const key = [
            cursor.getFullYear(),
            String(cursor.getMonth() + 1).padStart(2, "0"),
            String(cursor.getDate()).padStart(2, "0")
        ].join("-");

        dates.push(key);
        cursor.setDate(cursor.getDate() + 1);
    }
}

const chartValues = dates.map(date => ({
    date,
    revenue: dailyRevenue.get(date) || 0
}));

const totalPeriodRevenue = chartValues.reduce(
    (sum, item) => sum + item.revenue,
    0
);

const maxRevenue = Math.max(
    ...chartValues.map(item => item.revenue),
    1
);

const chartBars = chartValues.map(item => {
    const height = item.revenue > 0
        ? Math.max(4, (item.revenue / maxRevenue) * 100)
        : 0;

    const date = new Date(`${item.date}T12:00:00`);

    const label = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
    });

    return `
        <div class="business-revenue-column">

            <div class="business-revenue-value">
                ${money(item.revenue)}
            </div>

            <div class="business-revenue-bar-area">
                <div
                    class="business-revenue-bar"
                    style="height: ${height}%"
                    title="${safe(label)} · ${money(item.revenue)}"
                    aria-label="${safe(label)} revenue: ${money(item.revenue)}"
                ></div>
            </div>

            <div class="business-revenue-date">
                ${safe(label)}
            </div>

        </div>
    `;
}).join("");

chart.innerHTML = `
    <div class="business-revenue-summary">
        <div>
            <span>Revenue in selected period</span>
            <strong>${money(totalPeriodRevenue)}</strong>
        </div>

        <div>
            <span>Days displayed</span>
            <strong>${chartValues.length}</strong>
        </div>
    </div>

    <div class="business-revenue-chart">
        ${chartBars}
    </div>

    <p class="business-revenue-note">
        Revenue is grouped by calendar day. Days without recorded sales
        appear as zero. The chart uses your existing sales records.
    </p>
`;

if (typeof lucide !== "undefined") {
    lucide.createIcons();
}
}
// =====================================================
// RECENT ACTIVITY — BUSINESS DASHBOARD
// =====================================================

function renderRecentActivity() {
    const container = document.getElementById("recentActivity");

    if (!container) return;

    const activity = [
        ...sales.map(sale => ({
            type: "Sale",
            icon: "shopping-cart",
            title: sale.product_name || "Product sale",
            amount: Number(sale.total) || 0,
            date: sale.created_at
        })),

        ...invoices.map(invoice => ({
            type: "Invoice",
            icon: "receipt",
            title: invoice.invoice_number || "Invoice",
            amount: Number(invoice.total) || 0,
            date: invoice.created_at
        }))
    ]
        .filter(item =>
            item.date && !Number.isNaN(new Date(item.date).getTime())
        )
        .sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        )
        .slice(0, 8);

    if (!activity.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i data-lucide="activity"></i>
                </div>

                <h3>No recent activity</h3>

                <p>
                    Your latest sales and invoices will appear here.
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }

    container.innerHTML = activity.map(item => {
        const dateLabel = formatDate(item.date);

        return `
            <div class="activity-item business-activity-item">

                <div class="business-activity-icon ${item.type.toLowerCase()}">
                    <i data-lucide="${item.icon}"></i>
                </div>

                <div class="business-activity-details">
                    <span class="business-activity-type">
                        ${safe(item.type)}
                    </span>

                    <strong>
                        ${safe(item.title)}
                    </strong>

                    <small>
                        ${safe(String(dateLabel))}
                    </small>
                </div>

                <div class="business-activity-amount">
                    <strong>
                        ${money(item.amount)}
                    </strong>
                </div>

            </div>
        `;
    }).join("");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
// =========================================================
// GO LIVE
// =========================================================

function openGoLiveModal() {

    const modal =
        document.getElementById("goLiveModal");

   if (!modal) {
    showPATRIODXToast(
        "Live settings are unavailable right now.",
        "error"
    );
    return;
}

    const titleInput =
        document.getElementById("liveTitleInput");

    const privacySelect =
        document.getElementById("livePrivacySelect");

    const message =
        document.getElementById("goLiveMessage");

    if (titleInput) {
        titleInput.value = "";
    }

    if (privacySelect) {
        privacySelect.value = "everyone";
    }

    if (message) {
        message.textContent = "";
        message.style.display = "none";
    }

    modal.style.display = "flex";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    setTimeout(() => {
        titleInput?.focus();
    }, 100);
}


function closeGoLiveModal() {

    const modal =
        document.getElementById("goLiveModal");

    if (!modal) {
        return;
    }

    modal.style.display = "none";
}
async function startPATRIODXLive() {

    const titleInput =
        document.getElementById("liveTitleInput");

    const privacySelect =
        document.getElementById("livePrivacySelect");

    const message =
        document.getElementById("goLiveMessage");

    const button =
        document.getElementById("startLiveButton");

    const title =
        titleInput?.value.trim() || "";

    const privacy =
        privacySelect?.value || "everyone";


    if (!title) {

        if (message) {
            message.textContent =
                "Please enter a title for your live.";
            message.className =
                "go-live-message error";
            message.style.display = "block";
        }

        titleInput?.focus();

        return;
    }


    button.disabled = true;

    button.innerHTML =
        '<i data-lucide="loader-circle"></i> Starting...';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }


    try {

        /*
         * Actual video streaming will be connected
         * in the next stage.
         */

        await new Promise(resolve =>
            setTimeout(resolve, 800)
        );


        if (message) {
            message.textContent =
                "Live setup is ready. Streaming will be connected next.";
            message.className =
                "go-live-message success";
            message.style.display = "block";
        }


        button.innerHTML =
            '<i data-lucide="radio"></i> Start Live';

        button.disabled = false;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

    } catch (error) {

        console.error(
            "Go Live error:",
            error
        );

        if (message) {
            message.textContent =
                "Could not start live.";
            message.className =
                "go-live-message error";
            message.style.display = "block";
        }

        button.disabled = false;

        button.innerHTML =
            '<i data-lucide="radio"></i> Start Live';

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// =========================================================
// CHANGE PASSWORD
// =========================================================
// =========================================================
// CHANGE PASSWORD
// =========================================================

function changePassword() {

    const modal = document.getElementById("changePasswordModal");

   if (!modal) {
    showPATRIODXToast(
        "Password settings are unavailable right now.",
        "error"
    );
    return;
}

    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";

    const message = document.getElementById("changePasswordMessage");

    if (message) {
        message.textContent = "";
        message.style.display = "none";
    }

    modal.style.display = "flex";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    setTimeout(() => {
        document.getElementById("newPassword")?.focus();
    }, 100);
}


function closeChangePasswordModal() {

    const modal = document.getElementById("changePasswordModal");

    if (!modal) {
        return;
    }

    modal.style.display = "none";
}


function togglePasswordVisibility(inputId, button) {

    const input = document.getElementById(inputId);

    if (!input) {
        return;
    }

    const showing = input.type === "password";

    input.type = showing ? "text" : "password";

    button.innerHTML = showing
        ? '<i data-lucide="eye-off"></i>'
        : '<i data-lucide="eye"></i>';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}


async function updatePATRIODXPassword() {

    const newPassword =
        document.getElementById("newPassword")?.value || "";

    const confirmPassword =
        document.getElementById("confirmPassword")?.value || "";

    const message =
        document.getElementById("changePasswordMessage");

    const button =
        document.getElementById("updatePasswordButton");


    function showMessage(text, type) {

        if (!message) {
            return;
        }

        message.textContent = text;
        message.className =
            "password-modal-message " + type;

        message.style.display = "block";
    }


    if (!currentUser) {

        showMessage(
            "Please sign in again.",
            "error"
        );

        return;
    }


    if (newPassword.length < 8) {

        showMessage(
            "Password must be at least 8 characters.",
            "error"
        );

        return;
    }


    if (newPassword !== confirmPassword) {

        showMessage(
            "Passwords do not match.",
            "error"
        );

        return;
    }


    button.disabled = true;

    button.innerHTML =
        '<i data-lucide="loader-circle"></i> Updating...';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }


    const { error } =
        await supabaseClient.auth.updateUser({
            password: newPassword
        });


    if (error) {

        console.error(
            "Password update error:",
            error
        );

        showMessage(
            error.message ||
            "Could not update your password.",
            "error"
        );

        button.disabled = false;

        button.innerHTML =
            '<i data-lucide="shield-check"></i> Update Password';

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    showMessage(
        "Password updated successfully.",
        "success"
    );


    button.innerHTML =
        '<i data-lucide="check"></i> Password Updated';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }


    setTimeout(() => {

        closeChangePasswordModal();

    }, 1500);
}
// =========================================================
// DELETE ACCOUNT
// =========================================================

async function deleteAccount() {

   showPATRIODXToast(
    "Account deletion requires a secure server-side process. Your account has not been deleted.",
    "error"
);
}

// =========================================================
// SEARCH
// =========================================================

function setupSearch() {

    document
        .getElementById(
            "productSearch"
        )
        ?.addEventListener(
            "input",
            renderProducts
        );

    document
        .getElementById(
            "customerSearch"
        )
        ?.addEventListener(
            "input",
            renderCustomers
        );

    document
        .getElementById(
            "salesSearch"
        )
        ?.addEventListener(
            "input",
            renderSales
        );

    document
        .getElementById(
            "invoiceSearch"
        )
        ?.addEventListener(
            "input",
            renderInvoices
        );

    document
        .getElementById(
            "invoiceStatusFilter"
        )
        ?.addEventListener(
            "change",
            renderInvoices
        );
}


// =========================================================
// MODAL CLOSE
// =========================================================

function setupModalBehavior() {

    document
        .querySelectorAll(".modal")
        .forEach(modal => {

            modal.addEventListener(
                "click",
                function(event) {

                    if (
                        event.target === modal
                    ) {

                        modal.classList.remove(
                            "active"
                        );
                    }
                }
            );
        });
}

function openAddStoryModal() {
    const modal = document.getElementById("addStoryModal");

    if (!modal) {
        console.error("Add Story modal not found.");
        return;
    }

    modal.style.display = "flex";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function closeAddStoryModal() {
    const modal = document.getElementById("addStoryModal");

    if (!modal) return;

    modal.style.display = "none";
}
// =========================================================
// CONTACT
// =========================================================

function sendContactMessage(event) {

    event.preventDefault();

    const name =
        document.getElementById(
            "contactName"
        ).value.trim();

    const email =
        document.getElementById(
            "contactEmail"
        ).value.trim();

    const subject =
        document.getElementById(
            "contactSubject"
        ).value.trim();

    const message =
        document.getElementById(
            "contactMessage"
        ).value.trim();

    const body =
        `Name: ${name}\nEmail: ${email}\n\n${message}`;

    window.location.href =
        `mailto:patriodx@gmail.com?subject=${encodeURIComponent(
            subject
        )}&body=${encodeURIComponent(
            body
        )}`;
}


// =========================================================
// BACKUP
// =========================================================

async function exportBusinessData() {

    const data = {

        business:
            currentBusiness,

        products,

        customers,

        sales,

        invoices,

        exportedAt:
            new Date().toISOString()
    };

    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement(
            "a"
        );

    a.href = url;

    a.download =
        "patriodx-backup.json";

    a.click();

    URL.revokeObjectURL(url);
}

async function importBusinessData(file) {

    if (!file) return;

  showPATRIODXToast(
    "Import is temporarily disabled while PATRIODX cloud storage is being finalized.",
    "info"
);
}


// =========================================================
// RESET
// =========================================================

async function resetBusinessData() {

    if (!currentBusiness) return;

    const confirmed =
        await showPATRIODXConfirm(
            "Reset Business Data",
            "This will permanently delete your products, customers, sales and invoices. Continue?"
        );

    if (!confirmed) return;
    const businessId =
        currentBusiness.id;

    await supabaseClient
        .from("invoices")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await supabaseClient
        .from("sales")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await supabaseClient
        .from("customers")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await supabaseClient
        .from("products")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await loadData();

    renderAll();
}

// =========================================================
// PAYMENTS
// =========================================================

async function verifyPatriodxPayment(reference, expectedPlan) {

    try {

        const {
            data: sessionData,
            error: sessionError
        } = await supabaseClient.auth.getSession();

        if (sessionError || !sessionData?.session?.access_token) {

            console.error(
                "Supabase session error:",
                sessionError
            );

          showPATRIODXToast(
    "Your login session has expired. Please log in again and try the payment.",
    "warning"
);

            return false;
        }


       const response = await fetch(
    "https://businessos-wine-eight.vercel.app/api/verify-payment",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        "Bearer " +
                        sessionData.session.access_token
                },

                body: JSON.stringify({
                    reference: reference,
                    plan: expectedPlan
                })
            }
        );


        const result = await response.json();


        console.log(
            "PATRIODX payment verification:",
            result
        );


        if (!response.ok || !result.status) {

            console.error(
                "Payment verification failed:",
                result
            );

            showPATRIODXToast(
    "Payment was received, but PATRIODX could not verify it. Reference: " +
    reference +
    ". Please contact support.",
    "error"
);

            return false;
        }


     showPATRIODXToast(
    "Payment verified successfully! Your PATRIODX " +
    result.data.plan +
    " plan is now active.",
    "success"
);

// Reload the business from Supabase
// so the dashboard sees the new plan.

if (typeof loadBusiness === "function") {

    await loadBusiness();

} else {

    window.location.reload();

}
        return true;

    } catch (error) {

        console.error(
            "Payment verification error:",
            error
        );

    showPATRIODXToast(
    "Payment was completed, but verification could not be completed. Please contact support if your plan does not update.",
    "error"
);

        return false;
    }
}


async function startPlanCheckout(plan) {
    if (!currentUser) {
        showPATRIODXToast(
            "Please log in before upgrading your plan.",
            "warning"
        );
        return;
    }

    if (!["Pro", "Business"].includes(plan)) {
        showPATRIODXToast(
            "Invalid subscription plan.",
            "error"
        );
        return;
    }

    try {
        showPATRIODXToast(
            "Preparing your secure checkout...",
            "info"
        );

        const {
            data: sessionData,
            error: sessionError
        } = await supabaseClient.auth.getSession();

        const session = sessionData?.session;

        if (sessionError || !session?.access_token) {
            showPATRIODXToast(
                "Your session has expired. Please log in again.",
                "warning"
            );
            return;
        }

        const response = await fetch(
            "https://businessos-wine-eight.vercel.app/api/initialize-payment",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ plan })
            }
        );

        const result = await response.json();

        if (
            !response.ok ||
            !result.status ||
            !result.data?.authorization_url
        ) {
            console.error(
                "Payment initialization failed:",
                result
            );

            showPATRIODXToast(
                result.error ||
                "Unable to start checkout. Please try again.",
                "error"
            );
            return;
        }

        window.location.href =
            result.data.authorization_url;

    } catch (error) {
        console.error(
            "PATRIODX checkout error:",
            error
        );

        showPATRIODXToast(
            "Unable to connect to the payment service. Please try again.",
            "error"
        );
    }
}

function startProPlan() {
    return startPlanCheckout("Pro");
}

function startBusinessPlan() {
    return startPlanCheckout("Business");
}
// =========================================================
// RENDER EVERYTHING
// =========================================================

function renderAll() {

    renderStats();

    renderProducts();

    renderCustomers();

    renderSales();

    renderInvoices();

    renderAnalytics();

    renderRecentActivity();
}

// =========================================================
// SETTINGS & ACTIVITY
// =========================================================

function setupSettingsActivity() {

    // =========================================================
    // SETTINGS DATABASE HELPERS
    // =========================================================

   async function ensureUserSettings() {

    if (!currentUser) {

        showPATRIODXToast(
            "Please log in again.",
            "warning"
        );

        return null;
    }

    const { data, error } =
        await supabaseClient
            .from("user_settings")
            .select("*")
            .eq("user_id", currentUser.id)
            .maybeSingle();

    if (error) {

        console.error(
            "Settings load error:",
            error
        );

        showPATRIODXToast(
            "Could not load your settings.",
            "error"
        );

        return null;
    }

        if (data) {
            return data;
        }

        const { data: newSettings, error: insertError } =
            await supabaseClient
                .from("user_settings")
                .insert({
                    user_id: currentUser.id
                })
                .select()
                .single();
if (insertError) {

    console.error(
        "Settings creation error:",
        insertError
    );

    showPATRIODXToast(
        "Could not create your settings.",
        "error"
    );

    return null;
}

return newSettings;
}


async function saveSetting(column, value) {

    if (!currentUser) {

        showPATRIODXToast(
            "Please log in again.",
            "warning"
        );

        return false;
    }

    const { error } =
        await supabaseClient
            .from("user_settings")
            .upsert(
                {
                    user_id: currentUser.id,
                    [column]: value,
                    updated_at:
                        new Date().toISOString()
                },
                {
                    onConflict: "user_id"
                }
            );

    if (error) {

        console.error(
            "Settings save error:",
            error
        );

        showPATRIODXToast(
            "Could not save this setting. Please try again.",
            "error"
        );

        return false;
    }

    return true;
}
    // =========================================================
    // ACCOUNT
    // =========================================================

 document
    .getElementById("changeEmailButton")
    ?.addEventListener("click", async () => {

        if (!currentUser) {

            showPATRIODXToast(
                "Please log in again.",
                "warning"
            );

            return;
        }

       const newEmail =
    await showPATRIODXInput(
        "Change Email",
        "Enter your new email address:"
    );

if (!newEmail) {
    return;
}

        const email =
            newEmail.trim();

        if (!email.includes("@")) {

            showPATRIODXToast(
                "Please enter a valid email address.",
                "warning"
            );

            return;
        }

        const { error } =
            await supabaseClient.auth.updateUser({
                email: email
            });

        if (error) {

            console.error(error);

            showPATRIODXToast(
                "Could not change your email. Please try again.",
                "error"
            );

            return;
        }

        showPATRIODXToast(
            "A confirmation email has been sent to your new email address.",
            "success"
        );

    });
    // =========================================================
    // ACCOUNT PRIVACY
    // =========================================================
document
    .getElementById("accountPrivacyButton")
    ?.addEventListener("click", async () => {

        const settings =
            await ensureUserSettings();

        if (!settings) {
            return;
        }

       const choice =
    await showPATRIODXInput(
        "Account Privacy",
        "Choose: public, followers, or private.<br><br>" +
        "Current: " +
        settings.account_privacy
    );

if (!choice) {
    return;
}
        const value =
            choice.trim().toLowerCase();

        if (
            ![
                "public",
                "followers",
                "private"
            ].includes(value)
        ) {

            showPATRIODXToast(
                "Please enter public, followers, or private.",
                "warning"
            );

            return;
        }

        if (
            await saveSetting(
                "account_privacy",
                value
            )
        ) {

            document
                .getElementById(
                    "accountPrivacyButton"
                )
                .textContent =
                "Account Privacy: " +
                value;

        }

    });

    // =========================================================
    // MESSAGE PRIVACY
    // =========================================================

    document
    .getElementById("messagePrivacyButton")
    ?.addEventListener("click", async () => {

        const settings =
            await ensureUserSettings();

        if (!settings) {
            return;
        }

   const choice =
    await showPATRIODXInput(
        "Message Privacy",
        "Choose: everyone, followers, or nobody.<br><br>" +
        "Current: " +
        settings.message_privacy
    );

if (!choice) {
    return;
}
        const value =
            choice.trim().toLowerCase();

        if (
            ![
                "everyone",
                "followers",
                "nobody"
            ].includes(value)
        ) {

            showPATRIODXToast(
                "Please enter everyone, followers, or nobody.",
                "warning"
            );

            return;
        }

        if (
            await saveSetting(
                "message_privacy",
                value
            )
        ) {

            document
                .getElementById(
                    "messagePrivacyButton"
                )
                .textContent =
                "Message Privacy: " +
                value;

        }

    });

    // =========================================================
    // MENTION PRIVACY
    // =========================================================

  document
    .getElementById("mentionPrivacyButton")
    ?.addEventListener("click", async () => {

        const settings =
            await ensureUserSettings();

        if (!settings) {
            return;
        }

      const choice =
    await showPATRIODXInput(
        "Mention Privacy",
        "Choose: everyone, followers, or nobody.<br><br>" +
        "Current: " +
        settings.mention_privacy
    );

if (!choice) {
    return;
}

        const value =
            choice.trim().toLowerCase();

        if (
            ![
                "everyone",
                "followers",
                "nobody"
            ].includes(value)
        ) {

            showPATRIODXToast(
                "Please enter everyone, followers, or nobody.",
                "warning"
            );

            return;
        }

        if (
            await saveSetting(
                "mention_privacy",
                value
            )
        ) {

            document
                .getElementById(
                    "mentionPrivacyButton"
                )
                .textContent =
                "Mention Privacy: " +
                value;

        }

    });
    // =========================================================
    // TAG PRIVACY
    // =========================================================
document
    .getElementById("tagPrivacyButton")
    ?.addEventListener("click", async () => {

        const settings =
            await ensureUserSettings();

        if (!settings) {
            return;
        }

      const choice =
    await showPATRIODXInput(
        "Tag Privacy",
        "Choose: everyone, followers, or nobody.<br><br>" +
        "Current: " +
        settings.tag_privacy
    );

if (!choice) {
    return;
}
        const value =
            choice.trim().toLowerCase();

        if (
            ![
                "everyone",
                "followers",
                "nobody"
            ].includes(value)
        ) {

            showPATRIODXToast(
                "Please enter everyone, followers, or nobody.",
                "warning"
            );

            return;
        }

        if (
            await saveSetting(
                "tag_privacy",
                value
            )
        ) {

            document
                .getElementById(
                    "tagPrivacyButton"
                )
                .textContent =
                "Tag Privacy: " +
                value;

        }

    });


    // =========================================================
    // SOCIAL
    // =========================================================

   document
    .getElementById("followersButton")
    ?.addEventListener("click", () => {

        navigatePATRIODX("profile");

    });


document
    .getElementById("blockedUsersButton")
    ?.addEventListener("click", () => {

        showPATRIODXToast(
            "Blocked account management will be added here.",
            "info"
        );

    });


document
    .getElementById("inviteFriendsButton")
    ?.addEventListener("click", async () => {

        const inviteText =
            "Join me on PATRIODX — Run your business smarter.";

        if (
            navigator.share &&
            typeof navigator.share === "function"
        ) {

            try {

                await navigator.share({
                    title: "PATRIODX",
                    text: inviteText,
                    url: window.location.origin
                });

            } catch (error) {

                if (
                    error.name !== "AbortError"
                ) {

                    console.error(error);

                }

            }

        } else {

            showPATRIODXToast(
                inviteText,
                "info"
            );

        }

    });


// =========================================================
// CROSS-POSTING
// =========================================================

document
    .getElementById("crosspostingButton")
    ?.addEventListener("click", async () => {

        const settings =
            await ensureUserSettings();

        if (!settings) {
            return;
        }

        const newValue =
            !Boolean(
                settings.crossposting_enabled
            );

        if (
            await saveSetting(
                "crossposting_enabled",
                newValue
            )
        ) {

            document
                .getElementById(
                    "crosspostingButton"
                )
                .textContent =
                "Cross-posting: " +
                (
                    newValue
                        ? "On"
                        : "Off"
                );

        }

    });
    // =========================================================
    // LIVESTREAM
    // =========================================================

    document
        .getElementById("livestreamButton")
        ?.addEventListener("click", async () => {

            const settings =
                await ensureUserSettings();

            if (!settings) {
                return;
            }

          const choice =
    await showPATRIODXInput(
        "Livestream Privacy",
        "Choose: everyone, followers, or private.<br><br>" +
        "Current: " +
        settings.livestream_privacy
    );

if (!choice) {
    return;
}

            const value =
                choice.trim().toLowerCase();

            if (
                ![
                    "everyone",
                    "followers",
                    "private"
                ].includes(value)
            ) {

               showPATRIODXToast(
    "Please enter everyone, followers, or private.",
    "warning"
);

                return;
            }

            if (
                await saveSetting(
                    "livestream_privacy",
                    value
                )
            ) {

                document
                    .getElementById(
                        "livestreamButton"
                    )
                    .textContent =
                    "Livestream: " +
                    value;

            }

        });


    // =========================================================
    // STORIES
    // =========================================================

    document
        .getElementById("storyPrivacyButton")
        ?.addEventListener("click", async () => {

            const settings =
                await ensureUserSettings();

            if (!settings) {
                return;
            }

           const choice =
    await showPATRIODXInput(
        "Story Privacy",
        "Choose: everyone, followers, or private.<br><br>" +
        "Current: " +
        settings.story_privacy
    );

if (!choice) {
    return;
}
            const value =
                choice.trim().toLowerCase();

          if (
    ![
        "everyone",
        "followers",
        "private"
    ].includes(value)
) {

    showPATRIODXToast(
        "Please enter everyone, followers, or private.",
        "warning"
    );

    return;
}

            if (
                await saveSetting(
                    "story_privacy",
                    value
                )
            ) {

                document
                    .getElementById(
                        "storyPrivacyButton"
                    )
                    .textContent =
                    "Story Privacy: " +
                    value;

            }

        });


    // =========================================================
    // STORY ARCHIVE
    // =========================================================

    document
        .getElementById("storyArchiveButton")
        ?.addEventListener("click", async () => {

            const settings =
                await ensureUserSettings();

            if (!settings) {
                return;
            }

            const newValue =
                !Boolean(
                    settings.story_archive_enabled
                );

            if (
                await saveSetting(
                    "story_archive_enabled",
                    newValue
                )
            ) {

                document
                    .getElementById(
                        "storyArchiveButton"
                    )
                    .textContent =
                    "Story Archive: " +
                    (
                        newValue
                            ? "On"
                            : "Off"
                    );

            }

        });


    // =========================================================
    // LANGUAGE
    // =========================================================

    const settingsLanguage =
        document.getElementById(
            "settingsLanguageSelector"
        );

    if (settingsLanguage) {

        const headerLanguage =
            document.getElementById(
                "languageSelector"
            );

        if (headerLanguage) {

            settingsLanguage.value =
                headerLanguage.value;

        }

        settingsLanguage.addEventListener(
            "change",
            () => {

                const language =
                    settingsLanguage.value;

                if (headerLanguage) {

                    headerLanguage.value =
                        language;

                    headerLanguage.dispatchEvent(
                        new Event("change")
                    );

                }

            }
        );

    }


    // =========================================================
    // NOTIFICATIONS
    // =========================================================

    document
        .getElementById(
            "notificationSettingsButton"
        )
        ?.addEventListener(
            "click",
            async () => {

                const settings =
                    await ensureUserSettings();

                if (!settings) {
                    return;
                }

                const newValue =
                    !Boolean(
                        settings.notification_enabled
                    );

                if (
                    await saveSetting(
                        "notification_enabled",
                        newValue
                    )
                ) {

                    document
                        .getElementById(
                            "notificationSettingsButton"
                        )
                        .textContent =
                        "Notifications: " +
                        (
                            newValue
                                ? "On"
                                : "Off"
                        );

                }

            }
        );


    // =========================================================
    // HELP & SUPPORT
    // =========================================================

    document
        .getElementById("reportProblemButton")
        ?.addEventListener("click", () => {

            navigatePATRIODX("contact");

        });


    document
        .getElementById("helpCenterButton")
        ?.addEventListener("click", () => {

            navigatePATRIODX("contact");

        });


    // =========================================================
    // LOAD SAVED SETTINGS
    // =========================================================

    (async () => {

        const settings =
            await ensureUserSettings();

        if (!settings) {
            return;
        }


        const accountPrivacy =
            document.getElementById(
                "accountPrivacyButton"
            );

        if (accountPrivacy) {
            accountPrivacy.textContent =
                "Account Privacy: " +
                settings.account_privacy;
        }


        const messagePrivacy =
            document.getElementById(
                "messagePrivacyButton"
            );

        if (messagePrivacy) {
            messagePrivacy.textContent =
                "Message Privacy: " +
                settings.message_privacy;
        }


        const mentionPrivacy =
            document.getElementById(
                "mentionPrivacyButton"
            );

        if (mentionPrivacy) {
            mentionPrivacy.textContent =
                "Mention Privacy: " +
                settings.mention_privacy;
        }


        const tagPrivacy =
            document.getElementById(
                "tagPrivacyButton"
            );

        if (tagPrivacy) {
            tagPrivacy.textContent =
                "Tag Privacy: " +
                settings.tag_privacy;
        }


        const crossposting =
            document.getElementById(
                "crosspostingButton"
            );

        if (crossposting) {
            crossposting.textContent =
                "Cross-posting: " +
                (
                    settings.crossposting_enabled
                        ? "On"
                        : "Off"
                );
        }


        const livestream =
            document.getElementById(
                "livestreamButton"
            );

        if (livestream) {
            livestream.textContent =
                "Livestream: " +
                settings.livestream_privacy;
        }


        const storyPrivacy =
            document.getElementById(
                "storyPrivacyButton"
            );

        if (storyPrivacy) {
            storyPrivacy.textContent =
                "Story Privacy: " +
                settings.story_privacy;
        }


        const storyArchive =
            document.getElementById(
                "storyArchiveButton"
            );

        if (storyArchive) {
            storyArchive.textContent =
                "Story Archive: " +
                (
                    settings.story_archive_enabled
                        ? "On"
                        : "Off"
                );
        }


        const notifications =
            document.getElementById(
                "notificationSettingsButton"
            );

        if (notifications) {
            notifications.textContent =
                "Notifications: " +
                (
                    settings.notification_enabled
                        ? "On"
                        : "Off"
                );
        }

    })();


    // =========================================================
    // PLAN USAGE
    // =========================================================

if (typeof updateAccountUI === "function") {
    updateAccountUI();
}

}
// =========================================================
// FORM EVENTS
// =========================================================

function setupForms() {

    document
        .getElementById(
            "productForm"
        )
        ?.addEventListener(
            "submit",
            saveProduct
        );

    document
        .getElementById(
            "customerForm"
        )
        ?.addEventListener(
            "submit",
            saveCustomer
        );

    document
        .getElementById(
            "saleForm"
        )
        ?.addEventListener(
            "submit",
            saveSale
        );

    document
        .getElementById(
            "invoiceForm"
        )
        ?.addEventListener(
            "submit",
            saveInvoice
        );

    document
        .getElementById(
            "saleProduct"
        )
        ?.addEventListener(
            "change",
            updateSaleTotal
        );

    document
        .getElementById(
            "saleQuantity"
        )
        ?.addEventListener(
            "input",
            updateSaleTotal
        );

    document
        .getElementById(
            "invoiceProduct"
        )
        ?.addEventListener(
            "change",
            updateInvoiceTotal
        );

    document
        .getElementById(
            "invoiceQuantity"
        )
        ?.addEventListener(
            "input",
            updateInvoiceTotal
        );

    document
        .getElementById(
            "invoiceDiscount"
        )
        ?.addEventListener(
            "input",
            updateInvoiceTotal
        );

    document
        .getElementById(
            "invoiceTax"
        )
        ?.addEventListener(
            "input",
            updateInvoiceTotal
        );
}

    document
        .getElementById("addStoryForm")
        ?.addEventListener(
            "submit",
            submitPATRIODXStory
        );
/* =========================================================
   SOCIAL COMMENTS REALTIME
========================================================= */

function setupSocialCommentsRealtime() {

    if (
        !supabaseClient ||
        !currentUser
    ) {
        return;
    }

    supabaseClient
        .channel("patriodx-social-comments")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "comments"
            },
            function(payload) {

                const newComment =
                    payload.new;

                if (!newComment?.post_id) {
                    return;
                }

                const commentsList =
                    document.getElementById(
                        `comments-list-${newComment.post_id}`
                    );

                if (!commentsList) {
                    return;
                }

                loadSocialComments(
                    newComment.post_id
                );
            }
        )
        .subscribe();
}
// =========================================================
// START PATRIODX
// =========================================================
async function startPATRIODX() {

    const authenticated =
        await loadUser();

       if (!authenticated) return;

    await loadData();
    await loadMyProfile();

    // Load stories after restoring the signed-in user.
    await loadPATRIODXStories();
    setupNotifications();
    loadPlan();

    setupSearch();

    setupDarkMode();

    setupModalBehavior();

    setupForms();
setupSettingsActivity();
setupSocialCommentsRealtime();
    document
        .getElementById("logoutButton")
        ?.addEventListener(
            "click",
            logoutUser
        );
const settingsLogoutButton =
    document.getElementById(
        "settingsLogoutButton"
    );

if (settingsLogoutButton) {

    settingsLogoutButton.addEventListener(
        "click",
        logoutUser
    );
}
    const addAccountButton =
    document.getElementById(
        "addAccountButton"
    );

if (addAccountButton) {

    addAccountButton.addEventListener(
        "click",
        function() {

            window.location.href =
                "auth.html";

        }
    );
}
  renderAll();

await loadHomePosts();

console.log(
    "PATRIODX connected successfully."
);
}
// =========================================================
// LOGOUT
// =========================================================

async function logoutUser() {

    const button =
        document.getElementById(
            "logoutButton"
        );

    if (button) {

        button.disabled = true;

        button.textContent =
            "Logging out...";
    }

    const { error } =
        await supabaseClient
            .auth
            .signOut();

 if (error) {

    console.error(error);

    showPATRIODXToast(
        "Could not log out. Please try again.",
        "error"
    );

    if (button) {

        button.disabled = false;

        button.textContent =
            "Logout";
    }

        return;
    }

    window.location.href =
        "auth.html";
}
// =========================================================
// PRODUCT MODAL — RESTORE MISSING FUNCTIONS
// =========================================================
function openProductModal(productIdToEdit = null) {
    const modal = document.getElementById("productModal");
    const form = document.getElementById("productForm");
    const title = document.getElementById("productModalTitle");
    const productIdField = document.getElementById("productId");

    if (!modal) {
        console.error("PATRIODX: Product modal was not found.");
        return;
    }

    if (form) {
        form.reset();
    }

    if (productIdField) {
        productIdField.value = "";
    }

    const costPriceField =
        document.getElementById("productCostPrice");

   if (!productIdToEdit) {
    if (title) {
        title.textContent = "Add Product";
    }

    if (costPriceField) {
        costPriceField.value = "";
    }

    // Publish new products to the Marketplace by default.
    const publishCheckbox =
        document.getElementById("productPublish");

    if (publishCheckbox) {
        publishCheckbox.checked = true;
    }

    modal.style.display = "flex";
    return;
}

    const product = products.find(
        item => String(item.id) === String(productIdToEdit)
    );

    if (!product) {
        showPATRIODXToast(
            "Could not find this product. Please refresh and try again.",
            "error"
        );
        return;
    }

    if (productIdField) {
        productIdField.value = product.id;
    }

    document.getElementById("productName").value =
        product.name || "";

    document.getElementById("productPrice").value =
        product.price ?? "";

    document.getElementById("productStock").value =
        product.stock ?? "";
document.getElementById("productDescription").value =
    product.description || "";

document.getElementById("productCategory").value =
    product.category || "";

document.getElementById("productImageUrl").value =
    product.image_url || "";

document.getElementById("productPublish").checked =
    product.is_published === true;
    if (costPriceField) {
        costPriceField.value =
            product.cost_price ?? "";
    }

    if (title) {
        title.textContent = "Edit Product";
    }

    modal.style.display = "flex";
}
function closeProductModal() {
    const modal = document.getElementById("productModal");

    if (modal) {
        modal.style.display = "none";
    }
}
// =========================================================
// MAKE HTML ONCLICK FUNCTIONS GLOBAL
// =========================================================

window.scrollToSection =
    scrollToSection;

window.openProductModal =
    openProductModal;

window.closeProductModal =
    closeProductModal;

window.deleteProduct =
    deleteProduct;

window.openCustomerModal =
    openCustomerModal;

window.closeCustomerModal =
    closeCustomerModal;

window.deleteCustomer =
    deleteCustomer;

window.openSaleModal =
    openSaleModal;

window.closeSaleModal =
    closeSaleModal;

window.deleteSale =
    deleteSale;

window.openInvoiceModal =
    openInvoiceModal;

window.closeInvoiceModal =
    closeInvoiceModal;

window.closeInvoiceViewModal =
    closeInvoiceViewModal;

window.toggleInvoiceStatus =
    toggleInvoiceStatus;

window.deleteInvoice =
    deleteInvoice;

window.viewInvoice =
    viewInvoice;

window.sendContactMessage =
    sendContactMessage;

window.exportBusinessData =
    exportBusinessData;

window.importBusinessData =
    importBusinessData;

window.resetBusinessData =
    resetBusinessData;

window.startProPlan =
    startProPlan;

window.startBusinessPlan =
    startBusinessPlan;

window.logoutUser =
    logoutUser;
window.changePassword =
    changePassword;

window.deleteAccount =
    deleteAccount;

// =========================================================
// START
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    startPATRIODX
);
/* =========================================================
   PATRIODX AI
========================================================= */

const aiForm = document.getElementById("aiForm");
const aiInput = document.getElementById("aiInput");
const aiMessages = document.getElementById("aiMessages");
const aiSendButton = document.getElementById("aiSendButton");


function addAIMessage(message, type = "bot") {

    const messageDiv = document.createElement("div");

    messageDiv.className =
        type === "user"
            ? "ai-message ai-message-user"
            : "ai-message ai-message-bot";

    if (type === "user") {

        messageDiv.innerHTML = `
            <strong>You</strong>
            <p>${message}</p>
        `;

    } else {

        messageDiv.innerHTML = `
            <strong>
    <i data-lucide="sparkles"></i>
    PATRIODX AI
</strong>
            <p>${message}</p>
        `;

    }

    aiMessages.appendChild(messageDiv);

    aiMessages.scrollTop =
        aiMessages.scrollHeight;
}


if (aiForm) {

    aiForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const message =
            aiInput.value.trim();

        if (!message) {
            return;
        }


        /* Show user's message */

        addAIMessage(
            message,
            "user"
        );


        /* Clear input */

        aiInput.value = "";


        /* Disable button */

        aiSendButton.disabled = true;
        aiSendButton.textContent = "Thinking...";


        /* Temporary loading message */

        const loadingDiv =
            document.createElement("div");

        loadingDiv.className =
            "ai-message ai-message-bot";

        loadingDiv.innerHTML = `
           <strong>
    <i data-lucide="sparkles"></i>
    PATRIODX AI
</strong>
            <p>Thinking...</p>
        `;

        aiMessages.appendChild(
            loadingDiv
        );


        try {

            /*
             * Get the current Supabase session.
             */

            const {
                data: sessionData
            } =
                await supabaseClient.auth.getSession();


            const session =
                sessionData?.session;


            if (!session) {

                throw new Error(
                    "Please log in to use PATRIODX AI."
                );

            }


            /*
             * Send business data to our
             * secure server endpoint.
             */

            const response =
                await fetch(
                   "https://businessos-wine-eight.vercel.app/api/ai",
                    {
                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${session.access_token}`

                        },

                        body:
                            JSON.stringify({

                                message:

                                    message,

                                business: {

                                    businessName:
                                        typeof businessName !== "undefined"
                                            ? businessName
                                            : "",

                                    plan:
                                        typeof currentPlan !== "undefined"
                                            ? currentPlan
                                            : "Free",

                                    products:
                                        typeof products !== "undefined"
                                            ? products
                                            : [],

                                    customers:
                                        typeof customers !== "undefined"
                                            ? customers
                                            : [],

                                    sales:
                                        typeof sales !== "undefined"
                                            ? sales
                                            : [],

                                    invoices:
                                        typeof invoices !== "undefined"
                                            ? invoices
                                            : []

                                }

                            })

                    }

                );


            const result =
                await response.json();


            if (!response.ok ||
                !result.status) {

                throw new Error(
                    result.error ||
                    "PATRIODX AI request failed."
                );

            }


            /*
             * Remove loading message.
             */

            loadingDiv.remove();


            /*
             * Display AI response.
             */

            addAIMessage(
                result.answer,
                "bot"
            );


        } catch (error) {

            console.error(
                "PATRIODX AI error:",
                error
            );


            loadingDiv.remove();


            addAIMessage(
                error.message ||
                "Something went wrong while contacting PATRIODX AI.",
                "bot"
            );


        } finally {

            aiSendButton.disabled =
                false;

            aiSendButton.textContent =
                "Ask AI";

            aiInput.focus();

        }

    });

}
/* =========================================================
   PATRIODX SOCIAL 2.0
========================================================= */

const socialPostForm =
    document.getElementById("socialPostForm");

const socialFeed =
    document.getElementById("socialFeed");

const socialImageInput =
    document.getElementById("socialImageInput");

const socialVideoInput =
    document.getElementById("socialVideoInput");

const socialMediaPreview =
    document.getElementById("socialMediaPreview");

let selectedSocialFile = null;


/* =========================================================
   MEDIA PREVIEW
========================================================= */

function showSocialMediaPreview(file) {

    if (!socialMediaPreview) return;

    if (!file) {

        socialMediaPreview.innerHTML = "";
        socialMediaPreview.style.display = "none";

        return;
    }

    selectedSocialFile = file;

    const fileUrl =
        URL.createObjectURL(file);


    if (file.type.startsWith("image/")) {

        socialMediaPreview.innerHTML = `
            <div class="social-preview-container">

                <img
                    src="${fileUrl}"
                    class="social-preview-image"
                    alt="Selected photo"
                >

                <div class="social-preview-info">
                    <i data-lucide="image"></i> ${safe(file.name)}
                </div>

                <button
                    type="button"
                    class="social-remove-media"
                    onclick="clearSocialMedia()"
                >
                    Remove
                </button>

            </div>
        `;

    } else if (file.type.startsWith("video/")) {

        socialMediaPreview.innerHTML = `
            <div class="social-preview-container">

                <video
                    src="${fileUrl}"
                    class="social-preview-video"
                    controls
                ></video>

                <div class="social-preview-info">
                    <strong>
                        <i data-lucide="video"></i> ${safe(file.name)}
                    </strong>
                </div>

                <button
                    type="button"
                    class="social-remove-media"
                    onclick="clearSocialMedia()"
                >
                    Remove
                </button>

            </div>
        `;
    }


    socialMediaPreview.style.display = "block";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
/* =========================================================
   IMAGE SELECTED
========================================================= */

if (socialImageInput) {

    socialImageInput.addEventListener(
        "change",
        function () {

            const file =
                this.files?.[0];

            if (!file) {
                return;
            }

            if (!file.type.startsWith("image/")) {

                showPATRIODXToast(
                    "Please select an image file.",
                    "warning"
                );

                this.value = "";

                return;
            }

            if (file.size > 10 * 1024 * 1024) {

                showPATRIODXToast(
                    "Photo must be smaller than 10 MB.",
                    "warning"
                );

                this.value = "";

                return;
            }

            if (socialVideoInput) {
                socialVideoInput.value = "";
            }

            showSocialMediaPreview(file);

        }
    );
}

/* =========================================================
   VIDEO SELECTED
========================================================= */
if (socialVideoInput) {

    socialVideoInput.addEventListener(
        "change",
        function () {

            const file =
                this.files?.[0];

            if (!file) return;


            if (!file.type.startsWith("video/")) {

                showPATRIODXToast(
                    "Please select a video file.",
                    "warning"
                );

                this.value = "";

                return;
            }


            if (file.size > 50 * 1024 * 1024) {

                showPATRIODXToast(
                    "Video must be smaller than 50 MB.",
                    "warning"
                );

                this.value = "";

                return;
            }


            if (socialImageInput) {
                socialImageInput.value = "";
            }


            showSocialMediaPreview(file);
        }
    );
}
/* =========================================================
   CLEAR MEDIA
========================================================= */

function clearSocialMedia() {

    selectedSocialFile = null;


    if (socialImageInput) {
        socialImageInput.value = "";
    }


    if (socialVideoInput) {
        socialVideoInput.value = "";
    }


    if (socialMediaPreview) {

        socialMediaPreview.innerHTML = "";

        socialMediaPreview.style.display =
            "none";
    }
}


/* =========================================================
   UPLOAD MEDIA
========================================================= */

async function uploadSocialMedia(file) {

    if (!file || !currentUser) {
        return null;
    }


    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    const fileName =
        `${crypto.randomUUID()}.${extension}`;


    const filePath =
        `${currentUser.id}/${fileName}`;


    const { error } =
        await supabaseClient
            .storage
            .from("patriodx-media")
            .upload(
                filePath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false
                }
            );


    if (error) {

        console.error(
            "Media upload error:",
            error
        );

        throw error;
    }


    const { data } =
        supabaseClient
            .storage
            .from("patriodx-media")
            .getPublicUrl(filePath);


    return data.publicUrl;
}


/* =========================================================
GET POST COUNTS
========================================================= */

async function getSocialCounts(postId) {
const [likesResult, commentsResult] = await Promise.all([
supabaseClient
.from("post_likes")
.select("id", { count: "exact", head: true })
.eq("post_id", postId),


    supabaseClient
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId)
        .is("parent_comment_id", null)
]);

if (likesResult.error) {
    throw likesResult.error;
}

if (commentsResult.error) {
    throw commentsResult.error;
}

return {
    likes: likesResult.count ?? 0,
    comments: commentsResult.count ?? 0
};

}

/* =========================================================
   CHECK IF CURRENT USER LIKED A POST
========================================================= */

async function hasLikedSocialPost(postId) {
    if (!currentUser) {
        return false;
    }

    const { data, error } = await supabaseClient
        .from("post_likes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error("Could not check post like:", error);
        throw error;
    }

    return Boolean(data);
}
/* =========================================================
   LOAD SOCIAL POSTS
========================================================= */

function setupSocialFeedTabs() {

    const latestButton =
        document.getElementById("socialFeedLatestButton");

    const followingButton =
        document.getElementById("socialFeedFollowingButton");

    if (!latestButton || !followingButton) {
        return;
    }

    if (latestButton.dataset.feedTabsReady === "true") {
        return;
    }

    latestButton.dataset.feedTabsReady = "true";

    latestButton.addEventListener("click", async () => {

        socialFeedMode = "latest";

        latestButton.classList.add("active");
        followingButton.classList.remove("active");

        await loadSocialPosts();
    });

    followingButton.addEventListener("click", async () => {

        socialFeedMode = "following";

        followingButton.classList.add("active");
        latestButton.classList.remove("active");

        await loadSocialPosts();
    });
}

let patriodxStoryViewerStories = [];
let patriodxStoryViewerIndex = 0;
let patriodxStoryViewerTimer = null;
let patriodxStoryProgressDuration = 0;
let patriodxStoryProgressStartedAt = 0;
let patriodxStoryProgressRemaining = 0;
let patriodxStoryProgressPaused = false;

async function loadPATRIODXStories() {

    const storiesContainer =
        document.getElementById("socialOtherStories");

    if (!storiesContainer || !currentUser) {
        return;
    }

    try {

        const { data: stories, error } =
            await supabaseClient
                .select(
    "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
)
                .gt(
                    "expires_at",
                    new Date().toISOString()
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

        if (error) {
            throw error;
        }

        storiesContainer.innerHTML = "";

        patriodxStoryViewerStories = [];
        patriodxStoryViewerIndex = 0;

        if (!stories || stories.length === 0) {
            return;
        }

        const userIds = [
            ...new Set(
                stories.map(
                    story => story.user_id
                )
            )
        ];

       const { data: profiles, error: profileError } =
    await supabaseClient
        .from("profiles")
        .select(
            "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
        )
        .in(
            "id",
            userIds
        );

        if (profileError) {
            throw profileError;
        }

        const profileMap = {};

        (profiles || []).forEach(profile => {
            profileMap[profile.id] = profile;
        });
const viewedStoryIds = new Set();

if (currentUser) {
    const { data: views, error: viewsError } = await supabaseClient
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", currentUser.id);

    if (viewsError) {
        console.error("Could not load viewed stories:", viewsError);
    } else {
        (views || []).forEach(view => {
            viewedStoryIds.add(view.story_id);
        });
    }
}
        stories.forEach(story => {

            const profile =
                profileMap[story.user_id];

            if (!profile) {
                return;
            }

            const name =
                profile.display_name ||
                profile.username ||
                "PATRIODX User";

            const storyData = {
                ...story,
                profile: profile,
                name: name
            };

            patriodxStoryViewerStories.push(
                storyData
            );

           const storyButton =
    document.createElement("button");

storyButton.type = "button";

storyButton.className = "social-story-item";

if (currentUser && story.user_id !== currentUser.id) {
    storyButton.classList.add(
        viewedStoryIds.has(story.id)
            ? "story-viewed"
            : "story-unviewed"
    );
}

            const avatar =
                document.createElement("span");

            avatar.className =
                "social-story-avatar";

            if (profile.avatar_url) {

                const image =
                    document.createElement("img");

                image.src =
                    profile.avatar_url;

                image.alt = name;

                avatar.appendChild(image);

            } else {

                avatar.textContent =
                    name
                        .charAt(0)
                        .toUpperCase();
            }

            const nameElement =
    document.createElement("strong");

nameElement.textContent = name;

if (typeof getPATRIODXBadge === "function") {
    nameElement.insertAdjacentHTML(
        "beforeend",
        getPATRIODXBadge(profile)
    );
}

storyButton.appendChild(avatar);
storyButton.appendChild(nameElement);

            const storyIndex =
                patriodxStoryViewerStories.length - 1;

            storyButton.addEventListener(
                "click",
                function () {

                    openPATRIODXStoryViewer(
                        storyIndex
                    );

                }
            );

            storiesContainer.appendChild(
                storyButton
            );

        });

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        console.log(
            "PATRIODX stories loaded:",
            patriodxStoryViewerStories.length
        );

    } catch (error) {

        console.error(
            "PATRIODX stories error:",
            error
        );

    }
}


/* =========================================================
   PATRIODX STORY VIEWER
========================================================= */

async function recordPATRIODXStoryView(story) {

    if (!currentUser || !story) {
        return;
    }

    if (story.user_id === currentUser.id) {
        return;
    }

    try {

        const { error } =
            await supabaseClient
                .from("story_views")
                .upsert(
                    {
                        story_id: story.id,
                        viewer_id: currentUser.id
                    },
                    {
                        onConflict:
                            "story_id,viewer_id"
                    }
                );

        if (error) {
            console.error(
                "Could not record story view:",
                error
            );
        }

    } catch (error) {

        console.error(
            "Story view error:",
            error
        );

    }
}


function openPATRIODXStoryViewer(index) {

    const viewer =
        document.getElementById(
            "patriodxStoryViewer"
        );

    if (!viewer) {
        console.error(
            "PATRIODX story viewer was not found."
        );
        return;
    }

    if (
        !patriodxStoryViewerStories.length
    ) {
        return;
    }

    patriodxStoryViewerIndex =
        Math.max(
            0,
            Math.min(
                index,
                patriodxStoryViewerStories.length - 1
            )
        );

    viewer.style.display = "flex";

    document.body.style.overflow = "hidden";

    renderPATRIODXStoryViewer();
}


async function renderPATRIODXStoryViewer() {

    const story =
        patriodxStoryViewerStories[
            patriodxStoryViewerIndex
        ];

    if (!story) {
        closePATRIODXStoryViewer();
        return;
    }

    const viewerContent =
        document.getElementById(
            "storyViewerContent"
        );

    const avatar =
        document.getElementById(
            "storyViewerAvatar"
        );

    const username =
        document.getElementById(
            "storyViewerUsername"
        );

    const time =
        document.getElementById(
            "storyViewerTime"
        );

    const progress =
        document.getElementById(
            "storyViewerProgress"
        );

    if (
        !viewerContent ||
        !avatar ||
        !username ||
        !time ||
        !progress
    ) {
        return;
    }

    clearTimeout(
        patriodxStoryViewerTimer
    );

    progress.style.transition = "none";
    progress.style.width = "0%";

    const profile =
        story.profile || {};

    const name =
        story.name ||
        profile.display_name ||
        profile.username ||
        "PATRIODX User";

    username.textContent = name;

if (typeof getPATRIODXBadge === "function") {
    username.insertAdjacentHTML(
        "beforeend",
        getPATRIODXBadge(profile)
    );
}

    avatar.innerHTML = "";

    if (profile.avatar_url) {

        const image =
            document.createElement("img");

        image.src =
            profile.avatar_url;

        image.alt = name;

        avatar.appendChild(image);

    } else {

        avatar.textContent =
            name
                .charAt(0)
                .toUpperCase();
    }

    time.textContent =
        formatPATRIODXStoryTime(
            story.created_at
        );

    viewerContent.innerHTML = "";

    if (
        story.media_type &&
        story.media_type
            .toLowerCase()
            .startsWith("video")
    ) {

        const video =
            document.createElement("video");

        video.src =
            story.media_url;

        video.controls = true;

        video.autoplay = true;

        video.playsInline = true;

        viewerContent.appendChild(video);

video.addEventListener("loadedmetadata", function () {
    clearTimeout(patriodxStoryViewerTimer);

    const progress = document.getElementById("storyViewerProgress");

    if (progress) {
        progress.style.transition = "none";
        progress.style.width = "0%";
    }

    function updateVideoStoryProgress() {
        if (
            !progress ||
            !Number.isFinite(video.duration) ||
            video.duration <= 0
        ) {
            return;
        }

        const percent = Math.min(
            100,
            Math.max(0, (video.currentTime / video.duration) * 100)
        );

        progress.style.transition = "none";
        progress.style.width = `${percent}%`;
    }

    video.addEventListener("timeupdate", updateVideoStoryProgress);

    video.addEventListener("ended", function () {
        if (progress) {
            progress.style.width = "100%";
        }

        showNextPATRIODXStory();
    }, { once: true });

}, { once: true });


    } else {

        const image =
            document.createElement("img");

        image.src =
            story.media_url;

        image.alt =
            "PATRIODX Story";

        viewerContent.appendChild(image);

        startPATRIODXStoryProgress(5);
    }

    await recordPATRIODXStoryView(
        story
    );

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function startPATRIODXStoryProgress(duration) {
    const progress = document.getElementById("storyViewerProgress");

    if (!progress) return;

    clearTimeout(patriodxStoryViewerTimer);

    patriodxStoryProgressDuration = duration * 1000;
    patriodxStoryProgressRemaining = duration * 1000;
    patriodxStoryProgressStartedAt = Date.now();
    patriodxStoryProgressPaused = false;

    progress.style.transition = "none";
    progress.style.width = "0%";

    requestAnimationFrame(() => {
        if (patriodxStoryProgressPaused) return;

        progress.style.transition = `width ${duration}s linear`;
        progress.style.width = "100%";
    });

    patriodxStoryViewerTimer = setTimeout(() => {
        if (!patriodxStoryProgressPaused) {
            showNextPATRIODXStory();
        }
    }, duration * 1000);
}

function pausePATRIODXStoryProgress() {
    if (patriodxStoryProgressPaused) return;

    patriodxStoryProgressPaused = true;
    clearTimeout(patriodxStoryViewerTimer);

    const progress = document.getElementById("storyViewerProgress");
    const video = document.querySelector("#storyViewerContent video");

    if (video) {
        video.pause();
        return;
    }

    if (progress) {
        const computedWidth = parseFloat(
            window.getComputedStyle(progress).width
        );
        const parentWidth = progress.parentElement?.clientWidth || 0;

        if (parentWidth > 0) {
            const percent = Math.min(
                100,
                Math.max(0, (computedWidth / parentWidth) * 100)
            );

            patriodxStoryProgressRemaining =
                patriodxStoryProgressDuration * (1 - percent / 100);

            progress.style.transition = "none";
            progress.style.width = `${percent}%`;
        }
    }
}


function resumePATRIODXStoryProgress() {
    if (!patriodxStoryProgressPaused) return;

    patriodxStoryProgressPaused = false;

    const progress = document.getElementById("storyViewerProgress");
    const video = document.querySelector("#storyViewerContent video");

    if (video) {
        video.play().catch(() => {});
        return;
    }

    if (!progress) return;

    const remaining = Math.max(0, patriodxStoryProgressRemaining);

    if (remaining <= 0) {
        showNextPATRIODXStory();
        return;
    }

    patriodxStoryProgressStartedAt = Date.now();

    requestAnimationFrame(() => {
        if (patriodxStoryProgressPaused) return;

        progress.style.transition = `width ${remaining}ms linear`;
        progress.style.width = "100%";
    });

    patriodxStoryViewerTimer = setTimeout(() => {
        if (!patriodxStoryProgressPaused) {
            showNextPATRIODXStory();
        }
    }, remaining);
}

function showPreviousPATRIODXStory() {

    if (
        patriodxStoryViewerIndex <= 0
    ) {

        return;
    }

    patriodxStoryViewerIndex--;

    renderPATRIODXStoryViewer();
}


function showNextPATRIODXStory() {

    if (
        patriodxStoryViewerIndex >=
        patriodxStoryViewerStories.length - 1
    ) {

        closePATRIODXStoryViewer();

        return;
    }

    patriodxStoryViewerIndex++;

    renderPATRIODXStoryViewer();
}


function closePATRIODXStoryViewer() {

    clearTimeout(
        patriodxStoryViewerTimer
    );

    const viewer =
        document.getElementById(
            "patriodxStoryViewer"
        );

    if (viewer) {
        viewer.style.display = "none";
    }

    document.body.style.overflow = "";

    const progress =
        document.getElementById(
            "storyViewerProgress"
        );

    if (progress) {

        progress.style.transition = "none";

        progress.style.width = "0%";
    }

    const viewerContent =
        document.getElementById(
            "storyViewerContent"
        );

    if (viewerContent) {
        viewerContent.innerHTML = "";
    }
}


function formatPATRIODXStoryTime(
    createdAt
) {

    if (!createdAt) {
        return "Just now";
    }

    const created =
        new Date(createdAt);

    const now =
        new Date();

    const difference =
        Math.floor(
            (now - created) / 1000
        );

    if (difference < 60) {
        return "Just now";
    }

    const minutes =
        Math.floor(
            difference / 60
        );

    if (minutes < 60) {
        return (
            minutes +
            (minutes === 1
                ? " minute ago"
                : " minutes ago")
        );
    }

    const hours =
        Math.floor(
            minutes / 60
        );

    if (hours < 24) {
        return (
            hours +
            (hours === 1
                ? " hour ago"
                : " hours ago")
        );
    }

    const days =
        Math.floor(
            hours / 24
        );

    return (
        days +
        (days === 1
            ? " day ago"
            : " days ago")
    );
}


function setupPATRIODXStoryViewer() {

    const closeButton =
        document.getElementById(
            "storyViewerClose"
        );

    const previousButton =
        document.getElementById(
            "storyViewerPrevious"
        );

    const nextButton =
        document.getElementById(
            "storyViewerNext"
        );

    if (
        !closeButton ||
        !previousButton ||
        !nextButton
    ) {
        return;
    }

    if (
        closeButton.dataset.ready === "true"
    ) {
        return;
    }

    closeButton.dataset.ready = "true";
const storyContent = document.getElementById("storyViewerContent");

if (storyContent && storyContent.dataset.pauseReady !== "true") {
    storyContent.dataset.pauseReady = "true";

    let storyPointerStartX = 0;
    let storyPointerStartY = 0;
    let storyPointerStartTime = 0;

    storyContent.addEventListener("pointerdown", event => {
        if (event.target.closest("video, button, input")) return;

        storyPointerStartX = event.clientX;
        storyPointerStartY = event.clientY;
        storyPointerStartTime = Date.now();

        pausePATRIODXStoryProgress();
    });

    storyContent.addEventListener("pointerup", event => {
        if (event.target.closest("video, button, input")) {
            resumePATRIODXStoryProgress();
            return;
        }

        const deltaX = Math.abs(event.clientX - storyPointerStartX);
        const deltaY = Math.abs(event.clientY - storyPointerStartY);
        const elapsed = Date.now() - storyPointerStartTime;

        // Ignore long presses and swipes.
        if (elapsed > 300 || deltaX > 15 || deltaY > 15) {
            resumePATRIODXStoryProgress();
            return;
        }

        // Resume the current story before navigating.
        resumePATRIODXStoryProgress();

        const bounds = storyContent.getBoundingClientRect();
        const tapX = event.clientX - bounds.left;

        if (tapX < bounds.width / 2) {
            showPreviousPATRIODXStory();
        } else {
            showNextPATRIODXStory();
        }
    });

    ["pointercancel", "pointerleave"].forEach(type => {
        storyContent.addEventListener(type, () => {
            resumePATRIODXStoryProgress();
        });
    });
}
    closeButton.addEventListener(
        "click",
        function () {

            closePATRIODXStoryViewer();

        }
    );

    previousButton.addEventListener(
        "click",
        function () {

            showPreviousPATRIODXStory();

        }
    );

    nextButton.addEventListener(
        "click",
        function () {

            showNextPATRIODXStory();

        }
    );

    document.addEventListener(
        "keydown",
        function (event) {

            const viewer =
                document.getElementById(
                    "patriodxStoryViewer"
                );

            if (
                !viewer ||
                viewer.style.display === "none"
            ) {
                return;
            }

            if (event.key === "Escape") {

                closePATRIODXStoryViewer();

            }

            if (event.key === "ArrowLeft") {

                showPreviousPATRIODXStory();

            }

            if (event.key === "ArrowRight") {

                showNextPATRIODXStory();

            }

        }
    );
}
// =========================================================
// PATRIODX HOME — MARKETPLACE PRODUCTS
// =========================================================

async function loadHomeMarketplaceProducts() {
    try {
        const { data: products, error } = await supabaseClient
            .from("marketplace_products")
            .select(
                "id,business_id,name,description,category,price,image_url,in_stock,created_at"
            )
            .order("created_at", { ascending: false })
            .limit(12);

        if (error) throw error;

        const items = products || [];

        if (!items.length) return [];

        const businessIds = [
            ...new Set(items.map(p => p.business_id).filter(Boolean))
        ];

        let sellerMap = {};

        if (businessIds.length) {
            const { data: businesses, error: businessError } =
                await supabaseClient
                    .from("businesses")
                    .select("id,owner_id")
                    .in("id", businessIds);

            if (businessError) throw businessError;

            const ownerIds = [
                ...new Set(
                    (businesses || [])
                        .map(b => b.owner_id)
                        .filter(Boolean)
                )
            ];

            if (ownerIds.length) {
                const { data: profiles, error: profileError } =
                    await supabaseClient
                        .from("profiles")
                        .select(
                            "id,username,display_name,avatar_url,is_verified,is_owner,verification_expires_at"
                        )
                        .in("id", ownerIds);

                if (profileError) throw profileError;

                const profileMap = new Map(
                    (profiles || []).map(profile => [
                        profile.id,
                        profile
                    ])
                );

                (businesses || []).forEach(business => {
                    const profile = profileMap.get(business.owner_id);

                    if (profile) {
                        sellerMap[business.id] = profile;
                    }
                });
            }
        }

        return items.map(product => ({
            ...product,
            seller: sellerMap[product.business_id] || null
        }));
    } catch (error) {
        console.error(
            "PATRIODX Home marketplace products could not load:",
            error
        );

        // Product failures must not stop social posts from loading.
        return [];
    }
}


// =========================================================
// RENDER HOME MARKETPLACE PRODUCTS
// =========================================================

function renderHomeMarketplaceProducts(products) {
    if (!products || !products.length) return "";

    const cards = products.slice(0, 3).map(product => {
        const seller = product.seller;
        const sellerName =
            seller?.display_name ||
            (seller?.username ? `@${seller.username}` : "PATRIODX Seller");

        const image = product.image_url
            ? `<img
                    class="home-marketplace-product-image"
                    src="${safe(product.image_url)}"
                    alt="${safe(product.name || "Product")}"
                    loading="lazy"
                    onerror="this.style.display='none'"
               >`
            : `<div class="home-marketplace-product-image"
                    style="display:grid;place-items:center;font-size:36px">
                    🛍️
               </div>`;

        const badge =
            seller && typeof getPATRIODXBadge === "function"
                ? getPATRIODXBadge(seller)
                : "";

        const price = Number(product.price);
        const priceText = Number.isFinite(price)
            ? `$${price.toFixed(2)}`
            : "Price unavailable";

        return `
            <article class="home-marketplace-product">
                ${image}

                <div class="home-marketplace-product-details">
                    <h4 class="home-marketplace-product-name">
                        ${safe(product.name || "Unnamed product")}
                    </h4>

                    <div class="home-marketplace-product-price">
                        ${priceText}
                    </div>

                    <div class="home-marketplace-product-seller">
                        Seller:
                        ${
                            seller?.id
                                ? `<button
                                    type="button"
                                    class="home-marketplace-seller-link"
                                    data-home-seller-id="${safe(seller.id)}"
                                   >${safe(sellerName)}</button>`
                                : safe(sellerName)
                        }
                        ${badge}
                    </div>

                    <div class="home-marketplace-product-status ${
                        product.in_stock === false ? "is-unavailable" : ""
                    }">
                        ${
                            product.in_stock === false
                                ? "Out of stock"
                                : "Available"
                        }
                    </div>

                    <a
                        class="home-marketplace-open"
                        href="marketplace.html"
                    >Visit Marketplace</a>
                </div>
            </article>
        `;
    }).join("");

    return `
        <section class="home-marketplace-insert"
                 aria-label="Marketplace picks">
            <div class="home-marketplace-heading">
                <div>
                    <h3>Marketplace Picks</h3>
                    <p>Discover products from PATRIODX sellers.</p>
                </div>

                <a class="home-marketplace-view-all"
                   href="marketplace.html">
                    View all
                </a>
            </div>

            <div class="home-marketplace-grid">
                ${cards}
            </div>
        </section>
    `;
}
async function loadSocialPosts() {

    await loadPATRIODXStories();

    if (!socialFeed) {
        return;
    }
    /* =========================================================
       LOADING STATE
    ========================================================= */

    socialFeed.innerHTML = `
        <div class="social-empty-state">

            <div class="social-empty-icon">
                <i data-lucide="clock-3"></i>
            </div>

            <h3>Loading posts...</h3>

            <p>Please wait.</p>

        </div>
    `;


    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }


    /* =========================================================
       DETERMINE FEED MODE
    ========================================================= */

    const mode =
        socialFeedMode === "following"
            ? "following"
            : "latest";


    /* =========================================================
       LOAD POSTS
    ========================================================= */

    let posts = [];
    let error = null;


    /* =========================================================
       LATEST FEED
    ========================================================= */

    if (mode === "latest") {

        const result =
            await supabaseClient
                .from("posts")
                .select("*")
                .order("created_at", {
                    ascending: false
                });

        posts = result.data || [];
        error = result.error;

    }


    /* =========================================================
       FOLLOWING FEED
    ========================================================= */

    if (mode === "following") {

        if (!currentUser) {

            socialFeed.innerHTML = `
                <div class="social-empty-state">

                    <div class="social-empty-icon">
                        <i data-lucide="user"></i>
                    </div>

                    <h3>Please sign in</h3>

                    <p>
                        Sign in to see posts from people you follow.
                    </p>

                </div>
            `;

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            return;
        }


        /* -----------------------------------------------------
           Get people the current user follows
        ----------------------------------------------------- */

        const {
            data: follows,
            error: followsError
        } = await supabaseClient
            .from("profile_follows")
            .select("following_id")
            .eq(
                "follower_id",
                currentUser.id
            );


        if (followsError) {

            console.error(
                "Could not load followed users:",
                followsError
            );

            socialFeed.innerHTML = `
                <div class="social-empty-state">

                    <div class="social-empty-icon">
                        <i data-lucide="triangle-alert"></i>
                    </div>

                    <h3>Could not load Following feed</h3>

                    <p>
                        ${safe(followsError.message)}
                    </p>

                </div>
            `;

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            return;
        }


        const followingIds =
            (follows || [])
                .map(row => row.following_id)
                .filter(Boolean);


        /* -----------------------------------------------------
           No followed accounts
        ----------------------------------------------------- */

        if (followingIds.length === 0) {

            socialFeed.innerHTML = `
                <div class="social-empty-state">

                    <div class="social-empty-icon">
                        <i data-lucide="users"></i>
                    </div>

                    <h3>Your Following feed is empty</h3>

                    <p>
                        Follow people on PATRIODX to see
                        their posts here.
                    </p>

                    <button
                        type="button"
                        class="secondary-btn"
                        onclick="navigatePATRIODX('profile')"
                    >
                        <i data-lucide="search"></i>
                        Find People
                    </button>

                </div>
            `;

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            return;
        }


        /* -----------------------------------------------------
           Load posts from followed users
        ----------------------------------------------------- */

        const result =
            await supabaseClient
                .from("posts")
                .select("*")
                .in(
                    "user_id",
                    followingIds
                )
                .order("created_at", {
                    ascending: false
                });

        posts = result.data || [];
        error = result.error;

    }


    /* =========================================================
       POST QUERY ERROR
    ========================================================= */

    if (error) {

        console.error(
            "Could not load social posts:",
            error
        );

        socialFeed.innerHTML = `
            <div class="social-empty-state">

                <div class="social-empty-icon">
                    <i data-lucide="triangle-alert"></i>
                </div>

                <h3>Could not load posts</h3>

                <p>
                    ${safe(error.message)}
                </p>

            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    /* =========================================================
       NO POSTS
    ========================================================= */

    if (!posts || posts.length === 0) {

        const emptyTitle =
            mode === "following"
                ? "No posts from people you follow"
                : "No posts yet";


        const emptyText =
            mode === "following"
                ? "Follow people on PATRIODX to build your feed."
                : "Be the first to share something with the PATRIODX community.";


        socialFeed.innerHTML = `
            <div class="social-empty-state">

                <div class="social-empty-icon">

                    <i data-lucide="${
                        mode === "following"
                            ? "users"
                            : "globe"
                    }"></i>

                </div>

                <h3>${emptyTitle}</h3>

                <p>
                    ${emptyText}
                </p>

                ${
                    mode === "latest"
                        ? `
                            <button
                                type="button"
                                class="secondary-btn"
                                onclick="document.getElementById('socialPostContent')?.focus()"
                            >
                                <i data-lucide="plus"></i>
                                Create Your First Post
                            </button>
                        `
                        : `
                            <button
                                type="button"
                                class="secondary-btn"
                                onclick="navigatePATRIODX('profile')"
                            >
                                <i data-lucide="search"></i>
                                Find People
                            </button>
                        `
                }

            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }

/* =========================================================
   LOAD POST AUTHOR PROFILES
========================================================= */

const postUserIds = [
    ...new Set(
        posts
            .map(post => post.user_id)
            .filter(Boolean)
    )
];

let postProfiles = [];

if (postUserIds.length) {

    const { data: profileData, error: profileError } =
        await supabaseClient
            .from("profiles")
           .select(
    "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
)
            .in(
                "id",
                postUserIds
            );

    if (profileError) {

        console.error(
            "Could not load post author profiles:",
            profileError
        );

    } else {

        postProfiles =
            profileData || [];

    }
}

const postProfileMap =
    new Map(
        postProfiles.map(
            profile => [
                profile.id,
                profile
            ]
        )
    );
    /* =========================================================
       GET LIKE / COMMENT COUNTS
    ========================================================= */

    const postsWithCounts =
        await Promise.all(
            posts.map(async post => {

                try {

                    const counts =
                        await getSocialCounts(post.id);

                    return {
                        ...post,
                        likes:
                            Number(
                                counts?.likes || 0
                            ),
                        comments:
                            Number(
                                counts?.comments || 0
                            )
                    };

                } catch (error) {

                    console.error(
                        "Could not get social counts:",
                        error
                    );

                    return {
                        ...post,
                        likes: 0,
                        comments: 0
                    };

                }

            })
        );

// Load marketplace products only for the Latest feed.
const homeMarketplaceProducts =
    mode === "latest"
        ? await loadHomeMarketplaceProducts()
        : [];
    /* =========================================================
       RENDER FEED
    ========================================================= */

    socialFeed.innerHTML =
        postsWithCounts
                   .map((post, postIndex) => {

                const isOwnPost =
                    post.user_id === currentUser?.id;


               const authorProfile =
    postProfileMap.get(
        post.user_id
    );

const author =
    authorProfile?.display_name ||
    authorProfile?.username ||
    (
        isOwnPost
            ? (
                currentBusiness?.name ||
                currentUser?.user_metadata?.business_name ||
                currentUser?.user_metadata?.full_name ||
                currentUser?.email ||
                "You"
            )
            : "PATRIODX User"
    );


                const image =
                    post.image_url
                        ? `
                            <div class="social-media-wrapper">

                                <img
                                    src="${safe(post.image_url)}"
                                    class="social-post-image"
                                    alt="Post image"
                                    loading="lazy"
                                >

                            </div>
                        `
                        : "";


                const video =
                    post.video_url
                        ? `
                            <div class="social-media-wrapper">

                                <video
                                    src="${safe(post.video_url)}"
                                    class="social-post-video"
                                    controls
                                    preload="metadata"
                                ></video>

                            </div>
                        `
                        : "";


                return `
                    <article
                        class="social-post-card"
                        id="social-post-${post.id}"
                    >

                        <!-- POST HEADER -->

                        <div class="social-post-header">

                       <div
    class="social-post-avatar"
    ${authorProfile?.id ? `role="button" tabindex="0" data-profile-user-id="${safe(authorProfile.id)}" aria-label="View ${safe(author)}'s profile"` : ""}
>
    ${
        authorProfile?.avatar_url
            ? `
                <img
                    src="${safe(authorProfile.avatar_url)}"
                    alt="${safe(author)}"
                    loading="lazy"
                >
            `
            : `
                <span>
                    ${safe(
                        (author || "P")
                            .charAt(0)
                            .toUpperCase()
                    )}
                </span>
            `
    }
</div>
                            <div class="social-post-author-area">

                               <div
    class="social-post-author"
    ${authorProfile?.id ? `role="button" tabindex="0" data-profile-user-id="${safe(authorProfile.id)}" aria-label="View ${safe(author)}'s profile"` : ""}
>
   ${safe(author)}

                                    ${
                                        typeof getPATRIODXBadge === "function"
                                            ? getPATRIODXBadge(authorProfile)
                                            : ""
                                    }

                                    ${
                                        isOwnPost
                                            ? `
                                                <span class="social-post-you">
                                                    You
                                                </span>
                                            `
                                            : ""
                                    }

                                </div>


                                <div class="social-post-date">
                                    ${formatDate(post.created_at)}
                                </div>

                            </div>

                            <div class="social-post-menu-actions">

                                <button
                                    type="button"
                                    class="social-post-icon-button social-post-menu-toggle"
                                    onclick="toggleSocialPostMenu('${post.id}', event)"
                                    title="Post options"
                                    aria-label="Post options"
                                    aria-expanded="false"
                                    aria-controls="social-post-menu-${post.id}"
                                >
                                    <i data-lucide="more-horizontal"></i>
                                </button>

                                <div
                                    class="social-post-dropdown"
                                    id="social-post-menu-${post.id}"
                                    hidden
                                >
                                    <button
                                        type="button"
                                        class="social-post-menu-item"
                                        onclick="saveSocialPost('${post.id}')"
                                    >
                                        <i data-lucide="bookmark"></i>
                                        <span>Save post</span>
                                    </button>

                                    ${
                                        isOwnPost
                                            ? `
                                                <button
                                                    type="button"
                                                    class="social-post-menu-item"
                                                    onclick="toggleSocialPostSetting('${post.id}', 'hide_like_count', ${!post.hide_like_count})"
                                                >
                                                    <i data-lucide="heart"></i>
                                                    <span>${post.hide_like_count ? "Show like count" : "Hide like count"}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    class="social-post-menu-item"
                                                    onclick="toggleSocialPostSetting('${post.id}', 'hide_share_count', ${!post.hide_share_count})"
                                                >
                                                    <i data-lucide="share-2"></i>
                                                    <span>${post.hide_share_count ? "Show share count" : "Hide share count"}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    class="social-post-menu-item"
                                                    onclick="toggleSocialPostSetting('${post.id}', 'comments_enabled', ${post.comments_enabled === false})"
                                                >
                                                    <i data-lucide="message-circle"></i>
                                                    <span>${post.comments_enabled === false ? "Turn on commenting" : "Turn off commenting"}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    class="social-post-menu-item"
                                                    onclick="editSocialPost('${post.id}')"
                                                    ${Date.now() - new Date(post.created_at).getTime() > 15 * 60 * 1000 ? "disabled" : ""}
                                                >
                                                    <i data-lucide="pencil"></i>
                                                    <span>Edit post</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    class="social-post-menu-item"
                                                    onclick="toggleSocialPostSetting('${post.id}', 'is_pinned', ${!post.is_pinned})"
                                                >
                                                    <i data-lucide="pin"></i>
                                                    <span>${post.is_pinned ? "Unpin from profile" : "Pin to profile"}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    class="social-post-menu-item social-post-delete-item"
                                                    onclick="deleteSocialPost('${post.id}')"
                                                >
                                                    <i data-lucide="trash-2"></i>
                                                    <span>Delete post</span>
                                                </button>
                                            `
                                            : `
                                                <button
                                                    type="button"
                                                    class="social-post-menu-item"
                                                    onclick="reportSocialPost('${post.id}')"
                                                >
                                                    <i data-lucide="flag"></i>
                                                    <span>Report post</span>
                                                </button>
                                            `
                                    }
                                                               </div>

                            </div>

                        </div>
                        <!-- POST CONTENT -->
                        ${
                            post.content
                                ? `
                                   <div class="social-post-content">
    ${renderClickableMentions(post.content)}
</div>
                                `
                                : ""
                        }


                        <!-- MEDIA -->

                        ${image}

                        ${video}


                        <!-- LIKE / COMMENT COUNTS -->

                        <div
                            class="social-post-stats"
                            id="social-stats-${post.id}"
                        >

                            <span class="social-like-stat">

                                <i data-lucide="heart"></i>

                                <strong>
                                    ${post.likes}
                                </strong>

                                <span>
                                    ${
                                        post.likes === 1
                                            ? "Like"
                                            : "Likes"
                                    }
                                </span>

                            </span>


                            <button
                                type="button"
                                class="social-comment-stat"
                                onclick="toggleComments('${post.id}')"
                            >

                                <i data-lucide="message-circle"></i>

                                <strong>
                                    ${post.comments}
                                </strong>

                                <span>
                                    ${
                                        post.comments === 1
                                            ? "Comment"
                                            : "Comments"
                                    }
                                </span>

                            </button>

                        </div>


                    
                    <!-- ACTION BAR -->

                   <div class="social-post-actions-bar">

    <button
        type="button"
        class="social-action-button social-like-button"
        data-post-id="${post.id}"
        onclick="likeSocialPost('${post.id}')"
        aria-label="Like post"
        title="Like"
    >
        <i data-lucide="heart"></i>
        <span>Like</span>
    </button>

    <button
        type="button"
        class="social-action-button"
        onclick="toggleHomeComments('${post.id}')"
        aria-label="View comments"
        title="Comment"
    >
        <i data-lucide="message-circle"></i>
        <span>Comment</span>
    </button>

    <button
        type="button"
        class="social-action-button"
        onclick="shareSocialPost('${post.id}')"
        aria-label="Share post"
        title="Share"
    >
        <i data-lucide="share-2"></i>
        <span>Share</span>
    </button>

</div>

                        <!-- COMMENTS -->

                        <div
                            id="comments-${post.id}"
                            class="social-comments"
                            style="display:none;"
                        >

                            <div
                                id="comments-list-${post.id}"
                                class="social-comments-list"
                            >
                                <p class="social-comments-loading">
                                    Loading comments...
                                </p>
                            </div>


                            <form
                                class="social-comment-form"
                                onsubmit="submitSocialComment(event, '${post.id}')"
                            >

                                <input
                                    type="text"
                                    id="comment-input-${post.id}"
                                    placeholder="Write a comment..."
                                    maxlength="1000"
                                    autocomplete="off"
                                    required
                                >


                                <button
                                    type="submit"
                                    aria-label="Send comment"
                                >
                                    <i data-lucide="send"></i>
                                </button>

                            </form>

                        </div>

                </article>
            ` + (
                mode === "latest" &&
                (postIndex + 1) % 3 === 0 &&
                homeMarketplaceProducts.length
                    ? renderHomeMarketplaceProducts(
                        homeMarketplaceProducts.slice(
                            ((Math.floor(postIndex / 3)) * 3) %
                            homeMarketplaceProducts.length,
                            ((Math.floor(postIndex / 3)) * 3) %
                            homeMarketplaceProducts.length + 3
                        )
                    )
                    : ""
            );

        })
        .join("");


// Open a user's public profile from their post name or avatar.
socialFeed
    .querySelectorAll("[data-profile-user-id]")
    .forEach(element => {
        element.addEventListener("click", function () {
            const userId = this.getAttribute("data-profile-user-id");

            if (userId && typeof loadPublicProfile === "function") {
                loadPublicProfile(userId);

                const publicProfileCard =
                    document.getElementById("publicProfileCard");

                if (publicProfileCard) {
                    publicProfileCard.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            }
        });

        element.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                this.click();
            }
        });
    });
    /* =========================================================
       LUCIDE
    ========================================================= */

  if (typeof lucide !== "undefined") {

    requestAnimationFrame(() => {
        lucide.createIcons();
    });

}

// Restore each post's saved like state.
if (currentUser && typeof updateSocialLikeButton === "function") {

    requestAnimationFrame(async () => {

        const likeButtons = document.querySelectorAll(
            ".social-like-button[data-post-id]"
        );

        const postIds = [
            ...new Set(
                Array.from(likeButtons).map(
                    button => button.dataset.postId
                )
            )
        ];

        for (const postId of postIds) {

            try {

                await updateSocialLikeButton(postId);

            } catch (error) {

                console.error(
                    "Could not restore post like state:",
                    postId,
                    error
                );

            }

        }

    });

}

setupSocialFeedTabs();

}

/* =========================================================
   CREATE POST
========================================================= */

if (socialPostForm) {

    socialPostForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();

            if (!currentUser) {
                showPATRIODXToast(
                    "Please log in before creating a post.",
                    "warning"
                );
                return;
            }

            const content =
                document
                    .getElementById("socialPostContent")
                    .value
                    .trim();

            if (!content && !selectedSocialFile) {
                showPATRIODXToast(
                    "Please write something or select a photo/video.",
                    "warning"
                );
                return;
            }

            const button =
                document.getElementById("socialPostButton");

            button.disabled = true;
            button.textContent = "Uploading...";

            try {

                let imageUrl = null;
                let videoUrl = null;

                if (selectedSocialFile) {

                    const uploadedUrl =
                        await uploadSocialMedia(
                            selectedSocialFile
                        );

                    if (
                        selectedSocialFile.type
                            .startsWith("image/")
                    ) {
                        imageUrl = uploadedUrl;
                    } else {
                        videoUrl = uploadedUrl;
                    }
                }

                // Create the post and retrieve its ID.
                const { data: newPost, error } =
                    await supabaseClient
                        .from("posts")
                        .insert({
                            user_id: currentUser.id,

                            business_id:
                                currentBusiness?.id || null,

                            content: content || null,

                            image_url: imageUrl,

                            video_url: videoUrl
                        })
                        .select("id")
                        .single();

                if (error) {
                    throw error;
                }

                // Notify users tagged in the post.
                if (content && newPost?.id) {

                    try {

                        const usernames = [
                            ...new Set(
                                Array.from(
                                    content.matchAll(
                                        /(^|[\s(])@([A-Za-z0-9_.-]{2,30})\b/g
                                    ).map(match => match[2])
                                )
                            )];

                        if (usernames.length > 0) {

                            const { data: taggedProfiles, error: profileError } =
                                await supabaseClient
                                    .from("profiles")
                                    .select("id, username")
                                    .in("username", usernames);

                            if (profileError) {
                                throw profileError;
                            }

                            const notifications = (
                                taggedProfiles || []
                            )
                                .filter(profile =>
                                    profile.id !== currentUser.id
                                )
                                .map(profile => ({
                                    user_id: profile.id,
                                    type: "tag",
                                    title: "You were tagged",
                                    message:
                                        `${currentUser.username || "Someone"} tagged you in a post.`,
                                    related_id: newPost.id,
                                    is_read: false
                                }));

                            if (notifications.length > 0) {

                                const { error: notificationError } =
                                    await supabaseClient
                                        .from("notifications")
                                        .insert(notifications);

                                if (notificationError) {
                                    console.error(
                                        "Could not create tag notifications:",
                                        notificationError
                                    );

                                    showPATRIODXToast(
                                        "Your post was published, but some tag notifications could not be sent.",
                                        "warning"
                                    );
                                }
                            }
                        }

                    } catch (notificationError) {

                        // A notification failure must not undo a published post.
                        console.error(
                            "Tag notification error:",
                            notificationError
                        );
                    }
                }

                document
                    .getElementById("socialPostContent")
                    .value = "";

                clearSocialMedia();

                button.disabled = false;

                button.innerHTML =
                    '<i data-lucide="megaphone"></i> Post';

                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }

                await loadSocialPosts();

                showPATRIODXToast(
                    "Your post was published successfully!",
                    "success"
                );

            } catch (error) {

                console.error(
                    "Could not create post:",
                    error
                );

                showPATRIODXToast(
                    "Could not create your post. " +
                    error.message,
                    "error"
                );

                button.disabled = false;

                button.innerHTML =
                    '<i data-lucide="megaphone"></i> Post';

                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            }
        }
    );
}



/* =========================================================
   LIKE POST
========================================================= */

async function likeSocialPost(postId) {

    if (!currentUser) {

        showPATRIODXToast(
            "Please log in to like posts.",
            "warning"
        );

        return;
    }

    try {

        const alreadyLiked =
            await hasLikedSocialPost(postId);

        if (alreadyLiked) {

            const { error } =
                await supabaseClient
                    .from("post_likes")
                    .delete()
                    .eq(
                        "post_id",
                        postId
                    )
                    .eq(
                        "user_id",
                        currentUser.id
                    );

            if (error) {
                throw error;
            }

        } else {

            const { error } =
                await supabaseClient
                    .from("post_likes")
                    .insert({
                        post_id:
                            postId,

                        user_id:
                            currentUser.id
                    });

            if (error) {
                throw error;
            }
        }

        await refreshSocialPostStats(
            postId
        );

        await refreshHomePostStats(
            postId
        );

        await updateSocialLikeButton(
            postId
        );

    } catch (error) {

        console.error(
            "Like toggle error:",
            error
        );

        showPATRIODXToast(
            "Could not update your like. " +
            error.message,
            "error"
        );
    }
}
async function updateSocialLikeButton(postId) {

    const buttons = document.querySelectorAll(
        `.social-like-button[data-post-id="${postId}"]`
    );

    if (buttons.length === 0) {
        return;
    }

    const liked = await hasLikedSocialPost(postId);

    buttons.forEach((button) => {

        button.classList.toggle("liked", liked);

      const heart = button.querySelector("i");

if (heart) {
    heart.setAttribute("data-lucide", "heart");
}

        button.setAttribute(
            "aria-label",
            liked ? "Unlike post" : "Like post"
        );

        button.title = liked ? "Unlike" : "Like";

    });

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
/* =========================================================
REFRESH POST COUNTS
========================================================= */

async function refreshSocialPostStats(postId) {
if (!postId) return;


try {
    const stats = await getSocialCounts(postId);

    const statsElement = document.getElementById(
        `social-stats-${postId}`
    );

    if (!statsElement) return;

    statsElement.innerHTML = `
        <span>
            <i data-lucide="heart"></i> ${stats.likes}
        </span>
        <span>
            <i data-lucide="message-circle"></i> ${stats.comments}
        </span>
    `;

    if (window.lucide) {
        window.lucide.createIcons();
    }
} catch (error) {
    console.error(
        "PATRIODX: Could not refresh social post statistics:",
        error
    );
}


}

/* =========================================================
   TOGGLE COMMENTS
========================================================= */

async function toggleComments(postId) {

    const commentsBox =
        document.getElementById(
            `comments-${postId}`
        );


    if (!commentsBox) return;


    if (
        commentsBox.style.display === "none" ||
        commentsBox.style.display === ""
    ) {

        commentsBox.style.display =
            "block";

        await loadSocialComments(
            postId
        );

    } else {

        commentsBox.style.display =
            "none";
    }
}


/* =========================================================
   LOAD COMMENTS
========================================================= */

async function loadSocialComments(postId) {

    const commentsList =
        document.getElementById(
            `comments-list-${postId}`
        );


    if (!commentsList) return;


    commentsList.innerHTML =
        "<p>Loading comments...</p>";


    const { data: comments, error } =
        await supabaseClient
            .from("comments")
            .select("*")
            .eq(
                "post_id",
                postId
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Could not load comments:",
            error
        );

        commentsList.innerHTML =
            "<p>Could not load comments.</p>";

        return;
    }


    if (!comments || comments.length === 0) {

        commentsList.innerHTML =
            "<p>No comments yet. Be the first!</p>";

        return;
    }


   const commentUserIds = [
    ...new Set(
        comments
            .map(comment => comment.user_id)
            .filter(Boolean)
    )
];

let commentProfiles = [];

if (commentUserIds.length) {

    const { data: profileData, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select(
                "id, username, display_name, avatar_url"
            )
            .in(
                "id",
                commentUserIds
            );

    if (profileError) {

        console.error(
            "Could not load comment author profiles:",
            profileError
        );

    } else {

        commentProfiles =
            profileData || [];
    }
}

const commentProfileMap =
    new Map(
        commentProfiles.map(
            profile => [
                profile.id,
                profile
            ]
        )
    );


commentsList.innerHTML =
    comments
        .map(comment => {

            const commentProfile =
                commentProfileMap.get(comment.user_id);

            const isOwnComment =
                comment.user_id === currentUser?.id;

            const author = isOwnComment
                ? "You"
                : (
                    commentProfile?.display_name ||
                    commentProfile?.username ||
                    "PATRIODX User"
                );

            const profileButton = commentProfile?.id
                ? `
                    data-profile-user-id="${safe(commentProfile.id)}"
                    role="button"
                    tabindex="0"
                    aria-label="View ${safe(author)}'s profile"
                `
                : "";

            return `
                <div class="social-comment">

                    <div
                        class="social-comment-avatar"
                        ${profileButton}
                    >
                        ${
                            commentProfile?.avatar_url
                                ? `
                                    <img
                                        src="${safe(commentProfile.avatar_url)}"
                                        alt="${safe(author)}"
                                        loading="lazy"
                                    >
                                `
                                : `
                                    <span>
                                        ${safe(
                                            (author || "P")
                                                .charAt(0)
                                                .toUpperCase()
                                        )}
                                    </span>
                                `
                        }
                    </div>

                    <div class="social-comment-content">

                        <strong
                            ${profileButton}
                        >
                            ${safe(author)}
                        </strong>

                        <p>${safe(comment.content)}</p>

                        <small>
                            ${formatDate(comment.created_at)}
                        </small>

                    </div>

                </div>
            `;
        })
        .join("");

// Open the commenter's public profile when clicked.
commentsList
    .querySelectorAll("[data-profile-user-id]")
    .forEach(element => {

        element.style.cursor = "pointer";

        element.addEventListener("click", function () {

            const userId =
                this.getAttribute("data-profile-user-id");

            if (userId && typeof loadPublicProfile === "function") {

                loadPublicProfile(userId);

                const profileCard =
                    document.getElementById("publicProfileCard");

                if (profileCard) {
                    profileCard.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            }
        });

        element.addEventListener("keydown", function (event) {

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                this.click();
            }
        });
    });
    await refreshSocialPostStats(
        postId
    );
}


/* =========================================================
   SUBMIT COMMENT
========================================================= */

async function submitSocialComment(
    event,
    postId
) {

    event.preventDefault();


 if (!currentUser) {

    showPATRIODXToast(
        "Please log in before commenting.",
        "warning"
    );

    return;
}

    const input =
        document.getElementById(
            `comment-input-${postId}`
        );


    if (!input) return;


    const content =
        input.value.trim();


    if (!content) return;


    const form =
        event.target;


    const button =
        form.querySelector(
            "button[type='submit']"
        );


    button.disabled = true;

    button.textContent =
        "Sending...";


    const { error } =
        await supabaseClient
            .from("comments")
            .insert({

                post_id:
                    postId,

                user_id:
                    currentUser.id,

                content:
                    content

            });


    if (error) {

        console.error(
            "Comment error:",
            error
        );
showPATRIODXToast(
    "Could not add comment. " +
    error.message,
    "error"
);

        button.disabled = false;

        button.textContent =
            "Send";

        return;
    }

/* =========================================================
   COMMENT NOTIFICATION
========================================================= */

const { data: postData, error: postError } =
    await supabaseClient
        .from("posts")
        .select("user_id")
        .eq("id", postId)
        .single();

if (postError) {

    console.error(
        "Could not find post owner:",
        postError
    );

} else if (
    postData?.user_id &&
    postData.user_id !== currentUser.id
) {

    const { data: commenterProfile } =
        await supabaseClient
            .from("profiles")
            .select(
                "display_name, username"
            )
            .eq(
                "id",
                currentUser.id
            )
            .single();

    const commenterName =
        commenterProfile?.display_name ||
        commenterProfile?.username ||
        "PATRIODX User";

    const { error: notificationError } =
        await supabaseClient
            .from("notifications")
           .insert({
    user_id: postData.user_id,
    sender_id: currentUser.id,
    type: "comment",
    title: `${commenterName} commented on your post`,
    message: content
});
    if (notificationError) {

        console.error(
            "Comment notification error:",
            notificationError
        );

    }
}
    input.value = "";

    button.disabled = false;

    button.textContent =
        "Send";


    await loadSocialComments(
        postId
    );
}


/* =========================================================
   DELETE OWN POST
========================================================= */

async function deleteSocialPost(postId) {
    if (!currentUser) {
        showPATRIODXToast(
            "Please sign in to delete a post.",
            "warning"
        );
        return;
    }

    if (typeof showPATRIODXConfirm !== "function") {
        showPATRIODXToast(
            "The confirmation dialog is unavailable.",
            "error"
        );
        return;
    }

    try {
        const confirmed = await showPATRIODXConfirm(
            "Delete Post",
            "Delete this post? This cannot be undone."
        );

        if (!confirmed) return;

        const { data: post, error: postError } =
            await supabaseClient
                .from("posts")
                .select("id,user_id,image_url,video_url")
                .eq("id", postId)
                .maybeSingle();

        if (postError) throw postError;

        if (!post) {
            showPATRIODXToast(
                "This post could not be found.",
                "error"
            );
            return;
        }

        if (post.user_id !== currentUser.id) {
            showPATRIODXToast(
                "You can only delete your own posts.",
                "warning"
            );
            return;
        }

        const { data: deletedPosts, error: deleteError } =
            await supabaseClient
                .from("posts")
                .delete()
                .eq("id", postId)
                .eq("user_id", currentUser.id)
                .select("id");

        if (deleteError) throw deleteError;

        if (!deletedPosts || deletedPosts.length === 0) {
            showPATRIODXToast(
                "The post was not deleted. Check your permissions and try again.",
                "error"
            );
            return;
        }

        // Remove the associated media file when possible.
        const mediaUrl = post.image_url || post.video_url;

        if (mediaUrl) {
            const marker = "/patriodx-media/";
            const index = mediaUrl.indexOf(marker);

            if (index !== -1) {
                const filePath = mediaUrl.substring(
                    index + marker.length
                );

                const { error: storageError } =
                    await supabaseClient
                        .storage
                        .from("patriodx-media")
                        .remove([filePath]);

                if (storageError) {
                    console.warn(
                        "Post deleted, but media cleanup failed:",
                        storageError
                    );
                }
            }
        }

        await loadSocialPosts();

        showPATRIODXToast(
            "Your post was deleted successfully.",
            "success"
        );

    } catch (error) {
        console.error("Delete post error:", error);

        showPATRIODXToast(
            error.message || "Could not delete the post. Please try again.",
            "error"
        );
    }
}


/* =========================================================
   REPORT POST
========================================================= */

async function reportSocialPost(postId) {

    if (!currentUser) {

        showPATRIODXToast(
            "Please log in to report posts.",
            "warning"
        );

        return;
    }

const reason =
    await showPATRIODXInput(
        "Report Post",
        "Why are you reporting this post?<br><br>" +
        "Examples: Spam, Scam, Harassment, " +
        "Inappropriate content, Other"
    );

if (!reason) {
    return;
}

    const cleanReason =
        reason.trim();

    if (!cleanReason) {
        return;
    }

    const { error } =
        await supabaseClient
            .from("reports")
            .insert({

                user_id:
                    currentUser.id,

                type:
                    "post",

                reason:
                    cleanReason,

                related_id:
                    postId

            });

    if (error) {

        console.error(
            "Report error:",
            error
        );

        showPATRIODXToast(
            "Could not submit report. " +
            error.message,
            "error"
        );

        return;
    }

    showPATRIODXToast(
        "Report submitted. Thank you for helping keep PATRIODX safe.",
        "success"
    );
}
/* =========================================================
   SHARE POST
========================================================= */

async function shareSocialPost(postId) {

    const shareUrl =
        `${window.location.origin}${window.location.pathname}#social-post-${postId}`;


    const shareData = {

        title:
            "PATRIODX Social",

        text:
            "Check out this post on PATRIODX.",

        url:
            shareUrl
    };


    try {

       if (navigator.share) {

    await navigator.share(
        shareData
    );

    return;
}


await navigator.clipboard.writeText(
    shareUrl
);


showPATRIODXToast(
    "Post link copied to clipboard!",
    "success"
);

} catch (error) {

    if (
        error.name ===
        "AbortError"
    ) {
        return;
    }


    console.error(
        "Share error:",
        error
    );

    showPATRIODXToast(
        "Could not share this post.",
        "error"
    );
}
}

/* =========================================================
   SOCIAL POST TAG AND MENTION BUTTONS
========================================================= */

function insertSocialComposerText(text) {
    const composer = document.getElementById("socialPostContent");

    if (!composer) {
        return;
    }

    const start = composer.selectionStart ?? composer.value.length;
    const end = composer.selectionEnd ?? start;

    const before = composer.value.slice(0, start);
    const after = composer.value.slice(end);

    const prefix = before && !/\s$/.test(before) ? " " : "";
    const insertion = prefix + text;

    composer.value = before + insertion + after;

    const cursorPosition = before.length + insertion.length;

    composer.focus();
    composer.setSelectionRange(cursorPosition, cursorPosition);
}
/* =========================================================
   PATRIODX SOCIAL USER PICKER — NO BROWSER POPUPS
========================================================= */

function showPATRIODXUserPicker() {
    return new Promise(function (resolve) {
        if (!currentUser) {
            showPATRIODXToast(
                "Please sign in to tag someone.",
                "warning"
            );
            resolve(null);
            return;
        }

        const overlay = document.createElement("div");

        overlay.id = "patriodxUserPicker";
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(7px);
            -webkit-backdrop-filter: blur(7px);
        `;

        overlay.innerHTML = `
            <section style="
                width: 100%;
                max-width: 440px;
                max-height: 82vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                background: var(--card-bg, #ffffff);
                color: var(--text-color, #0f172a);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 22px;
                box-shadow: 0 25px 80px rgba(0,0,0,.25);
            ">
                <header style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 20px;
                    border-bottom: 1px solid var(--border-color, #e2e8f0);
                ">
                    <div>
                        <h2 style="font-size:20px;margin:0 0 4px;">
                            Tag Someone
                        </h2>
                        <p style="
                            margin:0;
                            font-size:13px;
                            color:var(--muted-text,#64748b);
                        ">
                            Find a PATRIODX account
                        </p>
                    </div>

                    <button
                        type="button"
                        data-picker-close
                        aria-label="Close"
                        style="
                            width:40px;
                            min-width:40px;
                            height:40px;
                            padding:0;
                            border-radius:50%;
                            background:var(--input-bg,#f1f5f9);
                            color:var(--text-color,#0f172a);
                            font-size:23px;
                        "
                    >×</button>
                </header>

                <div style="padding:18px 20px 10px;">
                    <input
                        type="search"
                        data-picker-search
                        placeholder="Search by name or @username..."
                        autocomplete="off"
                        style="
                            width:100%;
                            min-height:48px;
                            padding:12px 15px;
                            border:1px solid var(--border-color,#cbd5e1);
                            border-radius:12px;
                            background:var(--input-bg,#f8fafc);
                            color:var(--text-color,#0f172a);
                            font-size:15px;
                            outline-offset:2px;
                        "
                    >
                </div>

                <div
                    data-picker-results
                    aria-live="polite"
                    style="
                        min-height:130px;
                        overflow-y:auto;
                        padding:8px 14px 18px;
                    "
                >
                    <p style="
                        padding:22px 8px;
                        text-align:center;
                        color:var(--muted-text,#64748b);
                        font-size:14px;
                    ">
                        Type a name or username to find people.
                    </p>
                </div>
            </section>
        `;

        document.body.appendChild(overlay);

        const searchInput =
            overlay.querySelector("[data-picker-search]");

        const results =
            overlay.querySelector("[data-picker-results]");

        let finished = false;
        let searchTimer;
        let requestNumber = 0;

        function closePicker(profile = null) {
            if (finished) return;

            finished = true;
            clearTimeout(searchTimer);
            document.removeEventListener("keydown", onKeyDown);
            overlay.remove();
            resolve(profile);
        }

        function onKeyDown(event) {
            if (event.key === "Escape") {
                closePicker();
            }
        }

        function showMessage(message) {
            results.replaceChildren();

            const paragraph = document.createElement("p");

            paragraph.textContent = message;
            paragraph.style.cssText = `
                padding:22px 8px;
                text-align:center;
                color:var(--muted-text,#64748b);
                font-size:14px;
            `;

            results.appendChild(paragraph);
        }

        function addProfileRow(profile) {
            const button = document.createElement("button");

            button.type = "button";
            button.style.cssText = `
                display:flex;
                align-items:center;
                gap:12px;
                width:100%;
                min-height:68px;
                padding:10px;
                margin:0 0 5px;
                text-align:left;
                color:var(--text-color,#0f172a);
                background:transparent;
                border-radius:13px;
                box-shadow:none;
                transform:none;
            `;

            const avatar = document.createElement("img");

            avatar.alt = "";
            avatar.loading = "lazy";
            avatar.style.cssText = `
                width:46px;
                height:46px;
                flex:0 0 46px;
                border-radius:50%;
                object-fit:cover;
                background:var(--input-bg,#e2e8f0);
            `;

            if (profile.avatar_url) {
                avatar.src = profile.avatar_url;
            } else {
                avatar.style.display = "none";
            }

            avatar.addEventListener("error", function () {
                avatar.style.display = "none";
            });

            const details = document.createElement("span");

            details.style.cssText = `
                display:flex;
                flex-direction:column;
                min-width:0;
                flex:1;
            `;

            const displayName = document.createElement("strong");

            displayName.textContent =
                profile.display_name ||
                profile.username ||
                "PATRIODX User";

            displayName.style.cssText = `
                font-size:14px;
                overflow-wrap:anywhere;
            `;

            const username = document.createElement("span");

            username.textContent = profile.username
                ? "@" + profile.username
                : "PATRIODX member";

            username.style.cssText = `
                font-size:12px;
                color:var(--muted-text,#64748b);
                overflow-wrap:anywhere;
            `;

            const selectLabel = document.createElement("span");

            selectLabel.textContent = "Select";
            selectLabel.style.cssText = `
                font-size:12px;
                font-weight:700;
                color:#2563eb;
            `;

            details.append(displayName, username);
            button.append(avatar, details, selectLabel);

            button.addEventListener("mouseenter", function () {
                button.style.background =
                    "var(--input-bg,#f1f5f9)";
            });

            button.addEventListener("mouseleave", function () {
                button.style.background = "transparent";
            });

            button.addEventListener("click", function () {
                closePicker(profile);
            });

            results.appendChild(button);
        }

        async function searchProfiles() {
            const query = searchInput.value
                .trim()
                .replace(/^@+/, "")
                .replace(/[%_,()]/g, "");

            const thisRequest = ++requestNumber;

            if (query.length < 2) {
                showMessage(
                    "Type at least 2 characters to search."
                );
                return;
            }

            showMessage("Searching PATRIODX accounts...");

            try {
                const { data, error } = await supabaseClient
                    .from("profiles")
                    .select(
                        "id, username, display_name, avatar_url"
                    )
                    .neq("id", currentUser.id)
                    .or(
                        "username.ilike.%" + query +
                        "%,display_name.ilike.%" + query + "%"
                    )
                    .order("username", { ascending: true })
                    .limit(10);

                if (finished || thisRequest !== requestNumber) {
                    return;
                }

                if (error) throw error;

                results.replaceChildren();

                if (!data || data.length === 0) {
                    showMessage("No matching PATRIODX accounts found.");
                    return;
                }

                data.forEach(addProfileRow);

            } catch (error) {
                console.error(
                    "PATRIODX tag search failed:",
                    error
                );

                if (thisRequest === requestNumber) {
                    showMessage(
                        "Couldn't load accounts. Please try again."
                    );
                }
            }
        }

        searchInput.addEventListener("input", function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(searchProfiles, 250);
        });

        overlay.querySelector("[data-picker-close]")
            .addEventListener("click", function () {
                closePicker();
            });

        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) {
                closePicker();
            }
        });

        document.addEventListener("keydown", onKeyDown);

        searchInput.focus();
    });
}
function setupSocialTagMentionButtons() {
    const tagButton = document.getElementById("socialTagButton");
    const mentionButton = document.getElementById("socialMentionButton");

    if (tagButton && tagButton.dataset.handlerReady !== "true") {
        tagButton.dataset.handlerReady = "true";

  
      tagButton.addEventListener("click", async function () {
          const profile = await showPATRIODXUserPicker();

          if (!profile || !profile.username) {
              return;
          }

          insertSocialComposerText("@" + profile.username);
      });
    }

    if (mentionButton && mentionButton.dataset.handlerReady !== "true") {
        mentionButton.dataset.handlerReady = "true";

        mentionButton.addEventListener("click", function () {
            insertSocialComposerText("@");
        });
    }
}

setupSocialTagMentionButtons();

/* =========================================================
   START SOCIAL
========================================================= */

if (socialFeed) {

    loadSocialPosts();
}

/* =========================================================
PATRIODX THREE-DOT POST MENU
========================================================= */
function toggleSocialPostMenu(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const menu = document.getElementById(
        `social-post-menu-${postId}`
    );

    if (!menu) {
        console.error(
            "PATRIODX: Post menu not found:",
            postId
        );
        return;
    }

    const shouldOpen = menu.hidden;

    // Close all other menus first.
    document.querySelectorAll(".social-post-dropdown").forEach(item => {
        item.hidden = true;
        item.style.removeProperty("top");
        item.style.removeProperty("left");
        item.style.removeProperty("right");
        item.style.removeProperty("bottom");
    });

    document.querySelectorAll(".social-post-menu-toggle").forEach(button => {
        button.setAttribute("aria-expanded", "false");
    });

    if (!shouldOpen) {
        return;
    }

    const button = event?.currentTarget;

    if (!button) {
        console.error("PATRIODX: Menu trigger button not found.");
        return;
    }

    // Reveal the menu so its dimensions can be measured.
    menu.hidden = false;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const gap = 8;

    const buttonRect = button.getBoundingClientRect();

    // Override conflicting CSS positioning rules.
    menu.style.setProperty("position", "fixed", "important");
    menu.style.setProperty("right", "auto", "important");
    menu.style.setProperty("bottom", "auto", "important");
    menu.style.setProperty("width", "min(300px, calc(100vw - 24px))", "important");
    menu.style.setProperty("max-width", "calc(100vw - 24px)", "important");
    menu.style.setProperty(
        "max-height",
        `calc(100dvh - ${margin * 2}px)`,
        "important"
    );
    menu.style.setProperty("overflow-y", "auto", "important");
    menu.style.setProperty("overflow-x", "hidden", "important");
    menu.style.setProperty("z-index", "999999", "important");

    const menuRect = menu.getBoundingClientRect();
    const menuWidth = Math.min(
        menuRect.width,
        viewportWidth - margin * 2
    );
    const menuHeight = Math.min(
        menuRect.height,
        viewportHeight - margin * 2
    );

    // Align the menu's right edge with the trigger button.
    let left = buttonRect.right - menuWidth;

    // Keep the menu inside the horizontal screen edges.
    left = Math.max(
        margin,
        Math.min(left, viewportWidth - menuWidth - margin)
    );

    // Prefer opening below the button.
    let top = buttonRect.bottom + gap;

    // If there isn't enough room below, open above.
    if (
        top + menuHeight >
        viewportHeight - margin
    ) {
        const topPosition = buttonRect.top - menuHeight - gap;

        if (topPosition >= margin) {
            top = topPosition;
        } else {
            // If neither side has enough room, keep it onscreen.
            top = Math.max(
                margin,
                Math.min(
                    top,
                    viewportHeight - menuHeight - margin
                )
            );
        }
    }

    menu.style.setProperty("left", `${left}px`, "important");
    menu.style.setProperty("top", `${top}px`, "important");

    button.setAttribute("aria-expanded", "true");
}

// Keep the function accessible to inline onclick handlers.
window.toggleSocialPostMenu = toggleSocialPostMenu;
/* =========================================================
PATRIODX SAVED POSTS
========================================================= */

async function loadSavedPosts() {
const container = document.getElementById("savedPostsList");
if (!container) return;

if (!currentUser) {
    container.innerHTML = `
        <div class="social-empty-state">
            <h3>Please sign in</h3>
            <p>Sign in to view your saved posts.</p>
        </div>`;
    return;
}

container.innerHTML = `
    <div class="social-empty-state">
        <h3>Loading saved posts...</h3>
    </div>`;

try {
    const { data: savedItems, error: savedError } =
        await supabaseClient
            .from("saved_posts")
            .select("post_id")
            .eq("user_id", currentUser.id);

    if (savedError) throw savedError;

    if (!savedItems?.length) {
        container.innerHTML = `
            <div class="social-empty-state">
                <h3>No saved posts yet</h3>
                <p>Save a post from Social and it will appear here.</p>
            </div>`;
        return;
    }

    const postIds = [...new Set(savedItems.map(item => item.post_id))];

    const { data: posts, error: postsError } =
        await supabaseClient
            .from("posts")
            .select("*")
            .in("id", postIds)
            .order("created_at", { ascending: false });

    if (postsError) throw postsError;

    if (!posts?.length) {
        container.innerHTML = `
            <div class="social-empty-state">
                <h3>No available saved posts</h3>
                <p>The original posts may have been deleted.</p>
            </div>`;
        return;
    }

    const userIds = [...new Set(posts.map(post => post.user_id).filter(Boolean))];
    let profiles = [];

    if (userIds.length) {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at")
            .in("id", userIds);

        if (error) throw error;
        profiles = data || [];
    }

    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));

    container.innerHTML = posts.map(post => {
        const profile = profileMap.get(post.user_id);
        const author = profile?.display_name || profile?.username || "PATRIODX User";

        return `
            <article class="social-post-card saved-post-card">
                <div class="social-post-header">
                    <div class="social-post-avatar">
                        ${profile?.avatar_url
                            ? `<img src="${safe(profile.avatar_url)}" alt="${safe(author)}" loading="lazy">`
                            : `<span>${safe(author.charAt(0).toUpperCase())}</span>`}
                    </div>

                    <div class="social-post-author-area">
                        <div class="social-post-author">
                            ${safe(author)}
                            ${typeof getPATRIODXBadge === "function"
                                ? getPATRIODXBadge(profile)
                                : ""}
                        </div>
                        <div class="social-post-date">${formatDate(post.created_at)}</div>
                    </div>
                </div>

                ${post.content
                    ? `<div class="social-post-content">${renderClickableMentions(post.content)}</div>`
                    : ""}

                ${post.image_url
                    ? `<div class="social-media-wrapper">
                           <img src="${safe(post.image_url)}" class="social-post-image" alt="Post image" loading="lazy">
                       </div>`
                    : ""}

                ${post.video_url
                    ? `<div class="social-media-wrapper">
                           <video src="${safe(post.video_url)}" class="social-post-video" controls preload="metadata"></video>
                       </div>`
                    : ""}

                <div class="saved-post-actions">
                    <button type="button" class="secondary-btn" data-remove-saved-post="${safe(post.id)}">
                        <i data-lucide="bookmark-minus"></i>
                        Remove saved post
                    </button>
                </div>
            </article>`;
    }).join("");

    if (typeof lucide !== "undefined") lucide.createIcons();

} catch (error) {
    console.error("Load saved posts error:", error);
    container.innerHTML = `
        <div class="social-empty-state">
            <h3>Couldn't load saved posts</h3>
            <p>Please try again.</p>
        </div>`;
    showPATRIODXToast("Could not load saved posts.", "error");
}


}

window.loadSavedPosts = loadSavedPosts;

/* Remove a saved post without deleting the original post. */
async function removeSavedPost(postId, button) {
if (!currentUser || !postId) return;


if (button) {
    button.disabled = true;
    button.textContent = "Removing...";
}

try {
    const { error } = await supabaseClient
        .from("saved_posts")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("post_id", postId);

    if (error) throw error;

    showPATRIODXToast("Post removed from your saved posts.", "success");
    await loadSavedPosts();

} catch (error) {
    console.error("Remove saved post error:", error);
    showPATRIODXToast("Could not remove this saved post.", "error");
    if (button) {
        button.disabled = false;
        button.textContent = "Remove saved post";
    }
}


}

document.getElementById("savedPostsList")?.addEventListener("click", event => {
const button = event.target.closest("[data-remove-saved-post]");
if (!button) return;

removeSavedPost(button.dataset.removeSavedPost, button);


});

/* Update one of the supported settings on a post owned by the user. */
async function toggleSocialPostSetting(postId, setting, value) {
const allowedSettings = [
"hide_like_count",
"hide_share_count",
"comments_enabled",
"is_pinned"
];

if (!currentUser) {
    showPATRIODXToast("Please sign in first.", "warning");
    return;
}

if (!allowedSettings.includes(setting)) {
    showPATRIODXToast("Invalid post setting.", "error");
    return;
}

try {
    const { data: post, error: lookupError } = await supabaseClient
        .from("posts")
        .select("id, user_id")
        .eq("id", postId)
        .maybeSingle();

    if (lookupError) throw lookupError;

    if (!post || post.user_id !== currentUser.id) {
        showPATRIODXToast(
            "You can only change settings on your own posts.",
            "warning"
        );
        return;
    }

    const { error } = await supabaseClient
        .from("posts")
        .update({ [setting]: Boolean(value) })
        .eq("id", postId)
        .eq("user_id", currentUser.id);

    if (error) throw error;

    document.querySelectorAll(".social-post-dropdown").forEach(menu => {
        menu.hidden = true;
    });

    showPATRIODXToast("Post setting updated.", "success");

    await loadSocialPosts();

    if (typeof loadHomePosts === "function") {
        await loadHomePosts();
    }
} catch (error) {
    console.error("Update post setting error:", error);

    showPATRIODXToast(
        error.message || "Could not update this post setting.",
        "error"
    );
}


}

/* Edit a post using an in-app modal; the database trigger enforces 15 minutes. */
async function editSocialPost(postId) {
if (!currentUser) {
showPATRIODXToast("Please sign in first.", "warning");
return;
}


try {
    const { data: post, error } = await supabaseClient
        .from("posts")
        .select("id, user_id, content, created_at")
        .eq("id", postId)
        .maybeSingle();

    if (error) throw error;

    if (!post || post.user_id !== currentUser.id) {
        showPATRIODXToast("You can only edit your own posts.", "warning");
        return;
    }

    const age = Date.now() - new Date(post.created_at).getTime();

    if (!Number.isFinite(age) || age > 15 * 60 * 1000) {
        showPATRIODXToast(
            "Posts can only be edited within 15 minutes of creation.",
            "warning"
        );
        await loadSocialPosts();
        return;
    }

    const overlay = document.createElement("div");
    overlay.className = "patriodx-confirm-overlay";

    overlay.innerHTML = `
        <div class="patriodx-confirm-modal social-post-edit-modal"
             role="dialog"
             aria-modal="true"
             aria-labelledby="socialPostEditTitle">
            <h3 id="socialPostEditTitle">Edit post</h3>
            <p>Update the text of your post.</p>

            <textarea
                class="patriodx-input social-post-edit-textarea"
                aria-label="Post text"
                maxlength="5000"
                rows="7"
            ></textarea>

            <div class="patriodx-confirm-actions">
                <button type="button"
                        class="secondary-btn"
                        data-edit-cancel>
                    Cancel
                </button>
                <button type="button"
                        class="primary-btn"
                        data-edit-save>
                    Save changes
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const textarea = overlay.querySelector("textarea");
    const cancelButton = overlay.querySelector("[data-edit-cancel]");
    const saveButton = overlay.querySelector("[data-edit-save]");

    textarea.value = post.content || "";
    textarea.focus();

    cancelButton.addEventListener("click", () => overlay.remove());

    overlay.addEventListener("click", event => {
        if (event.target === overlay) overlay.remove();
    });

    saveButton.addEventListener("click", async () => {
        const content = textarea.value.trim();

        if (!content) {
            showPATRIODXToast("Post text cannot be empty.", "warning");
            textarea.focus();
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            const { error: updateError } = await supabaseClient
                .from("posts")
                .update({
                    content,
                    updated_at: new Date().toISOString()
                })
                .eq("id", postId)
                .eq("user_id", currentUser.id);

            if (updateError) throw updateError;

            overlay.remove();

            showPATRIODXToast("Post updated successfully.", "success");

            await loadSocialPosts();

            if (typeof loadHomePosts === "function") {
                await loadHomePosts();
            }
        } catch (updateError) {
            console.error("Edit post error:", updateError);

            showPATRIODXToast(
                updateError.message ||
                    "Could not edit this post.",
                "error"
            );

            saveButton.disabled = false;
            saveButton.textContent = "Save changes";
        }
    });
} catch (error) {
    console.error("Load post for editing error:", error);

    showPATRIODXToast(
        error.message || "Could not open the post editor.",
        "error"
    );
}


}

/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.likeSocialPost =
    likeSocialPost;

window.toggleComments =
    toggleComments;

window.submitSocialComment =
    submitSocialComment;

window.shareSocialPost =
    shareSocialPost;

window.clearSocialMedia =
    clearSocialMedia;

window.deleteSocialPost =
    deleteSocialPost;

window.reportSocialPost =
    reportSocialPost;
    window.toggleSocialPostMenu = toggleSocialPostMenu;
window.saveSocialPost = saveSocialPost;
window.toggleSocialPostSetting = toggleSocialPostSetting;
window.editSocialPost = editSocialPost;
function getPATRIODXBadge(profile) {
    if (!profile) return "";

    // Custom PATRIODX badge: gold for the owner.
    if (profile.is_owner) {
        return `
            <span
                class="patriodx-verification-badge owner-badge"
                title="PATRIODX Founder"
                aria-label="PATRIODX Founder"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path class="patriodx-badge-shield"
                        d="M12 1.5 14.7 3l3.1-.1 1.1 2.9 2.5 1.8-.8 3 1 2.9-2.1 2.2-.5 3-3 .7L12 21.5l-3-2.1-3-.7-.5-3-2.1-2.2 1-2.9-.8-3 2.5-1.8 1.1-2.9 3.1.1Z"
                    />
                    <path class="patriodx-badge-symbol"
                        d="m8.5 11.5 2.2 2.2 4.8-5"
                    />
                    <path class="patriodx-badge-star"
                        d="m12 5.8.8 1.6 1.8.3-1.3 1.3.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.3 1.8-.3Z"
                    />
                </svg>
            </span>
        `;
    }

    if (!profile.is_verified) return "";

    // Do not display expired verification.
    if (profile.verification_expires_at) {
        const expiresAt = new Date(profile.verification_expires_at);

        if (
            !Number.isNaN(expiresAt.getTime()) &&
            expiresAt <= new Date()
        ) {
            return "";
        }
    }

    // Custom blue PATRIODX verification badge.
    return `
        <span
            class="patriodx-verification-badge verified-badge"
            title="PATRIODX Verified"
            aria-label="PATRIODX Verified"
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path class="patriodx-badge-shield"
                    d="M12 1.5 14.7 3l3.1-.1 1.1 2.9 2.5 1.8-.8 3 1 2.9-2.1 2.2-.5 3-3 .7L12 21.5l-3-2.1-3-.7-.5-3-2.1-2.2 1-2.9-.8-3 2.5-1.8 1.1-2.9 3.1.1Z"
                />
                <path class="patriodx-badge-symbol"
                    d="m7.5 12 3 3 6-6"
                />
            </svg>
        </span>
    `;
}

window.getPATRIODXBadge = getPATRIODXBadge;
/* =========================================================
   PATRIODX HOME FEED
========================================================= */

const homeFeed =
    document.getElementById("homeFeed");
async function loadHomePosts() {
    if (!homeFeed) return;

    homeFeed.innerHTML = `
        <div class="social-empty-state">
            <h3>Loading your feed...</h3>
            <p>Please wait.</p>
        </div>
    `;

    try {
        const { data: posts, error } = await supabaseClient
            .from("posts")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!posts || posts.length === 0) {
            homeFeed.innerHTML = `
                <div class="social-empty-state">
                    <h3>No posts yet</h3>
                    <p>Be the first to share something with the PATRIODX community.</p>
                </div>
            `;
            return;
        }

        const userIds = [
            ...new Set(posts.map(post => post.user_id).filter(Boolean))
        ];

        let profiles = [];

        if (userIds.length) {
            const { data, error: profileError } = await supabaseClient
                .from("profiles")
                .select(
                    "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
                )
                .in("id", userIds);

            if (profileError) {
                console.error("Home profile lookup failed:", profileError);
            } else {
                profiles = data || [];
            }
        }

        const profileMap = new Map(
            profiles.map(profile => [profile.id, profile])
        );

        const postsWithCounts = await Promise.all(
            posts.map(async post => ({
                ...post,
                ...(await getSocialCounts(post.id))
            }))
        );

        homeFeed.innerHTML = postsWithCounts.map(post => {
            const profile = profileMap.get(post.user_id);
            const isOwnPost = post.user_id === currentUser?.id;

            const author =
                profile?.display_name ||
                profile?.username ||
                (isOwnPost
                    ? currentUser?.user_metadata?.full_name || "You"
                    : "PATRIODX User");

            const avatar = profile?.avatar_url
                ? `
                    <img
                        src="${safe(profile.avatar_url)}"
                        alt="${safe(author)}"
                        loading="lazy"
                    >
                `
                : `<i data-lucide="user"></i>`;

            const badge =
                typeof getPATRIODXBadge === "function"
                    ? getPATRIODXBadge(profile)
                    : "";

            const image = post.image_url
                ? `
                    <div class="social-media-wrapper">
                        <img
                            src="${safe(post.image_url)}"
                            class="social-post-image"
                            alt="Photo shared by ${safe(author)}"
                            loading="lazy"
                        >
                    </div>
                `
                : "";

            const video = post.video_url
                ? `
                    <div class="social-media-wrapper">
                        <video
                            src="${safe(post.video_url)}"
                            class="social-post-video"
                            controls
                            preload="metadata"
                        ></video>
                    </div>
                `
                : "";

            return `
                <article
                    class="social-post-card home-feed-post"
                    id="home-post-${post.id}"
                >
                    <header class="social-post-header">
                       <div
    class="social-post-avatar"
    data-profile-user-id="${safe(post.user_id)}"
    role="button"
    tabindex="0"
    aria-label="View ${safe(author)}'s profile"
>
                            ${avatar}
                        </div>

                        <div class="social-post-author-area">
                           <div
    class="social-post-author"
    data-profile-user-id="${safe(post.user_id)}"
    role="button"
    tabindex="0"
    aria-label="View ${safe(author)}'s profile"
>
                                ${safe(author)}
                                ${badge}
                                ${
                                    isOwnPost
                                        ? '<span class="social-post-you">You</span>'
                                        : ""
                                }
                            </div>

                            <div class="social-post-date">
                                ${formatDate(post.created_at)}
                            </div>
                        </div>
                    </header>

                    ${
                        post.content
                            ? `
<div class="social-post-content">
    ${renderClickableMentions(post.content)}
</div>


                            `
                            : ""
                    }

                    ${image}
                    ${video}

                    <div class="social-post-stats">
                        <span>
                            <i data-lucide="heart"></i>
                            ${Number(post.likes) || 0} likes
                        </span>

                        <span>
                            <i data-lucide="message-circle"></i>
                            ${Number(post.comments) || 0} comments
                        </span>
                    </div>

                    <div class="social-post-actions-bar home-feed-actions">
                        <button
                            type="button"
                           class="social-action-button social-like-button"
data-post-id="${post.id}"
                            onclick="likeSocialPost('${post.id}')"
                            aria-label="Like post"
                        >
                            <i data-lucide="heart"></i>
                            <span>Like</span>
                        </button>

                        <button
                            type="button"
                            class="social-action-button"
                            onclick="toggleHomeComments('${post.id}')"
                            aria-label="Comment on post"
                        >
                            <i data-lucide="message-circle"></i>
                            <span>Comment</span>
                        </button>

                        <button
                            type="button"
                            class="social-action-button"
                            onclick="shareSocialPost('${post.id}')"
                            aria-label="Share post"
                        >
                            <i data-lucide="share-2"></i>
                            <span>Share</span>
                        </button>
                    </div>
                </article>
            `;
        }).join("");
// Open the author's public profile from Home posts.
homeFeed.querySelectorAll("[data-profile-user-id]").forEach(element => {
    element.style.cursor = "pointer";

    element.addEventListener("click", function () {
        const userId = this.getAttribute("data-profile-user-id");

        if (userId) {
            loadPublicProfile(userId);
        }
    });

    element.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.click();
        }
    });
});
        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (error) {
        console.error("Could not load PATRIODX Home feed:", error);

        homeFeed.innerHTML = `
            <div class="social-empty-state">
                <h3>Could not load your feed</h3>
                <p>Please refresh the page and try again.</p>
            </div>
        `;
    }
}
/* =========================================================
PATRIODX HOME POST STATS
========================================================= */

async function refreshHomePostStats(postId) {
if (!postId) return;


const statsElement = document.querySelector(
    `#home-post-${postId} .social-post-stats`
);

if (!statsElement) return;

try {
    const counts = await getSocialCounts(postId);

    statsElement.innerHTML = `
        <span>
            <i data-lucide="heart"></i> ${counts.likes}
        </span>
        <span>
            <i data-lucide="message-circle"></i> ${counts.comments}
        </span>
    `;

    if (window.lucide) {
        window.lucide.createIcons();
    }
} catch (error) {
    console.error(
        "PATRIODX: Could not refresh home post statistics:",
        error
    );
}


}

window.refreshHomePostStats = refreshHomePostStats;

/* =========================================================
   PATRIODX HOME COMMENTS
========================================================= */

async function toggleHomeComments(postId) {

    const existing =
        document.getElementById(
            `home-comments-${postId}`
        );

    if (existing) {
        existing.remove();
        return;
    }

    const post =
        document.getElementById(
            `home-post-${postId}`
        );

    if (!post) return;

    const commentsBox =
        document.createElement("div");

    commentsBox.id =
        `home-comments-${postId}`;

    commentsBox.className =
        "social-comments";

    commentsBox.innerHTML = `
        <div class="social-comments-loading">
            Loading comments...
        </div>
    `;

    post.appendChild(commentsBox);

    const {
        data: comments,
        error
    } = await supabaseClient
        .from("comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", {
            ascending: true
        });

    if (error) {

        console.error(
            "Could not load Home comments:",
            error
        );

        commentsBox.innerHTML = `
            <div class="social-comments-loading">
                Could not load comments.
            </div>
        `;

        return;
    }

    commentsBox.innerHTML = `
        <div
            id="home-comments-list-${postId}"
            class="social-comments-list"
        >
            ${
                comments?.length
                    ? comments.map(comment => `
                        <div class="social-comment">
                            <div class="social-comment-avatar">
                               <i data-lucide="user"></i>
                            </div>

                            <div class="social-comment-body">
                                <strong>
                                    PATRIODX User
                                </strong>

                                <p>
                                  ${renderClickableMentions(comment.content || "")}
                                </p>

                                <small>
                                    ${formatDate(
                                        comment.created_at
                                    )}
                                </small>
                            </div>
                        </div>
                    `).join("")
                    : `
                        <div class="social-comments-loading">
                            No comments yet.
                        </div>
                    `
            }
        </div>

        <form
            class="social-comment-form"
            onsubmit="submitHomeComment(event, '${postId}')"
        >
            <input
                type="text"
                id="home-comment-input-${postId}"
                placeholder="Write a comment..."
                maxlength="1000"
                autocomplete="off"
                required
            >

            <button type="submit">
                Send
            </button>
        </form>
    `;
}

async function submitHomeComment(event, postId) {

    event.preventDefault();

   if (!currentUser) {

    showPATRIODXToast(
        "Please sign in first.",
        "warning"
    );

    return;
}

    const input =
        document.getElementById(
            `home-comment-input-${postId}`
        );

    if (!input) return;

    const content =
        input.value.trim();

    if (!content) return;

    const button =
        event.submitter;

    if (button) {
        button.disabled = true;
        button.textContent = "Sending...";
    }

    try {

        const {
            error
        } = await supabaseClient
            .from("comments")
            .insert({
                post_id: postId,
                user_id: currentUser.id,
                content: content
            });

        if (error) {
            throw error;
        }

        await toggleHomeComments(postId);

        await refreshHomePostStats(postId);

        await toggleHomeComments(postId);

    } catch (error) {

        console.error(
            "Could not submit Home comment:",
            error
        );

     showPATRIODXToast(
    "Could not post comment: " +
    error.message,
    "error"
);

        if (button) {
            button.disabled = false;
            button.textContent = "Send";
        }
    }
}

window.toggleHomeComments =
    toggleHomeComments;

window.submitHomeComment =
    submitHomeComment;
/* =========================================================
   PATRIODX MESSAGING
========================================================= */

const conversationList =
    document.getElementById("conversationList");

const messageList =
    document.getElementById("messageList");

const messageForm =
    document.getElementById("messageForm");

const messageInput =
    document.getElementById("messageInput");

const messageSendButton =
    document.getElementById("messageSendButton");

const newConversationButton =
    document.getElementById("newConversationButton");

let activeConversationId = null;

let messagingRealtimeChannel = null;
// =========================================================
// NEW CONVERSATION USER PICKER
// =========================================================

const newConversationModal =
    document.getElementById(
        "newConversationModal"
    );

const closeNewConversationModal =
    document.getElementById(
        "closeNewConversationModal"
    );
function closeNewConversationPicker() {
    if (!newConversationModal) return;

    newConversationModal.style.display = "none";
    document.body.style.overflow = "";

    if (conversationUserSearch) {
        conversationUserSearch.value = "";
    }
}

if (closeNewConversationModal) {
    closeNewConversationModal.addEventListener(
        "click",
        function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeNewConversationPicker();
        }
    );
}

// Close when clicking the dark backdrop.
if (newConversationModal) {
    newConversationModal.addEventListener("click", function (event) {
        if (event.target === newConversationModal) {
            closeNewConversationPicker();
        }
    });
}

// Close with Escape.
document.addEventListener("keydown", function (event) {
    if (
        event.key === "Escape" &&
        newConversationModal &&
        newConversationModal.style.display !== "none"
    ) {
        closeNewConversationPicker();
    }
});
const conversationUserSearch =
    document.getElementById(
        "conversationUserSearch"
    );
const messagingPeopleSearch =
    document.getElementById("messagingPeopleSearch");

if (messagingPeopleSearch) {
    messagingPeopleSearch.addEventListener("input", function () {
        const query = this.value.trim();

        if (!newConversationModal) return;

        newConversationModal.style.display = "flex";

        if (conversationUserSearch) {
            conversationUserSearch.value = query;
        }

        if (conversationUsers.length) {
            renderConversationUsers();
        } else {
            loadConversationUsers();
        }
    });
}
const conversationUserList =
    document.getElementById(
        "conversationUserList"
    );


let conversationUsers = [];


async function loadConversationUsers() {

    if (!conversationUserList || !currentUser) {
        return;
    }

    conversationUserList.innerHTML = `
        <div class="messaging-empty-state">
            <div>
                <i data-lucide="loader-circle"></i>
            </div>
            <p>Loading users...</p>
        </div>
    `;

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    const { data, error } =
        await supabaseClient
            .from("profiles")
          .select(
    "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
)
            .neq(
                "id",
                currentUser.id
            )
            .order(
                "display_name",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Could not load conversation users:",
            error
        );

        conversationUserList.innerHTML = `
            <div class="messaging-empty-state">
                <div>
                    <i data-lucide="triangle-alert"></i>
                </div>

                <p>
                    Could not load users.
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    conversationUsers =
        data || [];


    renderConversationUsers();
}


function renderConversationUsers() {
    if (!conversationUserList) return;

    const search = (
        conversationUserSearch?.value ||
        messagingPeopleSearch?.value ||
        ""
    ).trim().toLowerCase();

    const users = conversationUsers.filter(user => {
        const name = (user.display_name || "").toLowerCase();
        const username = (user.username || "").toLowerCase();

        return name.includes(search) || username.includes(search);
    });

    if (!users.length) {
        conversationUserList.innerHTML = `
            <div class="messaging-empty-state">
                <i data-lucide="user-round-x"></i>
                <h3>No people found</h3>
                <p>Try another name or username.</p>
            </div>
        `;

        if (typeof lucide !== "undefined") lucide.createIcons();
        return;
    }

    conversationUserList.innerHTML = users.map(user => {
        const name = user.display_name || user.username || "PATRIODX User";
        const username = user.username ? `@${user.username}` : "";

        const avatar = user.avatar_url
            ? `<img src="${safe(user.avatar_url)}"
                    alt=""
                    loading="lazy"
                    onerror="this.style.display='none';">`
            : `<i data-lucide="user-round"></i>`;

        return `
            <button
                type="button"
                class="conversation-user-item"
                data-user-id="${safe(user.id)}"
            >
                <div class="conversation-user-avatar">
                    ${avatar}
                </div>

                <div class="conversation-user-info">
                   <strong>
    ${safe(name)}
    ${typeof getPATRIODXBadge === "function"
        ? getPATRIODXBadge(user)
        : ""}
</strong>
                    <span>${safe(username || "PATRIODX member")}</span>
                </div>

                <span class="conversation-user-open" aria-hidden="true">
                    <i data-lucide="message-circle"></i>
                </span>
            </button>
        `;
    }).join("");

    conversationUserList
        .querySelectorAll(".conversation-user-item")
        .forEach(button => {
            button.addEventListener("click", async function () {
                const userId = this.dataset.userId;
                if (!userId) return;

                this.disabled = true;

                try {
                    await createConversationWithUser(userId);
                    if (newConversationModal) {
                        newConversationModal.style.display = "none";
                    }
                } finally {
                    this.disabled = false;
                }
            });
        });

    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function createConversationWithUser(otherUserId) {
    if (!currentUser || !otherUserId) {
        return false;
    }

    const { data: myMemberships, error: myMembershipError } =
        await supabaseClient
            .from("conversation_members")
            .select("conversation_id")
            .eq("user_id", currentUser.id);

    if (myMembershipError) {
        console.error("Could not load your conversations:", myMembershipError);

        showPATRIODXToast(
            "Could not check existing conversations. " +
            myMembershipError.message,
            "error"
        );

        return false;
    }

    const myConversationIds =
        (myMemberships || []).map(member => member.conversation_id);

    if (myConversationIds.length) {
        const { data: otherMemberships, error: otherMembershipError } =
            await supabaseClient
                .from("conversation_members")
                .select("conversation_id")
                .eq("user_id", otherUserId)
                .in("conversation_id", myConversationIds);

        if (otherMembershipError) {
            console.error(
                "Could not check the selected user's conversations:",
                otherMembershipError
            );

            showPATRIODXToast(
                "Could not check existing conversations. " +
                otherMembershipError.message,
                "error"
            );

            return false;
        }

        const sharedConversation = (otherMemberships || [])[0];

        if (sharedConversation) {
            const existingConversationId =
                sharedConversation.conversation_id;

            if (newConversationModal) {
                newConversationModal.style.display = "none";
            }

            if (conversationUserSearch) {
                conversationUserSearch.value = "";
            }

         await openConversation(existingConversationId);
            return true;
        }
    }

    const conversationId = crypto.randomUUID();

    const { error: conversationError } =
        await supabaseClient
            .from("conversations")
            .insert({ id: conversationId });

    if (conversationError) {
        console.error("Could not create conversation:", conversationError);

        showPATRIODXToast(
            "Could not create conversation. " +
            conversationError.message,
            "error"
        );

        return false;
    }

    const { error: currentMemberError } =
        await supabaseClient
            .from("conversation_members")
            .insert({
                conversation_id: conversationId,
                user_id: currentUser.id
            });

    if (currentMemberError) {
        console.error("Could not add current user:", currentMemberError);

        showPATRIODXToast(
            "Could not join the conversation. " +
            currentMemberError.message,
            "error"
        );

        return false;
    }

    const { error: otherMemberError } =
        await supabaseClient
            .from("conversation_members")
            .insert({
                conversation_id: conversationId,
                user_id: otherUserId
            });

    if (otherMemberError) {
        console.error("Could not add the selected user:", otherMemberError);

        showPATRIODXToast(
            "Could not add the selected user. " +
            otherMemberError.message,
            "error"
        );

        return false;
    }

    if (newConversationModal) {
        newConversationModal.style.display = "none";
    }

    if (conversationUserSearch) {
        conversationUserSearch.value = "";
    }

   await openConversation(conversationId);
    return true;
}


/* =========================================================
   LOAD CONVERSATIONS — PATRIODX
========================================================= */
async function loadConversations() {

    if (!currentUser || !conversationList) {
        return;
    }

    conversationList.innerHTML = `
        <div class="messaging-empty-state">
            <div><i data-lucide="loader-circle"></i></div>
            <p>Loading conversations...</p>
        </div>
    `;

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    try {

        /* GET CONVERSATION MEMBERSHIPS */

        const {
            data: memberships,
            error: membershipError
        } = await supabaseClient
            .from("conversation_members")
            .select("conversation_id, user_id")
            .eq("user_id", currentUser.id);

        if (membershipError) {
            throw membershipError;
        }

        const conversationIds = [
            ...new Set(
                (memberships || []).map(
                    member => member.conversation_id
                )
            )
        ];

        if (!conversationIds.length) {

            conversationList.innerHTML = `
                <div class="messaging-empty-state">
                    <div><i data-lucide="message-circle"></i></div>
                    <h3>No conversations yet</h3>
                    <p>Start a conversation with someone on PATRIODX.</p>
                </div>
            `;

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            return;
        }

        /* GET CONVERSATIONS */

        const {
            data: conversations,
            error: conversationError
        } = await supabaseClient
            .from("conversations")
            .select("*")
            .in("id", conversationIds);

        if (conversationError) {
            throw conversationError;
        }

        /* GET CONVERSATION MEMBERS */

        const {
            data: allMembers,
            error: allMembersError
        } = await supabaseClient
            .from("conversation_members")
            .select("conversation_id, user_id")
            .in("conversation_id", conversationIds);

        if (allMembersError) {
            throw allMembersError;
        }

        /* KEEP DIRECT CONVERSATIONS */

        const visibleConversations =
            (conversations || []).filter(conversation => {

                const members = (allMembers || []).filter(
                    member =>
                        member.conversation_id === conversation.id
                );

                return members.some(
                    member =>
                        member.user_id !== currentUser.id
                );
            });

        if (!visibleConversations.length) {

            conversationList.innerHTML = `
                <div class="messaging-empty-state">
                    <div><i data-lucide="message-circle"></i></div>
                    <h3>No conversations yet</h3>
                    <p>Start a conversation with someone on PATRIODX.</p>
                </div>
            `;

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            return;
        }

        /* FIND OTHER USERS */

        const otherUserIds = [
            ...new Set(
                (allMembers || [])
                    .filter(
                        member =>
                            member.user_id !== currentUser.id
                    )
                    .map(
                        member => member.user_id
                    )
            )
        ];

        /* LOAD PROFILES, INCLUDING AVATARS */

        let profiles = [];

        if (otherUserIds.length) {

            const {
                data: profileData,
                error: profileError
            } = await supabaseClient
               .from("profiles")
.select(
    "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
)
.in("id", otherUserIds);

            if (profileError) {
                console.error(
                    "Could not load conversation profiles:",
                    profileError
                );
            } else {
                profiles = profileData || [];
            }
        }

        const profileMap = new Map(
            profiles.map(
                profile => [profile.id, profile]
            )
        );

        /* GET LATEST MESSAGES */

        const {
            data: recentMessages,
            error: recentMessagesError
        } = await supabaseClient
            .from("messages")
            .select(
                "conversation_id, sender_id, content, created_at"
            )
            .in("conversation_id", conversationIds)
            .order("created_at", {
                ascending: false
            });

        if (recentMessagesError) {
            console.error(
                "Could not load conversation previews:",
                recentMessagesError
            );
        }

        /* STORE THE NEWEST MESSAGE FOR EACH CONVERSATION */

        const latestMessageMap = new Map();

        (recentMessages || []).forEach(message => {

            if (
                !latestMessageMap.has(
                    message.conversation_id
                )
            ) {
                latestMessageMap.set(
                    message.conversation_id,
                    message
                );
            }
        });

        /* SORT BY MOST RECENT ACTIVITY */

        visibleConversations.sort((a, b) => {

            const messageA =
                latestMessageMap.get(a.id);

            const messageB =
                latestMessageMap.get(b.id);

            const timeA = new Date(
                messageA?.created_at ||
                a.created_at ||
                0
            ).getTime();

            const timeB = new Date(
                messageB?.created_at ||
                b.created_at ||
                0
            ).getTime();

            return timeB - timeA;
        });

        /* FORMAT CONVERSATION TIME */

        function formatConversationTime(dateString) {

            if (!dateString) {
                return "";
            }

            const date = new Date(dateString);

            if (Number.isNaN(date.getTime())) {
                return "";
            }

            const now = new Date();

            if (
                date.toDateString() === now.toDateString()
            ) {
                return date.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit"
                });
            }

            const yesterday = new Date();

            yesterday.setDate(
                yesterday.getDate() - 1
            );

            if (
                date.toDateString() ===
                yesterday.toDateString()
            ) {
                return "Yesterday";
            }

            return date.toLocaleDateString([], {
                month: "short",
                day: "numeric"
            });
        }

        /* RENDER CONVERSATIONS */

        conversationList.innerHTML =
            visibleConversations.map(conversation => {

                const members = (allMembers || []).filter(
                    member =>
                        member.conversation_id === conversation.id
                );

                const otherMember = members.find(
                    member =>
                        member.user_id !== currentUser.id
                );

                const otherProfile = otherMember
                    ? profileMap.get(otherMember.user_id)
                    : null;

                const displayName =
                    otherProfile?.display_name ||
                    otherProfile?.username ||
                    "PATRIODX User";

                const username = otherProfile?.username
                    ? `@${otherProfile.username}`
                    : "";

                const latestMessage =
                    latestMessageMap.get(conversation.id);

                let preview = "Start a conversation";

                if (latestMessage) {

                    const messageContent =
                        latestMessage.content || "";

                    preview =
                        latestMessage.sender_id === currentUser.id
                            ? `You: ${messageContent}`
                            : messageContent;
                }

                const lastActivity =
                    latestMessage?.created_at ||
                    conversation.created_at;

                const timestamp =
                    formatConversationTime(lastActivity);

                const isActive =
                    activeConversationId === conversation.id;

                const avatar = otherProfile?.avatar_url
                    ? `
                        <img
                            src="${safe(otherProfile.avatar_url)}"
                            alt="${safe(displayName)}"
                            loading="lazy"
                            onerror="
                                this.style.display='none';
                                this.nextElementSibling.style.display='flex';
                            "
                        >
                        <span
                            class="conversation-avatar-fallback"
                            style="display:none;"
                        >
                            <i data-lucide="user"></i>
                        </span>
                    `
                    : `
                        <span class="conversation-avatar-fallback">
                            <i data-lucide="user"></i>
                        </span>
                    `;

                return `
                    <button
                        type="button"
                        class="conversation-item ${
                            isActive ? "active" : ""
                        }"
                        data-conversation-id="${safe(conversation.id)}"
                    >

                        <div class="conversation-avatar">
                            ${avatar}
                        </div>

                        <div class="conversation-info">

                            <strong>
                                ${safe(displayName)}
                            </strong>

                            ${
                                username
                                    ? `
                                        <span class="conversation-username">
                                            ${safe(username)}
                                        </span>
                                    `
                                    : ""
                            }

                            <span class="conversation-preview">
                                ${safe(preview)}
                            </span>

                        </div>

                        <span class="conversation-time">
                            ${safe(timestamp)}
                        </span>

                    </button>
                `;

            }).join("");

        /* RESTORE CLICK HANDLERS */

        conversationList
            .querySelectorAll(".conversation-item")
            .forEach(button => {

                button.addEventListener("click", function() {

                    const conversationId =
                        this.dataset.conversationId;

                    if (conversationId) {
                        openConversation(conversationId);
                    }
                });
            });

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

    } catch (error) {

        console.error(
            "Could not load conversations:",
            error
        );

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div><i data-lucide="triangle-alert"></i></div>
                <h3>Could not load conversations</h3>
                <p>${safe(error.message || "Please try again.")}</p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}
/* =========================================================
OPEN CONVERSATION
========================================================= */

async function openConversation(conversationId) {

activeConversationId = conversationId;

// Refresh the inbox in the background without blocking chat opening.
loadConversations().catch(error => {
    console.error("Background conversation refresh failed:", error);
});

messageInput.disabled = false;
messageSendButton.disabled = false;

const { data: conversation, error } =
    await supabaseClient
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

if (error) {
    console.error("Could not open conversation:", error);
    return;
}

/* GET THE OTHER PARTICIPANT */

const { data: members, error: membersError } =
    await supabaseClient
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId);

let otherUser = null;
let otherUserId = null;

if (!membersError) {

    const otherMember = (members || []).find(
        member => member.user_id !== currentUser.id
    );

    if (otherMember) {

        otherUserId = otherMember.user_id;

        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
               .select(`
    id,
    username,
    display_name,
    avatar_url,
    is_verified,
    is_owner,
    verification_expires_at
`)
                .eq("id", otherUserId)
                .single();

        if (!profileError) {
            otherUser = profile;
        }
    }
}

/* PREPARE THE HEADER */

const title =
    otherUser?.display_name ||
    otherUser?.username ||
    "PATRIODX User";

const verificationBadge =
    typeof getPATRIODXBadge === "function"
        ? getPATRIODXBadge(otherUser)
        : "";

const username =
    otherUser?.username
        ? `@${otherUser.username}`
        : "PATRIODX";

const avatarHTML = otherUser?.avatar_url
    ? `
        <img
            src="${safe(otherUser.avatar_url)}"
            alt="${safe(title)}"
            class="chat-header-avatar"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        >
        <span class="chat-header-avatar-fallback" style="display:none;">
            <i data-lucide="user"></i>
        </span>
    `
    : `
        <span class="chat-header-avatar-fallback">
            <i data-lucide="user"></i>
        </span>
    `;

/* DISPLAY THE HEADER */

const chatHeader = document.getElementById("chatHeader");

if (chatHeader) {

    const messagingSection =
        document.getElementById("messaging");

    if (messagingSection) {
        messagingSection.classList.add("mobile-chat-open");
    }

    chatHeader.innerHTML = `
        <button
            type="button"
            id="mobileChatBackButton"
            class="mobile-chat-back"
            aria-label="Back to conversations"
        >
            <i data-lucide="arrow-left"></i>
        </button>
       <div
    class="chat-header-profile"
    role="button"
    tabindex="0"
    data-open-chat-profile="${safe(otherUserId || "")}"
    aria-label="View ${safe(title)}'s profile"
    style="cursor:pointer;"
>

            <div class="chat-header-avatar-wrap">
                ${avatarHTML}
               <span
    id="patriodxChatOnlineDot"
    data-user-id="${safe(otherUserId || "")}"
    class="patriodx-online-dot offline"
    title="Offline"
></span>
            </div>

            <div class="chat-header-details">
                <h3 class="patriodx-chat-title">
    <span>${safe(title)}</span>
    ${verificationBadge}
</h3>
                <p>${safe(username)}</p>
                <small
                    id="patriodxChatOnlineStatus"
                    class="patriodx-chat-online-status"
                >Offline</small>
            </div>

        </div>
    `;

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

/* LOAD MESSAGES */

await loadMessages(conversationId);

/* MARK RECEIVED MESSAGES AS READ */

const { error: readError } =
    await supabaseClient.rpc(
        "mark_messages_read",
        {
            p_conversation_id: conversationId
        }
    );

if (readError) {
    console.error(
        "Could not mark messages as read:",
        readError
    );
} else {
    await loadMessages(conversationId);
}

/* KEEP REALTIME MESSAGING */

subscribeToMessages(conversationId);


}

/* =========================================================
   LOAD MESSAGES — OPTIMIZED
========================================================= */
const patriodxReactionCache = window.patriodxReactionCache ||
    (window.patriodxReactionCache = new Map());

const patriodxAttachmentCache = window.patriodxAttachmentCache ||
    (window.patriodxAttachmentCache = new Map());

async function loadMessages(conversationId) {
    if (!messageList || !currentUser || !conversationId) return;

    const requestedConversation = conversationId;
    const requestedList = messageList;

    // Prevent older requests from replacing a newer conversation.
    window.patriodxMessageLoadToken =
        (window.patriodxMessageLoadToken || 0) + 1;

    const loadToken = window.patriodxMessageLoadToken;

    const isCurrentRequest = () =>
        activeConversationId === requestedConversation &&
        window.patriodxMessageLoadToken === loadToken &&
        messageList === requestedList;

    requestedList.innerHTML = `
        <div class="messaging-empty-state">
            <p>Loading messages...</p>
        </div>
    `;

    const { data: messages, error } = await supabaseClient
        .from("messages")
        .select("*")
        .eq("conversation_id", requestedConversation)
        .order("created_at", { ascending: true });

    if (!isCurrentRequest()) return;

    if (error) {
        console.error("Could not load messages:", error);
        requestedList.innerHTML = `
            <div class="messaging-empty-state">
                <p>Could not load messages. Please try again.</p>
            </div>
        `;
        return;
    }

    if (!messages || messages.length === 0) {
        requestedList.innerHTML = `
            <div class="messaging-empty-state">
                <h3>No messages yet</h3>
                <p>Send the first message.</p>
            </div>
        `;
        return;
    }

    const latestOutgoing = [...messages]
        .reverse()
        .find(message => message.sender_id === currentUser.id);

    // Render text and cached content immediately.
    const renderedMessages = messages.map(message => {
        const mine = message.sender_id === currentUser.id;
        const reactions = patriodxReactionCache.get(message.id) || "";

        const cachedAttachment =
            patriodxAttachmentCache.get(message.attachment_url);

        let attachmentHTML = "";

        if (message.attachment_url) {
            if (cachedAttachment) {
                attachmentHTML = `
                    <a href="${safe(cachedAttachment)}"
                       target="_blank"
                       rel="noopener noreferrer">
                        <img class="patriodx-attachment-preview"
                             src="${safe(cachedAttachment)}"
                             alt="Image attachment"
                             loading="lazy">
                    </a>
                `;
            } else {
                attachmentHTML = `
                    <div class="patriodx-attachment-loading"
                         data-attachment-for="${safe(message.id)}">
                    </div>
                `;
            }
        }

        const showSeen =
            mine &&
            latestOutgoing &&
            message.id === latestOutgoing.id &&
            message.is_read === true;

        return `
            <div class="message-row ${mine ? "mine" : "theirs"}"
                 data-message-id="${safe(message.id)}">
                <div class="message-bubble ${mine ? "mine" : "theirs"}">
                    ${
                        message.content
                            ? `<div class="message-content">${safe(message.content)}</div>`
                            : ""
                    }

                    ${attachmentHTML}

                    <span class="message-time">${safe(formatMessageTime(message.created_at))}</span>
                </div>

                <div class="patriodx-message-actions">
                    <button type="button"
                            class="patriodx-message-action"
                            data-react-heart="${safe(message.id)}"
                            aria-label="React with heart"
                            title="React with heart">❤️</button>

                    <button type="button"
                            class="patriodx-message-action"
                            data-react-laugh="${safe(message.id)}"
                            aria-label="React with laughter"
                            title="React with laughter">😂</button>

                    <button type="button"
                            class="patriodx-message-action"
                            data-react-like="${safe(message.id)}"
                            aria-label="React with thumbs up"
                            title="React with thumbs up">👍</button>

                    ${
                        mine
                            ? `<button type="button"
                                       class="patriodx-message-action danger-btn"
                                       data-delete-message="${safe(message.id)}">Delete</button>`
                            : ""
                    }
                </div>

                <div class="patriodx-reactions"
                     data-reactions-for="${safe(message.id)}">${reactions}</div>

                ${
                    showSeen
                        ? `<div class="message-seen-status">Seen</div>`
                        : ""
                }
            </div>
        `;
    });

    if (!isCurrentRequest()) return;

    requestedList.innerHTML = renderedMessages.join("");
    requestedList.scrollTop = requestedList.scrollHeight;

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // Resolve attachments and reactions after the messages are visible.
    // Keep a bounded number of concurrent requests to avoid flooding Supabase.
    const backgroundTasks = [];

    for (const message of messages) {
        if (message.attachment_url &&
            !patriodxAttachmentCache.has(message.attachment_url)) {
            backgroundTasks.push(async () => {
                try {
                    const url = await getMessageAttachmentUrl(
                        message.attachment_url
                    );

                    if (!url) return;

                    patriodxAttachmentCache.set(
                        message.attachment_url,
                        url
                    );

                    if (!isCurrentRequest()) return;

                    const row = requestedList.querySelector(
                        `[data-message-id="${CSS.escape(String(message.id))}"]`
                    );

                    const placeholder = row?.querySelector(
                        `[data-attachment-for="${CSS.escape(String(message.id))}"]`
                    );

                    if (placeholder) {
                        placeholder.outerHTML = `
                            <a href="${safe(url)}"
                               target="_blank"
                               rel="noopener noreferrer">
                                <img class="patriodx-attachment-preview"
                                     src="${safe(url)}"
                                     alt="Image attachment"
                                     loading="lazy">
                            </a>
                        `;
                    }
                } catch (attachmentError) {
                    console.error(
                        "Could not load message attachment:",
                        attachmentError
                    );
                }
            });
        }

        if (!patriodxReactionCache.has(message.id)) {
            backgroundTasks.push(async () => {
                try {
                    const reactionHTML = await getMessageReactions(message.id);

                    patriodxReactionCache.set(message.id, reactionHTML || "");

                    if (!isCurrentRequest()) return;

                    const reactionContainer = requestedList.querySelector(
                        `[data-reactions-for="${CSS.escape(String(message.id))}"]`
                    );

                    if (reactionContainer) {
                        reactionContainer.innerHTML = reactionHTML || "";
                    }
                } catch (reactionError) {
                    console.error(
                        "Could not load reactions for message:",
                        message.id,
                        reactionError
                    );
                }
            });
        }
    }

    // Run only four background tasks at once.
    let nextTask = 0;

    async function runBackgroundWorker() {
        while (nextTask < backgroundTasks.length) {
            const task = backgroundTasks[nextTask++];
            await task();
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(4, backgroundTasks.length) },
            () => runBackgroundWorker()
        )
    );
}


/* =========================================================
   PATRIODX MESSAGING ENHANCEMENTS
========================================================= */

async function getMessageReactions(messageId) {
    const { data, error } = await supabaseClient
        .from("message_reactions")
        .select("user_id, reaction")
        .eq("message_id", messageId);

    if (error) {
        console.error("Could not load reactions:", error);
        return "";
    }

    const counts = {};

    (data || []).forEach(item => {
        if (!counts[item.reaction]) {
            counts[item.reaction] = {
                count: 0,
                mine: false
            };
        }

        counts[item.reaction].count++;

        if (item.user_id === currentUser?.id) {
            counts[item.reaction].mine = true;
        }
    });

    return Object.entries(counts)
        .map(([emoji, details]) => `
            <button
                type="button"
                class="patriodx-reaction ${details.mine ? "mine" : ""}"
                data-reaction-message="${safe(messageId)}"
                data-reaction-emoji="${safe(emoji)}"
            >${safe(emoji)} ${details.count}</button>
        `)
        .join("");
}


async function toggleMessageReaction(messageId, reaction) {
    if (!currentUser) {
        showPATRIODXToast("Please sign in to react.", "warning");
        return;
    }

    const allowedReactions = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

    if (!messageId || !allowedReactions.includes(reaction)) {
        console.error("Invalid message reaction:", { messageId, reaction });
        return;
    }

    const row = messageList?.querySelector(
        `[data-message-id="${CSS.escape(String(messageId))}"]`
    );

    const container = row?.querySelector(".patriodx-reactions");

    if (!container) return;

    // Save the current UI so we can restore it if saving fails.
    const previousHTML = container.innerHTML;
    const previousCache = patriodxReactionCache.get(messageId);

    // Optimistically update the reaction immediately.
    const existingButton = [...container.querySelectorAll(
        "[data-reaction-emoji]"
    )].find(button => button.dataset.reactionEmoji === reaction);

    if (existingButton?.classList.contains("mine")) {
        const count = parseInt(existingButton.textContent.match(/\d+/)?.[0] || "0", 10);

        if (count <= 1) {
            existingButton.remove();
        } else {
            existingButton.textContent = `${reaction} ${count - 1}`;
            existingButton.classList.remove("mine");
        }
    } else if (existingButton) {
        const count = parseInt(existingButton.textContent.match(/\d+/)?.[0] || "0", 10);
        existingButton.textContent = `${reaction} ${count + 1}`;
        existingButton.classList.add("mine");
    } else {
        container.insertAdjacentHTML(
            "beforeend",
            `<button type="button"
                class="patriodx-reaction mine"
                data-reaction-message="${safe(messageId)}"
                data-reaction-emoji="${safe(reaction)}">${safe(reaction)} 1</button>`
        );
    }

    patriodxReactionCache.set(messageId, container.innerHTML);

    try {
        const { data: existing, error: lookupError } = await supabaseClient
            .from("message_reactions")
            .select("id, reaction")
            .eq("message_id", messageId)
            .eq("user_id", currentUser.id);

        if (lookupError) throw lookupError;

        const userReactions = existing || [];
        const sameReaction = userReactions.find(item => item.reaction === reaction);

        if (sameReaction) {
            const { error } = await supabaseClient
                .from("message_reactions")
                .delete()
                .eq("id", sameReaction.id)
                .eq("user_id", currentUser.id);

            if (error) throw error;
        } else if (userReactions.length > 0) {
            const { error } = await supabaseClient
                .from("message_reactions")
                .update({ reaction })
                .eq("id", userReactions[0].id)
                .eq("user_id", currentUser.id);

            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from("message_reactions")
                .insert({
                    message_id: messageId,
                    user_id: currentUser.id,
                    reaction
                });

            if (error) throw error;
        }

        // Refresh this message's reactions only, not the entire chat.
        const updatedHTML = await getMessageReactions(messageId);

        patriodxReactionCache.set(messageId, updatedHTML || "");

        if (activeConversationId && row.isConnected) {
            container.innerHTML = updatedHTML || "";
        }
    } catch (error) {
        console.error("PATRIODX reaction failed:", error);

        // Restore the previous state if Supabase rejects the change.
        if (row.isConnected) {
            container.innerHTML = previousHTML;
        }

        if (previousCache === undefined) {
            patriodxReactionCache.delete(messageId);
        } else {
            patriodxReactionCache.set(messageId, previousCache);
        }

        showPATRIODXToast(
            error.message || "Could not save reaction.",
            "error"
        );
    }
}
async function deleteOwnMessage(messageId) {
    if (!currentUser) return;

    const { data: message, error: lookupError } =
        await supabaseClient
            .from("messages")
            .select("id, sender_id, attachment_url, conversation_id")
            .eq("id", messageId)
            .single();

    if (lookupError || !message) {
        console.error("Could not find message:", lookupError);
        return;
    }

    if (message.sender_id !== currentUser.id) {
        showPATRIODXToast(
            "You can only delete your own messages.",
            "warning"
        );
        return;
    }

    const confirmed = await showPATRIODXConfirm(
        "Delete Message",
        "Are you sure you want to delete this message?"
    );

    if (!confirmed) return;

    const { error } = await supabaseClient
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("sender_id", currentUser.id);

    if (error) {
        console.error("Could not delete message:", error);

        showPATRIODXToast(
            "Could not delete the message.",
            "error"
        );

        return;
    }

    if (message.attachment_url) {
        const { error: storageError } = await supabaseClient.storage
            .from("message-attachments")
            .remove([message.attachment_url]);

        if (storageError) {
            console.warn("Attachment cleanup failed:", storageError);
        }
    }

    if (activeConversationId) {
        await loadMessages(activeConversationId);
    }

    showPATRIODXToast("Message deleted.", "success");
}


async function getMessageAttachmentUrl(path) {
    if (!path) return null;

    const { data, error } = await supabaseClient.storage
        .from("message-attachments")
        .createSignedUrl(path, 1800);

    if (error) {
        console.error("Could not create image link:", error);
        return null;
    }

    return data?.signedUrl || null;
}


async function uploadMessageAttachment(file) {
    if (!currentUser || !file) return null;

    if (!file.type.startsWith("image/")) {
        showPATRIODXToast("Please choose an image.", "warning");
        return null;
    }

    if (file.size > 5 * 1024 * 1024) {
        showPATRIODXToast(
            "Images must be 5 MB or smaller.",
            "warning"
        );
        return null;
    }

    const extension =
        file.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "") || "jpg";

    const path =
        `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabaseClient.storage
        .from("message-attachments")
        .upload(path, file, {
            upsert: false,
            contentType: file.type
        });

    if (error) {
        console.error("Image upload failed:", error);

        showPATRIODXToast(
            "Image upload failed.",
            "error"
        );

        return null;
    }

    return path;
}


/* ---------- DOUBLE-CLICK / DOUBLE-TAP HEART ---------- */

if (messageList && !messageList.dataset.reactionsReady) {
    messageList.dataset.reactionsReady = "true";

    let lastTapTime = 0;
    let lastTapMessage = null;

    messageList.addEventListener("dblclick", event => {
        const row = event.target.closest("[data-message-id]");

        if (row) {
            toggleMessageReaction(row.dataset.messageId, "❤️");
        }
    });

    messageList.addEventListener("touchend", event => {
        const row = event.target.closest("[data-message-id]");

        if (!row) return;

        const now = Date.now();
        const messageId = row.dataset.messageId;

        if (
            messageId === lastTapMessage &&
            now - lastTapTime < 350
        ) {
            toggleMessageReaction(messageId, "❤️");
            lastTapTime = 0;
            lastTapMessage = null;
        } else {
            lastTapTime = now;
            lastTapMessage = messageId;
        }
    }, { passive: true });

    messageList.addEventListener("click", event => {
        const heart = event.target.closest("[data-react-heart]");
        const laugh = event.target.closest("[data-react-laugh]");
        const like = event.target.closest("[data-react-like]");
        const existing = event.target.closest("[data-reaction-message]");
        const deleteButton = event.target.closest("[data-delete-message]");

        if (heart) {
            toggleMessageReaction(heart.dataset.reactHeart, "❤️");
        } else if (laugh) {
            toggleMessageReaction(laugh.dataset.reactLaugh, "😂");
        } else if (like) {
            toggleMessageReaction(like.dataset.reactLike, "👍");
        } else if (existing) {
            toggleMessageReaction(
                existing.dataset.reactionMessage,
                existing.dataset.reactionEmoji
            );
        } else if (deleteButton) {
            deleteOwnMessage(deleteButton.dataset.deleteMessage);
        }
    });
}

/* ---------- PRESS-AND-HOLD MESSAGE OPTIONS ---------- */

(function setupPATRIODXLongPress() {
    if (!messageList) return;

    if (messageList.dataset.longPressReady === "true") return;

    messageList.dataset.longPressReady = "true";

    let holdTimer = null;
    let heldMessage = null;
    let holdTriggered = false;

    function clearHoldTimer() {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    }

    function closeMessageOptions(exceptRow = null) {
        messageList
            .querySelectorAll(".message-row.actions-open")
            .forEach(row => {
                if (row !== exceptRow) {
                    row.classList.remove("actions-open");
                }
            });
    }

    messageList.addEventListener("pointerdown", event => {
        if (event.target.closest(".patriodx-message-actions")) return;
        if (event.target.closest(".patriodx-reactions")) return;

        const row = event.target.closest(".message-row[data-message-id]");

        if (!row) return;

        heldMessage = row;
        holdTriggered = false;

        clearHoldTimer();

        holdTimer = setTimeout(() => {
            holdTriggered = true;

            closeMessageOptions(row);

            row.classList.toggle("actions-open");

            if (navigator.vibrate) {
                navigator.vibrate(25);
            }
        }, 500);
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(eventName => {
        messageList.addEventListener(eventName, clearHoldTimer);
    });

    messageList.addEventListener("contextmenu", event => {
        const row = event.target.closest(".message-row[data-message-id]");

        if (!row) return;

        event.preventDefault();

        closeMessageOptions(row);
        row.classList.toggle("actions-open");
    });

    messageList.addEventListener("click", event => {
        const row = event.target.closest(".message-row[data-message-id]");

        if (!row) return;

        if (event.target.closest(".patriodx-message-actions")) return;
        if (event.target.closest(".patriodx-reactions")) return;

        if (holdTriggered && row === heldMessage) {
            event.preventDefault();
            event.stopPropagation();

            holdTriggered = false;
            return;
        }

        if (row.classList.contains("actions-open")) {
            row.classList.remove("actions-open");
        }
    }, true);

    document.addEventListener("click", event => {
        if (!event.target.closest(".message-row")) {
            closeMessageOptions();
        }
    });
})();
/* ---------- ATTACHMENT PICKER ---------- */

(function setupPATRIODXAttachmentPicker() {
    if (!messageForm || !messageInput) return;

    if (document.getElementById("patriodxAttachmentInput")) return;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "patriodxAttachmentInput";
    fileInput.accept = "image/*";
    fileInput.hidden = true;

    const attachButton = document.createElement("button");
    attachButton.type = "button";
    attachButton.id = "patriodxAttachButton";
    attachButton.textContent = "📎";
    attachButton.title = "Attach image";

    const fileLabel = document.createElement("span");
    fileLabel.id = "patriodxAttachmentName";
    fileLabel.className = "patriodx-attachment-name";

    const sendButton = document.getElementById("messageSendButton");

    messageForm.insertBefore(attachButton, messageInput);
    messageForm.appendChild(fileInput);

    if (sendButton) {
        messageForm.insertBefore(fileLabel, sendButton);
    } else {
        messageForm.appendChild(fileLabel);
    }

    messageInput.required = false;

    attachButton.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];

        if (!file) {
            fileLabel.textContent = "";
            return;
        }

        if (!file.type.startsWith("image/")) {
            showPATRIODXToast("Choose an image file.", "warning");
            fileInput.value = "";
            fileLabel.textContent = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showPATRIODXToast(
                "Images must be 5 MB or smaller.",
                "warning"
            );

            fileInput.value = "";
            fileLabel.textContent = "";
            return;
        }

        fileLabel.textContent = file.name;
    });
})();

/* ---------- PATRIODX MESSAGING ENHANCEMENT STYLES ---------- */

(function addPATRIODXMessagingStyles() {
    if (document.getElementById("patriodxMessagingStyles")) return;

    const style = document.createElement("style");
    style.id = "patriodxMessagingStyles";

    style.textContent = `
        /* Keep message controls hidden until requested */
        .patriodx-message-actions {
            display: none;
            align-items: center;
            flex-wrap: wrap;
            gap: 7px;
            margin: 8px 0;
            padding: 7px 10px;
            width: fit-content;
            max-width: 100%;
            background: var(--card-bg, #fff);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: 24px;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.10);
            animation: patriodxReactionAppear 0.16s ease-out;
        }

        /* Reveal controls on hover or when a message is held */
        .message-row:hover .patriodx-message-actions,
        .message-row.actions-open .patriodx-message-actions {
            display: flex;
        }

        .patriodx-message-action {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 34px;
            min-height: 34px;
            padding: 5px 9px;
            border: none;
            border-radius: 18px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-size: 18px;
            transition: background 0.15s, transform 0.15s;
        }

        .patriodx-message-action:hover {
            background: rgba(124, 58, 237, 0.10);
            transform: scale(1.12);
        }

        /* Delete remains accessible in the message options */
        .patriodx-message-action.danger-btn {
            font-size: 12px;
            color: #dc2626;
            padding: 6px 10px;
        }

        /* Existing reactions displayed beneath a message */
        .patriodx-reactions {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 5px;
            margin: 5px 0 8px;
        }

        .patriodx-reaction {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 9px;
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: 18px;
            background: var(--card-bg, #fff);
            color: inherit;
            cursor: pointer;
            font-size: 12px;
            transition: transform 0.15s;
        }

        .patriodx-reaction:hover {
            transform: scale(1.06);
        }

        .patriodx-reaction.mine {
            border-color: #7c3aed;
            background: #f3e8ff;
            color: #6d28d9;
        }

        /* Subtle indication when a message is selected */
        .message-row.actions-open .message-bubble {
            outline: 2px solid rgba(124, 58, 237, 0.25);
            outline-offset: 2px;
        }

        /* Private image attachments */
        .patriodx-attachment-preview {
            display: block;
            max-width: min(260px, 100%);
            max-height: 280px;
            margin-top: 8px;
            border-radius: 12px;
            object-fit: contain;
        }

        .patriodx-attachment-name {
            overflow-wrap: anywhere;
            font-size: 12px;
        }

        /* Typing indicator — light mode */
.patriodx-typing-indicator {
    display: block;
    min-height: 18px;
    margin: 5px 0 0;
    padding: 0;
    color: #475569 !important;
    font-size: 12px;
    line-height: 1.4;
    font-weight: 500;
}

.patriodx-typing-indicator:empty {
    display: none;
}

.patriodx-typing-indicator.is-typing {
    display: block;
}

/* Typing indicator — dark mode */
body.dark-mode .patriodx-typing-indicator {
    color: #cbd5e1 !important;
}
/* Reaction controls — light mode */
.patriodx-message-actions,
.patriodx-reaction {
    background: var(--card-bg, #ffffff);
    color: var(--text-color, #0f172a);
    border-color: var(--border-color, #e2e8f0);
}

.patriodx-message-action {
    color: var(--text-color, #0f172a);
}

.patriodx-reaction.mine {
    background: var(--reaction-selected-bg, #f3e8ff);
    color: var(--reaction-selected-text, #6d28d9);
    border-color: var(--primary-color, #7c3aed);
}

/* Reaction controls — dark mode */
body.dark-mode .patriodx-message-actions,
body.dark-mode .patriodx-reaction {
    background: #111827;
    color: #f1f5f9;
    border-color: #374151;
}

body.dark-mode .patriodx-message-action {
    color: #f1f5f9;
}

body.dark-mode .patriodx-reaction.mine {
    background: #3b2767;
    color: #e9d5ff;
    border-color: #a78bfa;
}

body.dark-mode .patriodx-message-action:hover,
body.dark-mode .patriodx-reaction:hover {
    background: #273449;
}
        /* Presence indicators */
        .patriodx-online-dot {
            display: inline-block;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: #22c55e;
        }

        .patriodx-online-dot.offline {
            background: #9ca3af;
        }

        @keyframes patriodxReactionAppear {
            from {
                opacity: 0;
                transform: translateY(4px) scale(0.96);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @media (max-width: 600px) {
            .patriodx-attachment-preview {
                max-width: 200px;
            }

            .patriodx-message-actions {
                gap: 5px;
                padding: 5px 8px;
            }

            .patriodx-message-action {
                min-width: 38px;
                min-height: 38px;
            }

            /* On touch screens, show controls only for a selected message */
            .message-row:hover .patriodx-message-actions {
                display: none;
            }
.message-row.actions-open .patriodx-message-actions {
    display: flex;
}

.patriodx-message-actions button {
    pointer-events: auto;
    position: relative;
    z-index: 2;
}
            .message-row.actions-open .patriodx-message-actions {
                display: flex;
            }
        }
    `;

    document.head.appendChild(style);
})();

/* =========================================================
SEND MESSAGE — INSTANT TEXT UI + BACKGROUND SAVE
========================================================= */

if (messageForm && !messageForm.dataset.sendHandlerReady) {
    messageForm.dataset.sendHandlerReady = "true";

    messageForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!currentUser || !activeConversationId) {
            showPATRIODXToast(
                "Please sign in and select a conversation.",
                "warning"
            );
            return;
        }

        const content = messageInput.value.trim();
        const attachmentInput =
            document.getElementById("patriodxAttachmentInput");
        const attachmentFile = attachmentInput?.files?.[0] || null;

        if (!content && !attachmentFile) return;

        if (attachmentFile) {
            if (!attachmentFile.type.startsWith("image/")) {
                showPATRIODXToast("Please select an image file.", "warning");
                return;
            }

            if (attachmentFile.size > 5 * 1024 * 1024) {
                showPATRIODXToast("Images must be 5 MB or smaller.", "warning");
                return;
            }
        }

        const conversationId = activeConversationId;
        const temporaryId = `pending-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        // Snapshot the current message before clearing the composer.
        messageInput.value = "";
        messageInput.required = false;

        if (attachmentInput) attachmentInput.value = "";

        const attachmentName =
            document.getElementById("patriodxAttachmentName");
        if (attachmentName) attachmentName.textContent = "";

        // Text messages appear immediately. Attachments still need uploading.
        let attachmentPath = null;

        const optimisticRow = document.createElement("div");
        optimisticRow.className = "message-row mine pending";
        optimisticRow.dataset.messageId = temporaryId;

        optimisticRow.innerHTML = `
            <div class="message-bubble mine">
                ${content
                    ? `<div class="message-content">${safe(content)}</div>`
                    : ""}
                <span class="message-time">${safe(formatMessageTime(createdAt))}</span>
            </div>
            <div class="message-send-status" aria-live="polite">Sending…</div>
        `;

        if (!attachmentFile && messageList &&
            activeConversationId === conversationId) {
            messageList.querySelector(".messaging-empty-state")?.remove();
            messageList.appendChild(optimisticRow);
            messageList.scrollTop = messageList.scrollHeight;
        }

        messageSendButton.disabled = true;

        try {
            if (attachmentFile) {
                showPATRIODXToast("Uploading image…", "info");
                attachmentPath =
                    await uploadMessageAttachment(attachmentFile);

                if (!attachmentPath) {
                    messageInput.value = content;
                    return;
                }
            }

            const { data: savedMessage, error: messageError } =
                await supabaseClient
                    .from("messages")
                    .insert({
                        conversation_id: conversationId,
                        sender_id: currentUser.id,
                        content: content || "",
                        attachment_url: attachmentPath
                    })
                    .select("*")
                    .single();

if (messageError) throw messageError;

// Remove the temporary message after Supabase confirms saving.
// The realtime subscription should display the confirmed message.
optimisticRow.remove();



            // Notification work runs separately and cannot hold up sending.
            void (async () => {
                try {
                    const { data: members, error: membersError } =
                        await supabaseClient
                            .from("conversation_members")
                            .select("user_id")
                            .eq("conversation_id", conversationId);

                    if (membersError) throw membersError;

                    const recipient = (members || []).find(
                        member => member.user_id !== currentUser.id
                    );

                    if (!recipient) return;

                    const senderName =
                        currentUser.user_metadata?.display_name ||
                        currentUser.user_metadata?.username ||
                        currentUser.email ||
                        "PATRIODX User";

                    const { error: notificationError } =
                        await supabaseClient
                            .from("notifications")
                            .insert({
                                user_id: recipient.user_id,
                                sender_id: currentUser.id,
                                type: "message",
                                title: senderName,
                                message: attachmentFile && !content
                                    ? "sent you an image."
                                    : attachmentFile
                                        ? "sent you a message with an image."
                                        : "sent you a message.",
                                related_id: conversationId,
                                is_read: false
                            });

                    if (notificationError) throw notificationError;
                } catch (notificationError) {
                    console.error(
                        "Message notification failed:",
                        notificationError
                    );
                }
            })();

        } catch (error) {
            console.error("Could not send message:", error);

            optimisticRow.remove();

            // Restore text so the user can retry if saving failed.
            messageInput.value = content;

            showPATRIODXToast(
                "Message wasn't sent. Your text has been restored so you can retry.",
                "error"
            );

        } finally {
            messageSendButton.disabled = false;
            messageInput.focus();
        }
    });
}


/* =========================================================
   REALTIME MESSAGES — OPTIMIZED
========================================================= */
function subscribeToMessages(conversationId) {
    if (messagingRealtimeChannel) {
        supabaseClient.removeChannel(messagingRealtimeChannel);
        messagingRealtimeChannel = null;
    }

    messagingRealtimeChannel = supabaseClient
        .channel(`messages-${conversationId}`, {
            config: {
                presence: {
                    key: currentUser.id
                }
            }
        })

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "messages",
                filter: `conversation_id=eq.${conversationId}`
            },
            async (payload) => {
                if (activeConversationId !== conversationId) return;

                const message = payload.new;
                const oldMessage = payload.old;

                // Deletions should remove only the affected message.
                if (payload.eventType === "DELETE") {
                    const deletedRow = messageList?.querySelector(
                        `[data-message-id="${CSS.escape(String(oldMessage?.id))}"]`
                    );
                    deletedRow?.remove();
                    return;
                }

                if (!message?.id) return;

                const existingRow = messageList?.querySelector(
                    `[data-message-id="${CSS.escape(String(message.id))}"]`
                );

                // If this is an UPDATE, refresh the conversation only when
                // the message isn't already rendered and cannot be updated safely.
                if (payload.eventType === "UPDATE") {
                    if (!existingRow) {
                        void loadMessages(conversationId);
                        return;
                    }

                    const content = existingRow.querySelector(".message-content");

                    if (content && content.textContent !== (message.content || "")) {
                        content.textContent = message.content || "";
                    }

                    const seen = existingRow.querySelector(".message-seen-status");

                    if (message.sender_id === currentUser.id && message.is_read) {
                        if (!seen) {
                            const status = document.createElement("div");
                            status.className = "message-seen-status";
                            status.textContent = "Seen";
                            existingRow.appendChild(status);
                        }
                    } else {
                        seen?.remove();
                    }

                    return;
                }

                // Ignore an INSERT if the message is already on screen.
                if (existingRow) return;

                const mine = message.sender_id === currentUser.id;

                // Build the new row without reloading the conversation.
                const row = document.createElement("div");
                row.className = `message-row ${mine ? "mine" : "theirs"}`;
                row.dataset.messageId = message.id;

                row.innerHTML = `
                    <div class="message-bubble ${mine ? "mine" : "theirs"}">
                        ${
                            message.content
                                ? `<div class="message-content">${safe(message.content)}</div>`
                                : ""
                        }
                        <span class="message-time">${safe(formatMessageTime(message.created_at))}</span>
                    </div>

                    <div class="patriodx-message-actions">
                        <button type="button"
                            class="patriodx-message-action"
                            data-react-heart="${safe(message.id)}"
                            aria-label="React with heart">❤️</button>
                        <button type="button"
                            class="patriodx-message-action"
                            data-react-laugh="${safe(message.id)}"
                            aria-label="React with laughter">😂</button>
                        <button type="button"
                            class="patriodx-message-action"
                            data-react-like="${safe(message.id)}"
                            aria-label="React with thumbs up">👍</button>
                        ${
                            mine
                                ? `<button type="button"
                                    class="patriodx-message-action danger-btn"
                                    data-delete-message="${safe(message.id)}">Delete</button>`
                                : ""
                        }
                    </div>

                    <div class="patriodx-reactions"
                        data-reactions-for="${safe(message.id)}"></div>
                `;

                messageList.querySelector(".messaging-empty-state")?.remove();
                messageList.appendChild(row);
                messageList.scrollTop = messageList.scrollHeight;

                // Load this message's reactions in the background.
                void getMessageReactions(message.id)
                    .then(html => {
                        patriodxReactionCache.set(message.id, html || "");

                        if (row.isConnected) {
                            const reactions = row.querySelector(".patriodx-reactions");
                            if (reactions) reactions.innerHTML = html || "";
                        }
                    })
                    .catch(error => {
                        console.error("Could not load new message reactions:", error);
                    });

                // Mark incoming messages read without blocking the UI.
                if (!mine) {
                    void supabaseClient.rpc("mark_messages_read", {
                        p_conversation_id: conversationId
                    }).then(({ error }) => {
                        if (error) {
                            console.error("Read receipt update failed:", error);
                        }
                    });
                }
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "message_reactions"
            },
            async (payload) => {
                if (activeConversationId !== conversationId) return;

                const messageId =
                    payload?.new?.message_id ||
                    payload?.old?.message_id;

                if (!messageId) return;

                try {
                    const html = await getMessageReactions(messageId);
                    patriodxReactionCache.set(messageId, html || "");

                    const row = messageList?.querySelector(
                        `[data-message-id="${CSS.escape(String(messageId))}"]`
                    );

                    const container = row?.querySelector(".patriodx-reactions");

                    if (container) container.innerHTML = html || "";
                } catch (error) {
                    console.error("Could not refresh reactions:", error);
                }
            }
        )

        .on("broadcast", { event: "typing" }, async ({ payload }) => {
            if (!payload || payload.user_id === currentUser.id) return;

            const header = document.getElementById("chatHeader");
            if (!header) return;

            let indicator = document.getElementById("patriodxTypingIndicator");

            if (!indicator) {
                indicator = document.createElement("p");
                indicator.id = "patriodxTypingIndicator";
                indicator.className = "patriodx-typing-indicator";
                header.appendChild(indicator);
            }

            clearTimeout(window.patriodxTypingTimer);

            if (payload.typing === false) {
                indicator.textContent = "";
                indicator.classList.remove("is-typing");
                return;
            }

            let senderName = "";

            try {
                const { data: profile, error } = await supabaseClient
                    .from("profiles")
                    .select("display_name, username")
                    .eq("id", payload.user_id)
                    .maybeSingle();

                if (error) throw error;

                senderName =
                    profile?.display_name?.trim() ||
                    (profile?.username ? `@${profile.username}` : "");
            } catch (error) {
                console.error("Could not load typing user's profile:", error);
            }

            if (activeConversationId !== conversationId) return;

            indicator.textContent = `${senderName || "Someone"} is typing…`;
            indicator.classList.add("is-typing");

            window.patriodxTypingTimer = setTimeout(() => {
                indicator.textContent = "";
                indicator.classList.remove("is-typing");
            }, 3000);
        })

        .on("presence", { event: "sync" }, () => {
            const states = messagingRealtimeChannel.presenceState();

            document.querySelectorAll("[data-presence-user]").forEach(node => {
                const userId = node.dataset.presenceUser;
                const online = Boolean(states[userId]);

                node.classList.toggle("online", online);
                node.classList.toggle("offline", !online);
                node.title = online ? "Online" : "Offline";
            });

            const onlineDot = document.getElementById("patriodxChatOnlineDot");
            const onlineStatus = document.getElementById("patriodxChatOnlineStatus");

            if (!onlineDot || !onlineStatus) return;

            const otherUserId = onlineDot.dataset.userId;
            const online = Boolean(otherUserId && states[otherUserId]);

            onlineDot.classList.toggle("online", online);
            onlineDot.classList.toggle("offline", !online);
            onlineDot.title = online ? "Online" : "Offline";

            onlineStatus.textContent = online ? "Online" : "Offline";
            onlineStatus.classList.toggle("online", online);
        })

        .subscribe(async status => {
            if (status === "SUBSCRIBED") {
                await messagingRealtimeChannel.track({
                    user_id: currentUser.id,
                    online_at: new Date().toISOString()
                });
            }
               });

    if (typeof setupPATRIODXTyping === "function") {
        setupPATRIODXTyping(conversationId);
    }
}
/* =========================================================
   NEW CONVERSATION — OPEN USER PICKER
========================================================= */

if (newConversationButton) {
    newConversationButton.addEventListener("click", async function () {
        if (!currentUser) {
            showPATRIODXToast("Please log in first.", "warning");
            return;
        }

        if (!newConversationModal) return;

        newConversationModal.style.display = "flex";
        document.body.style.overflow = "hidden";

        if (conversationUserSearch) {
            conversationUserSearch.value = "";
        }

        await loadConversationUsers();

        requestAnimationFrame(() => {
            conversationUserSearch?.focus();
        });

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    });
}
/* =========================================================
   START MESSAGING
========================================================= */

if (
    conversationList &&
    currentUser
) {

    loadConversations();

}


/* =========================================================
   MAKE FUNCTIONS AVAILABLE
========================================================= */

window.openConversation =
    openConversation;
    document.addEventListener("click", async function (event) {
    const profileTarget = event.target.closest(
        "[data-open-chat-profile]"
    );

    if (!profileTarget) return;

    const userId = profileTarget.dataset.openChatProfile;

    if (!userId || !userId.trim()) return;

    event.preventDefault();

    try {
        await loadPublicProfile(userId);

        document.getElementById("publicProfileCard")
            ?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
    } catch (error) {
        console.error("Could not open chat user's profile:", error);

        showPATRIODXToast(
            "Could not open this profile. Please try again.",
            "error"
        );
    }
});

document.addEventListener("keydown", function (event) {
    const profileTarget = event.target.closest(
        "[data-open-chat-profile]"
    );

    if (!profileTarget) return;

    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        profileTarget.click();
    }
});
/* =========================================================
   PATRIODX NOTIFICATIONS
========================================================= */

const notificationList =
    document.getElementById("notificationList");

const notificationStatus =
    document.getElementById("notificationStatus");

const markAllNotificationsButton =
    document.getElementById(
        "markAllNotificationsButton"
    );


/* ---------------------------------------------------------
   LOAD NOTIFICATIONS
--------------------------------------------------------- */
/* =========================================================
   NOTIFICATIONS
========================================================= */

let notificationsCache = [];
let notificationFilter = "all";


async function loadNotifications() {

    if (!currentUser) {
        return;
    }

    const notificationList =
        document.getElementById("notificationsList");

    if (!notificationList) {
        return;
    }

    notificationList.innerHTML = `
        <div class="notifications-empty">
            <div class="notifications-empty-icon">
                <i data-lucide="loader-circle"></i>
            </div>
            <h3>Loading notifications...</h3>
            <p>Please wait.</p>
        </div>
    `;

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }


    const { data, error } =
        await supabaseClient
            .from("notifications")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", {
                ascending: false
            });
if (error) {
    console.error("Error loading notifications:", error);
    return;
}

const senderIds = [
    ...new Set(
        (data || [])
            .map(notification => notification.sender_id)
            .filter(Boolean)
    )
];

let senderProfiles = {};

if (senderIds.length > 0) {
    const { data: profiles, error: profilesError } =
        await supabaseClient
            .from("profiles")
            .select(
                "id, username, display_name, is_verified, is_owner, verification_expires_at"
            )
            .in("id", senderIds);

    if (profilesError) {
        console.error(
            "Error loading notification sender profiles:",
            profilesError
        );
    } else {
        senderProfiles = Object.fromEntries(
            (profiles || []).map(profile => [
                profile.id,
                profile
            ])
        );
    }
}

    if (error) {

        console.error(
            "Could not load notifications:",
            error
        );

        notificationList.innerHTML = `
            <div class="notifications-empty">
                <div class="notifications-empty-icon">
                    <i data-lucide="triangle-alert"></i>
                </div>
                <h3>Could not load notifications</h3>
                <p>
                    ${error.message || "Please try again."}
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }
window.notificationSenderProfiles = senderProfiles;

    notificationsCache = data || [];

    renderNotifications();
}


/* ---------------------------------------------------------
   RENDER NOTIFICATIONS
--------------------------------------------------------- */

function renderNotifications() {

    const notificationList =
        document.getElementById("notificationsList");

    if (!notificationList) {
        return;
    }


    let notifications =
        [...notificationsCache];


    if (notificationFilter === "unread") {

        notifications =
            notifications.filter(
                notification =>
                    notification.is_read !== true
            );
    }


    if (!notifications.length) {

        notificationList.innerHTML = `
            <div class="notifications-empty">

                <div class="notifications-empty-icon">
                    <i data-lucide="bell-off"></i>
                </div>

                <h3>
                    ${
                        notificationFilter === "unread"
                            ? "You're all caught up"
                            : "No notifications yet"
                    }
                </h3>

                <p>
                    ${
                        notificationFilter === "unread"
                            ? "You have no unread notifications."
                            : "New activity will appear here."
                    }
                </p>

            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    notificationList.innerHTML =
        notifications.map(notification => {

            const isUnread =
                notification.is_read !== true;


            let icon = "bell";


            if (notification.type === "like") {
                icon = "heart";
            }

            if (notification.type === "comment") {
                icon = "message-circle";
            }

            if (notification.type === "message") {
                icon = "mail";
            }

            if (notification.type === "sale") {
                icon = "shopping-cart";
            }

            if (notification.type === "system") {
                icon = "settings";
            }

            if (notification.type === "follow") {
                icon = "user-plus";
            }


            const createdAt =
                notification.created_at
                    ? new Date(
                        notification.created_at
                    ).toLocaleString()
                    : "";


            return `
                <div
                    class="notification-item ${
                        isUnread ? "unread" : ""
                    }"
                    onclick="handleNotificationClick('${notification.id}')"
                >

                    <div class="notification-icon">
                        <i data-lucide="${icon}"></i>
                    </div>


                    <div class="notification-content">

                        <p class="notification-text">

                            <strong>
    ${
        notification.title ||
        "PATRIODX Notification"
    }
    ${
        window.notificationSenderProfiles?.[notification.sender_id] &&
        typeof getPATRIODXBadge === "function"
            ? getPATRIODXBadge(
                window.notificationSenderProfiles[notification.sender_id]
            )
            : ""
    }
</strong>

                            ${
                                notification.message
                                    ? `<br>${notification.message}`
                                    : ""
                            }

                        </p>


                        <span class="notification-time">
                            ${createdAt}
                        </span>

                    </div>


                    ${
                        isUnread
                            ? `
                                <span
                                    class="notification-unread-dot"
                                    aria-label="Unread"
                                ></span>
                            `
                            : ""
                    }

                </div>
            `;

        }).join("");


   if (typeof lucide !== "undefined") {
    lucide.createIcons();
}

updateNotificationUnreadBadge();
}

function updateNotificationUnreadBadge() {

    const badge =
        document.getElementById(
            "notificationUnreadBadge"
        );

    if (!badge) {
        return;
    }

    const unreadCount =
        notificationsCache.filter(
            notification =>
                notification.is_read !== true
        ).length;

    if (unreadCount <= 0) {

        badge.style.display = "none";

        return;
    }

    badge.textContent =
        unreadCount > 99
            ? "99+"
            : unreadCount;

    badge.style.display = "inline-flex";
}
/* ---------------------------------------------------------
NOTIFICATION CLICK
--------------------------------------------------------- */

async function handleNotificationClick(notificationId) {


const notification =
    notificationsCache.find(
        item => item.id === notificationId
    );

if (!notification) {
    return;
}

if (notification.is_read !== true) {
    await markNotificationRead(
        notificationId,
        false
    );
}

const type =
    (notification.type || "").toLowerCase();

/* -----------------------------------------------------
LIKE / COMMENT — OPEN THE POST IN THE EXISTING VIEWER
----------------------------------------------------- */

if (
    type === "like" ||
    type === "comment" ||
    type === "tag"
) {
const postId = notification.related_id;


if (!postId) {
    showPATRIODXToast(
        "This notification has no linked post.",
        "info"
    );
    return;
}

try {
    // Fetch the exact post linked to this notification.
    const { data: post, error: postError } =
        await supabaseClient
            .from("posts")
            .select("*")
            .eq("id", postId)
            .maybeSingle();

    if (postError) throw postError;

    if (!post) {
        showPATRIODXToast(
            "This post is no longer available.",
            "info"
        );
        return;
    }

    // Fetch the post author's profile.
    const { data: authorProfile, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select("display_name, username")
            .eq("id", post.user_id)
            .maybeSingle();

    if (profileError) throw profileError;

    const author =
        authorProfile?.display_name ||
        authorProfile?.username ||
        "PATRIODX User";

    // Reuse the existing Instagram-style post viewer.
    openProfilePostViewer({
        postId: post.id,
        imageUrl: post.image_url || "",
        videoUrl: post.video_url || "",
        author: author,
        caption: post.content || "",
        date: post.created_at
            ? formatDate(post.created_at)
            : ""
    });

    // For comment notifications, focus the comment input.
    if (type === "comment") {
        window.setTimeout(() => {
            document
                .getElementById("profilePostViewerCommentInput")
                ?.focus();
        }, 300);
    }

} catch (error) {
    console.error(
        "Could not open notification post:",
        error
    );

    showPATRIODXToast(
        "Could not open this post. Please try again.",
        "error"
    );
}

return;

}

/* -----------------------------------------------------
   MESSAGE
----------------------------------------------------- */

if (type === "message") {
    navigatePATRIODX("messaging");
    return;
}

/* -----------------------------------------------------
   FOLLOW — OPEN THE FOLLOWER'S PUBLIC PROFILE
----------------------------------------------------- */

if (type === "follow") {

    const followerId =
        notification.related_id;

    navigatePATRIODX("profile");

    if (
        followerId &&
        typeof loadPublicProfile === "function"
    ) {

        await loadPublicProfile(followerId);

        const profileCard =
            document.getElementById(
                "publicProfileCard"
            );

        if (profileCard) {
            profileCard.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }

    }

    return;
}

/* -----------------------------------------------------
   SALE
----------------------------------------------------- */

if (type === "sale") {
    navigatePATRIODX("sales");
    return;
}

/* -----------------------------------------------------
   SYSTEM
----------------------------------------------------- */

if (type === "system") {
    navigatePATRIODX("home");
}


}



/* ---------------------------------------------------------
   MARK ONE AS READ
--------------------------------------------------------- */

async function markNotificationRead(
    notificationId,
    reload = true
) {

    if (!currentUser) {
        return;
    }


    const { error } =
        await supabaseClient
            .from("notifications")
            .update({
                is_read: true
            })
            .eq(
                "id",
                notificationId
            )
            .eq(
                "user_id",
                currentUser.id);


    if (error) {

        console.error(
            "Could not mark notification as read:",
            error
        );

        return;
    }


    const notification =
        notificationsCache.find(
            item =>
                item.id === notificationId
        );


    if (notification) {
        notification.is_read = true;
    }


    if (reload) {
        renderNotifications();
    }
}


/* ---------------------------------------------------------
   MARK ALL AS READ
--------------------------------------------------------- */

function setupNotificationActions() {

    const markAllButton =
        document.getElementById(
            "markAllNotificationsButton"
        );

    if (!markAllButton) {
        return;
    }

    if (
        markAllButton.dataset.ready === "true"
    ) {
        return;
    }

    markAllButton.dataset.ready = "true";

    markAllButton.addEventListener(
        "click",
        async function () {

            if (!currentUser) {
                return;
            }

            const unreadNotifications =
                notificationsCache.filter(
                    notification =>
                        notification.is_read !== true
                );

            if (!unreadNotifications.length) {

                renderNotifications();

                return;
            }

            markAllButton.disabled = true;

            markAllButton.innerHTML =
                '<i data-lucide="loader-circle"></i> Marking...';

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            const { error } =
                await supabaseClient
                    .from("notifications")
                    .update({
                        is_read: true
                    })
                    .eq(
                        "user_id",
                        currentUser.id
                    )
                    .eq(
                        "is_read",
                        false
                    );

           if (error) {

    console.error(
        "Could not mark all notifications as read:",
        error
    );

    showPATRIODXToast(
        "Could not mark notifications as read. " +
        error.message,
        "error"
    );

    markAllButton.disabled = false;

    markAllButton.innerHTML =
        '<i data-lucide="check-check"></i> Mark all as read';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    return;
}
            notificationsCache =
                notificationsCache.map(
                    notification => ({
                        ...notification,
                        is_read: true
                    })
                );

            notificationFilter = "all";

            document
                .querySelectorAll(".notification-filter")
                .forEach(button => {
                    button.classList.remove("active");
                });

            const allButton =
                document.querySelector(
                    '[data-notification-filter="all"]'
                );

            if (allButton) {
                allButton.classList.add("active");
            }

            renderNotifications();

            markAllButton.disabled = false;

            markAllButton.innerHTML =
                '<i data-lucide="check-check"></i> Mark all as read';

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

        }
    );
}
/* ---------------------------------------------------------
   NOTIFICATION FILTERS
--------------------------------------------------------- */
function setNotificationFilter(filter, button) {

    notificationFilter = filter;

    document
        .querySelectorAll(".notification-filter")
        .forEach(item => {
            item.classList.remove("active");
        });

    button.classList.add("active");

    renderNotifications();
}
function setupNotificationFilters() {

    const filters =
        document.querySelectorAll(
            ".notification-filter"
        );


    filters.forEach(button => {

        if (
            button.dataset.ready === "true"
        ) {
            return;
        }


        button.dataset.ready = "true";


        button.addEventListener(
            "click",
            function() {

                filters.forEach(
                    item =>
                        item.classList.remove(
                            "active"
                        )
                );


                this.classList.add("active");


                notificationFilter =
                    this.dataset.notificationFilter ||
                    "all";


                renderNotifications();

            }
        );

    });
}


/* ---------------------------------------------------------
   INITIALIZE NOTIFICATIONS
--------------------------------------------------------- */

function setupNotifications() {

    setupNotificationActions();

    setupNotificationFilters();

    loadNotifications();
}


if (currentUser) {
    setupNotifications();
}


/* ---------------------------------------------------------
   REALTIME NOTIFICATIONS
--------------------------------------------------------- */

if (currentUser) {

    supabaseClient
        .channel(
            "patriodx-notifications-" +
            currentUser.id
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter:
                    "user_id=eq." +
                    currentUser.id
            },
            function() {

                loadNotifications();

            }
        )
        .subscribe();
}
/* ---------------------------------------------------------
   GLOBAL FUNCTION
--------------------------------------------------------- */

window.markNotificationRead =
    markNotificationRead;
/* =========================================================
   PATRIODX PROFILE / IDENTITY SYSTEM
========================================================= */

const profileForm =
    document.getElementById("profileForm");

const editProfileButton =
    document.getElementById("editProfileButton");

const cancelProfileButton =
    document.getElementById("cancelProfileButton");

const profileEditor =
    document.getElementById("profileEditor");

const profileUsernameInput =
    document.getElementById("profileUsernameInput");

const profileDisplayNameInput =
    document.getElementById("profileDisplayNameInput");

const profileBioInput =
    document.getElementById("profileBioInput");

const profileAvatarInput =
    document.getElementById("profileAvatarInput");

const profileDisplayName =
    document.getElementById("profileDisplayName");
const profileBadge =
    document.getElementById("profileBadge");
const profileUsername =
    document.getElementById("profileUsername");

const profileBio =
    document.getElementById("profileBio");

const profileAvatar =
    document.getElementById("profileAvatar");

const profilePosts =
    document.getElementById("profilePosts");

const profilePostCount =
    document.getElementById("profilePostCount");



if (cancelProfileButton && profileEditor) {
    cancelProfileButton.addEventListener("click", function () {
        profileEditor.style.display = "none";
    });
}

/* =========================================================
   LOAD PROFILE
========================================================= */

async function loadMyProfile() {

    if (!currentUser) return;


    const { data: profile, error } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq(
                "id",
                currentUser.id
            )
            .maybeSingle();


    if (error) {

        console.error(
            "Profile loading error:",
            error
        );

        return;
    }


    currentProfile =
        profile;


    /*
       If profile doesn't exist,
       automatically create a basic one.
    */

    if (!profile) {

        const defaultName =
            currentUser.user_metadata?.full_name ||
            currentUser.email?.split("@")[0] ||
            "PATRIODX User";


        const { data: newProfile, error: createError } =
            await supabaseClient
                .from("profiles")
                .insert({

    id:
        currentUser.id,

    display_name:
        defaultName,

    username:
        currentUser.user_metadata?.username || null

})
                .select()
                .single();


        if (createError) {

            console.error(
                "Could not create profile:",
                createError
            );

            return;
        }


        currentProfile =
            newProfile;
    }


    renderMyProfile();
await loadMyFollowCounts();
    await loadMyProfilePosts();
}

/* =========================================================
   PROFILE EDITOR
========================================================= */

if (editProfileButton && profileEditor) {

    editProfileButton.addEventListener("click", function () {

        if (!currentProfile) {

            showPATRIODXToast(
                "Your profile is still loading. Please try again.",
                "warning"
            );

            return;
        }
        /* Fill the editor with the current profile */

        if (profileUsernameInput) {
            profileUsernameInput.value =
                currentProfile.username || "";
        }

        if (profileDisplayNameInput) {
            profileDisplayNameInput.value =
                currentProfile.display_name || "";
        }

        if (profileBioInput) {
            profileBioInput.value =
                currentProfile.bio || "";
        }

        /* Clear old file selection */

        if (profileAvatarInput) {
            profileAvatarInput.value = "";
        }

        /* Open editor */

        profileEditor.style.display = "block";

        profileEditor.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    });

}


if (cancelProfileButton && profileEditor) {

    cancelProfileButton.addEventListener("click", function () {

        profileEditor.style.display = "none";

        if (profileAvatarInput) {
            profileAvatarInput.value = "";
        }

    });

}

/* =========================================================
   USERNAME VALIDATION
========================================================= */

function renderMyProfile() {

    if (!currentProfile) return;


    const displayName =
        currentProfile.display_name ||
        "PATRIODX User";


    const username =
        currentProfile.username ||
        "username";


    const bio =
        currentProfile.bio ||
        "Welcome to PATRIODX.";


    if (profileDisplayName) {

        profileDisplayName.textContent =
            displayName;
    }


    /* =====================================================
       PATRIODX VERIFICATION BADGE
    ===================================================== */

if (profileBadge) {

    profileBadge.innerHTML =
        getPATRIODXBadge(currentProfile);
}


if (profileUsername) {

    profileUsername.textContent =
        `@${username}`;
}


if (profileBio) {

    profileBio.textContent =
        bio;
}


if (profileAvatar) {

    if (currentProfile.avatar_url) {

        profileAvatar.innerHTML = `

            <img
                src="${safe(currentProfile.avatar_url)}"
                alt="Profile picture"
            >

        `;

    } else {

        profileAvatar.innerHTML =
            '<i data-lucide="user"></i>';
    }
}

// =========================================================
// UPDATE STORIES AND CREATE-POST PROFILE AVATARS
// =========================================================

const socialStoryAvatar =
    document.getElementById("socialStoryAvatar");

const socialCreateAvatar =
    document.getElementById("socialCreateAvatar");

const socialCreateName =
    document.getElementById("socialCreateName");

const avatarUrl = currentProfile.avatar_url;

const avatarHTML = avatarUrl
    ? `<img src="${safe(avatarUrl)}" alt="${safe(displayName)}">`
    : '<i data-lucide="user"></i>';

if (socialStoryAvatar) {
    socialStoryAvatar.innerHTML = avatarHTML;
}

if (socialCreateAvatar) {
    socialCreateAvatar.innerHTML = avatarHTML;
}

if (socialCreateName) {
    socialCreateName.textContent = displayName;
}
/* =========================================================
   RENDER ALL PROFILE LUCIDE ICONS
   Run AFTER all profile HTML has been updated.
========================================================= */

if (typeof lucide !== "undefined") {

    lucide.createIcons();

}

} // closes renderMyProfile()
/* =========================================================
   CHECK USERNAME AVAILABILITY
========================================================= */
async function checkPATRIODXUsername(username) {

    const normalized =
        username
            .trim()
            .toLowerCase();


    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select("id, username")
            .ilike(
                "username",
                normalized
            )
            .limit(1);


    if (error) {

        console.error(
            "Username check error:",
            error
        );

        throw error;
    }


    /*
       Username does not exist.
       Therefore it is available.
    */

    if (!data || data.length === 0) {
        return true;
    }


    /*
       Username belongs to the
       currently logged-in user.
       Therefore it is also allowed.
    */

    if (
        data[0].id === currentUser.id
    ) {
        return true;
    }


    /*
       Username belongs to somebody else.
    */

    return false;
}


/* =========================================================
   UPLOAD PROFILE PHOTO
========================================================= */

async function uploadProfileAvatar(file) {

    if (!file || !currentUser) {
        return null;
    }


    if (
        !file.type.startsWith("image/")
    ) {

        throw new Error(
            "Profile picture must be an image."
        );
    }


    if (
        file.size >
        5 * 1024 * 1024
    ) {

        throw new Error(
            "Profile picture must be smaller than 5 MB."
        );
    }


    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    const fileName =
        `avatar-${crypto.randomUUID()}.${extension}`;


    const filePath =
        `${currentUser.id}/profile/${fileName}`;


    const { error } =
        await supabaseClient
            .storage
            .from("patriodx-media")
            .upload(
                filePath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false
                }
            );


    if (error) {

        console.error(
            "Profile avatar upload error:",
            error
        );

        throw error;
    }


    const { data } =
        supabaseClient
            .storage
            .from("patriodx-media")
            .getPublicUrl(
                filePath
            );


    return data.publicUrl;
}

function validatePATRIODXUsername(username) {
    if (!username) {
        return false;
    }

    if (username.length < 3 || username.length > 30) {
        return false;
    }

    return /^[a-z0-9_.]+$/.test(username);
}

window.validatePATRIODXUsername =
    validatePATRIODXUsername;
/* =========================================================
   SAVE PROFILE
========================================================= */

window.savePATRIODXProfile = async function(event) {

    event.preventDefault();

    const form = event.target;

    if (!form || form.id !== "profileForm") {
        return;
    }

    if (!currentUser) {

        showPATRIODXToast(
            "Please log in first.",
            "warning"
        );

        return;
    }

    const usernameInput =
        document.getElementById("profileUsernameInput");

    const displayNameInput =
        document.getElementById("profileDisplayNameInput");

    const bioInput =
        document.getElementById("profileBioInput");

    const avatarInput =
        document.getElementById("profileAvatarInput");

    const saveButton =
        document.getElementById("saveProfileButton");

    const username =
        usernameInput.value.trim().toLowerCase();

    const displayName =
        displayNameInput.value.trim();

    const bio =
        bioInput.value.trim();


    if (
        username.length < 3 ||
        username.length > 30 ||
        !/^[a-z0-9_.]+$/.test(username)
    ) {

        showPATRIODXToast(
            "Username must be 3–30 characters and can only contain letters, numbers, underscores, and periods.",
            "warning"
        );

        return;
    }


    if (!displayName) {

        showPATRIODXToast(
            "Please enter a display name.",
            "warning"
        );

        return;
    }


    try {

        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }

        /* =========================================
           CHECK USERNAME
        ========================================= */

        const currentUsername =
            (currentProfile?.username || "")
                .trim()
                .toLowerCase();

        if (username !== currentUsername) {

            const available =
                await checkPATRIODXUsername(username);

            if (!available) {
                throw new Error(
                    `@${username} is already taken. Please choose another username.`
                );
            }
        }
        /* =========================================
           PROFILE PICTURE
        ========================================= */

        let avatarUrl =
            currentProfile?.avatar_url || null;

        const avatarFile =
            avatarInput?.files?.[0] || null;

        if (avatarFile) {

            avatarUrl =
                await uploadProfileAvatar(avatarFile);

            if (!avatarUrl) {
                throw new Error(
                    "Profile picture upload failed."
                );
            }
        }

        /* =========================================
           SAVE PROFILE
        ========================================= */

        const { data, error } =
            await supabaseClient
                .from("profiles")
                .update({
                    username: username,
                    display_name: displayName,
                    bio: bio,
                    avatar_url: avatarUrl
                })
                .eq("id", currentUser.id)
                .select("*")
                .single();

        if (error) {
            throw error;
        }

        /* =========================================
           UPDATE PROFILE IMMEDIATELY
        ========================================= */

        currentProfile = data;

renderMyProfile();

if (avatarInput) {
    avatarInput.value = "";
}

if (profileEditor) {
    profileEditor.style.display = "none";
}

showPATRIODXToast(
    "Your PATRIODX profile has been updated!",
    "success"
);

await loadMyProfilePosts();

} catch (error) {

    console.error(
        "PATRIODX PROFILE SAVE ERROR:",
        error
    );

    showPATRIODXToast(
        "Could not save your profile. " +
        error.message,
        "error"
    );

} finally {

    if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = "Save Profile";
    }

}
};


/* =========================================================
   PROFILE FORM SUBMIT
========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    const profileForm =
        document.getElementById("profileForm");

    if (profileForm) {

        profileForm.addEventListener(
            "submit",
            function (event) {
                window.savePATRIODXProfile(event);
            }
        );

    }

});
/* =========================================================
   LOAD MY POSTS
========================================================= */

async function loadMyProfilePosts() {

    if (
        !currentUser ||
        !profilePosts
    ) {
        return;
    }


    profilePosts.innerHTML = `
        <div class="social-empty-state">

           <div><i data-lucide="clock-3"></i></div>

            <h3>
                Loading your posts...
            </h3>

        </div>
    `;


    const { data: posts, error } =
        await supabaseClient
            .from("posts")
            .select("*")
            .eq(
                "user_id",
                currentUser.id
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Profile posts error:",
            error
        );

        profilePosts.innerHTML = `
            <div class="social-empty-state">

              <div><i data-lucide="triangle-alert"></i></div>
                <h3>
                    Could not load your posts
                </h3>

                <p>
                    ${safe(error.message)}
                </p>

            </div>
        `;

        return;
    }


    if (!posts || posts.length === 0) {

        profilePosts.innerHTML = `
            <div class="social-empty-state">

               <div><i data-lucide="file-pen-line"></i></div>

                <h3>
                    No posts yet
                </h3>

                <p>
                    Your posts will appear here.
                </p>

            </div>
        `;


        if (profilePostCount) {

            profilePostCount.textContent =
                "0";
        }

        return;
    }


    if (profilePostCount) {

        profilePostCount.textContent =
            posts.length;
    }


    profilePosts.innerHTML =
        posts
            .map(post => {

                const image =
                    post.image_url
                        ? `
                            <img
                                src="${safe(post.image_url)}"
                                class="social-post-image"
                                alt="Post image"
                                loading="lazy"
                            >
                        `
                        : "";


               const video = post.video_url
    ? `
        <div class="social-media-wrapper">
            <video
                src="${safe(post.video_url)}"
                class="social-post-video"
                controls
                muted
                playsinline
                loop
                preload="metadata"
            ></video>
        </div>
    `
    : "";

                return `

                    <article
                        class="social-post-card"
                    >

                        <div
                            class="social-post-header"
                        >

                            <div
                                class="social-post-avatar"
                            >
                                ${
                                    currentProfile?.avatar_url
                                        ? `
                                            <img
                                                src="${safe(currentProfile.avatar_url)}"
                                                alt="Profile"
                                                style="
                                                    width:100%;
                                                    height:100%;
                                                    object-fit:cover;
                                                    border-radius:50%;
                                                "
                                            >
                                        `
                                       : '<i data-lucide="user"></i>'
                                }
                            </div>


                            <div>

                           <div class="social-post-author">
    ${safe(
        currentProfile?.display_name ||
        currentProfile?.username ||
        "PATRIODX User"
    )}


${
    typeof getPATRIODXBadge === "function"
        ? getPATRIODXBadge(currentProfile)
        : ""
}


</div>

<div class="social-post-username">
    ${safe(
        currentProfile?.username
            ? "@" + currentProfile.username.replace(/^@/, "")
            : ""
    )}
</div>



                                <div
                                    class="social-post-date"
                                >
                                    ${formatDate(
                                        post.created_at
                                    )}
                                </div>

                            </div>

                        </div>


                        ${
                            post.content
                                ? `
                                    <div
                                        class="social-post-content"
                                    >
                                        ${safe(
                                            post.content
                                        )}
                                    </div>
                                `
                                : ""
                        }


                        ${image}

                        ${video}

                    </article>

                `;

                  })
            .join("");
// Autoplay profile videos when visible, and pause them when off-screen.
if ("IntersectionObserver" in window) {
    const profileVideoObserver = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                const video = entry.target;

                if (entry.isIntersecting) {
                    video.play().catch(() => {
                        // Keep the native controls available if autoplay is blocked.
                    });
                } else {
                    video.pause();
                }
            });
        },
        {
            threshold: 0.6
        }
    );

    profilePosts
        .querySelectorAll(".social-post-video")
        .forEach(video => {
            video.muted = true;
            video.playsInline = true;
            profileVideoObserver.observe(video);
        });
}
    // Make your profile posts clickable
    profilePosts
        .querySelectorAll(".social-post-card")
        .forEach((card, index) => {

            const post = posts[index];

            if (!post) return;

            card.style.cursor = "pointer";
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            card.setAttribute("aria-label", "Open post");

            function openThisPost() {
                openProfilePostViewer({
                    postId: post.id,
                    imageUrl: post.image_url || "",
                    videoUrl: post.video_url || "",
                    author:
                        currentProfile?.display_name ||
                        "PATRIODX User",
                    caption: post.content || "",
                    date: post.created_at
                        ? formatDate(post.created_at)
                        : ""
                });
            }

            card.addEventListener("click", function (event) {

                // Don't interrupt video controls or links
                if (event.target.closest("video, button, a")) {
                    return;
                }

                openThisPost();
            });

            card.addEventListener("keydown", function (event) {

                if (
                    event.target === card &&
                    (event.key === "Enter" || event.key === " ")
                ) {
                    event.preventDefault();
                    openThisPost();
                }
            });
        });
}

/* =========================================================
   INITIALIZE PROFILE
========================================================= */

async function initializePATRIODXProfile() {

    if (!currentUser) return;

    await loadMyProfile();
}


/* =========================================================
   MAKE PROFILE FUNCTIONS AVAILABLE
========================================================= */

window.loadMyProfile =
    loadMyProfile;

window.initializePATRIODXProfile =
    initializePATRIODXProfile;

// ==========================================
// PATRIODX PROFILE EDIT BUTTON
// ==========================================

function openProfileEditor() {

    const editor = document.getElementById("profileEditor");

  if (!editor) {

    showPATRIODXToast(
        "Profile editor could not be found.",
        "error"
    );

    return;
}
    if (currentProfile) {

        const usernameInput =
            document.getElementById("profileUsernameInput");

        const displayNameInput =
            document.getElementById("profileDisplayNameInput");

        const bioInput =
            document.getElementById("profileBioInput");

        const avatarInput =
            document.getElementById("profileAvatarInput");

        if (usernameInput) {
            usernameInput.value =
                currentProfile.username || "";
        }

        if (displayNameInput) {
            displayNameInput.value =
                currentProfile.display_name || "";
        }

        if (bioInput) {
            bioInput.value =
                currentProfile.bio || "";
        }

        if (avatarInput) {
            avatarInput.value = "";
        }
    }

    editor.style.display = "block";

    editor.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


function closeProfileEditor() {

    const editor =
        document.getElementById("profileEditor");

    if (editor) {
        editor.style.display = "none";
    }

    const avatarInput =
        document.getElementById("profileAvatarInput");

    if (avatarInput) {
        avatarInput.value = "";
    }
}


window.openProfileEditor = openProfileEditor;
window.closeProfileEditor = closeProfileEditor;
// ==========================================
// PATRIODX PUBLIC PROFILES + FOLLOW SYSTEM
// ==========================================

let viewedProfileUserId = null;


// ------------------------------------------
// PROFILE FOLLOW COUNTS
// ------------------------------------------

async function getProfileFollowCounts(userId) {

    const { count: followers } = await supabaseClient
        .from("profile_follows")
        .select("*", {
            count: "exact",
            head: true
        })
        .eq("following_id", userId);

    const { count: following } = await supabaseClient
        .from("profile_follows")
        .select("*", {
            count: "exact",
            head: true
        })
        .eq("follower_id", userId);

    return {
        followers: followers || 0,
        following: following || 0
    };
}
// ------------------------------------------
// LOAD FOLLOWERS / FOLLOWING LIST
// ------------------------------------------
let profileFollowListRequestId = 0;
async function loadProfileFollowList(userId, type) {
const requestId = ++profileFollowListRequestId;
const requestedUserId = userId;
const requestedType = type;
    const list =
        document.getElementById(
            "publicProfileFollowList"
        );

    if (!list || !userId) return;

    list.style.display = "block";

    list.innerHTML = `
        <div class="social-empty-state">
            <p>Loading...</p>
        </div>
    `;

    const column =
        type === "followers"
            ? "following_id"
            : "follower_id";

    const userColumn =
        type === "followers"
            ? "follower_id"
            : "following_id";

    const {
        data: followRows,
        error: followError
    } = await supabaseClient
        .from("profile_follows")
        .select(userColumn)
        .eq(column, userId);
if (
    requestId !== profileFollowListRequestId ||
    requestedUserId !== viewedProfileUserId
) {
    return;
}
    if (followError) {

        console.error(
            "Follow list error:",
            followError
        );

        list.innerHTML = `
            <div class="social-empty-state">
                <p>Could not load this list.</p>
            </div>
        `;

        return;
    }

    const userIds =
        (followRows || [])
            .map(row => row[userColumn])
            .filter(Boolean);

    if (userIds.length === 0) {

        list.innerHTML = `
            <div class="social-empty-state">
                <p>
                    ${
                        type === "followers"
                            ? "No followers yet."
                            : "Not following anyone yet."
                    }
                </p>
            </div>
        `;

        return;
    }

    const {
        data: profiles,
        error: profileError
    } = await supabaseClient
        .from("profiles")
      .select(
    "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
)
        .in("id", userIds);
if (
    requestId !== profileFollowListRequestId ||
    requestedUserId !== viewedProfileUserId
) {
    return;
}
    if (profileError) {

        console.error(
            "Follow list profile error:",
            profileError
        );

        list.innerHTML = `
            <div class="social-empty-state">
                <p>Could not load profiles.</p>
            </div>
        `;

        return;
    }

    if (!profiles || profiles.length === 0) {

        list.innerHTML = `
            <div class="social-empty-state">
                <p>No profiles found.</p>
            </div>
        `;

        return;
    }

    list.innerHTML =
        profiles.map(profile => {

            const avatar =
                profile.avatar_url
                    ? `
                        <img
                            src="${profile.avatar_url}"
                            alt="Profile"
                        >
                    `
                    : `
                        <i data-lucide="user"></i>
                    `;

            return `
                <button
                    type="button"
                    class="profile-follow-list-item"
                    data-user-id="${profile.id}"
                >

                    <div class="profile-follow-list-avatar">
                        ${avatar}
                    </div>

                    <div class="profile-follow-list-info">

                       <strong>
    ${escapeHTML(
        profile.display_name ||
        "PATRIODX User"
    )}
    ${getPATRIODXBadge(profile)}
</strong>

                        <span>
                            ${
                                profile.username
                                    ? "@" +
                                      escapeHTML(
                                          profile.username
                                      )
                                    : ""
                            }
                        </span>

                    </div>

                </button>
            `;

        }).join("");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    list
        .querySelectorAll(
            ".profile-follow-list-item"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                function() {

                    const targetUserId =
                        this.getAttribute(
                            "data-user-id"
                        );

                    loadPublicProfile(
                        targetUserId
                    );

                }
            );

        });
}
// ------------------------------------------
// FOLLOWER / FOLLOWING BUTTONS
// ------------------------------------------

function setupPublicProfileFollowLists() {

    const followersButton =
        document.getElementById(
            "publicProfileFollowersButton"
        );

    const followingButton =
        document.getElementById(
            "publicProfileFollowingButton"
        );

    if (followersButton) {

        followersButton.onclick =
            function() {

                if (!viewedProfileUserId) return;

                loadProfileFollowList(
                    viewedProfileUserId,
                    "followers"
                );
            };
    }

    if (followingButton) {

        followingButton.onclick =
            function() {

                if (!viewedProfileUserId) return;

                loadProfileFollowList(
                    viewedProfileUserId,
                    "following"
                );
            };
    }
}

setupPublicProfileFollowLists();
// ------------------------------------------
// LOAD OWN FOLLOW COUNTS
// ------------------------------------------

async function loadMyFollowCounts() {

    if (!currentUser) return;

    const counts = await getProfileFollowCounts(currentUser.id);

    const followersElement =
        document.getElementById("profileFollowerCount");

    const followingElement =
        document.getElementById("profileFollowingCount");

    if (followersElement) {
        followersElement.textContent = counts.followers;
    }

    if (followingElement) {
        followingElement.textContent = counts.following;
    }
}


// ------------------------------------------
// CHECK IF FOLLOWING
// ------------------------------------------

async function isFollowingUser(userId) {

    if (!currentUser || userId === currentUser.id) {
        return false;
    }

    const { data, error } = await supabaseClient
        .from("profile_follows")
        .select("id")
        .eq("follower_id", currentUser.id)
        .eq("following_id", userId)
        .maybeSingle();

    if (error) {
        console.error("Follow check error:", error);
        return false;
    }

    return !!data;
}


// ------------------------------------------
// FOLLOW USER
// ------------------------------------------

async function followUser(userId) {

    if (!currentUser) {

        showPATRIODXToast(
            "Please sign in first.",
            "warning"
        );

        return;
    }

    if (userId === currentUser.id) {
        return;
    }

    const button =
        document.getElementById("publicProfileFollowButton");

    if (button) {
        button.disabled = true;
        button.textContent = "Following...";
    }

    const { error } = await supabaseClient
        .from("profile_follows")
        .insert({
            follower_id: currentUser.id,
            following_id: userId
        });

    if (error) {

        console.error("Follow error:", error);

        if (button) {
            button.disabled = false;
            button.textContent = "Follow";
        }

        if (error.code === "23505") {

            showPATRIODXToast(
                "You are already following this user.",
                "info"
            );

        } else {

            showPATRIODXToast(
                "Could not follow this user.",
                "error"
            );
        }

        return;
    }

   await loadPublicProfile(userId);
await loadMyFollowCounts();
}

// ------------------------------------------
// UNFOLLOW USER
// ------------------------------------------

async function unfollowUser(userId) {

    if (!currentUser) {
        return;
    }

    const button =
        document.getElementById(
            "publicProfileFollowButton"
        );

    if (button) {

        button.disabled = true;
        button.textContent = "Unfollowing...";

    }

    const { error } =
        await supabaseClient
            .from("profile_follows")
            .delete()
            .eq(
                "follower_id",
                currentUser.id
            )
            .eq(
                "following_id",
                userId
            );

    if (error) {

        console.error(
            "Unfollow error:",
            error
        );

        if (button) {

            button.disabled = false;
            button.textContent = "Following";

        }

        showPATRIODXToast(
            "Could not unfollow this user.",
            "error"
        );

        return;
    }

   await loadPublicProfile(userId);
await loadMyFollowCounts();
}

// ------------------------------------------
// LOAD PUBLIC PROFILE
// ------------------------------------------

async function loadPublicProfile(userId) {

  if (!userId) return;

// Make the Profile section visible before displaying the user.
if (typeof navigatePATRIODX === "function") {
    navigatePATRIODX("profile");
}

viewedProfileUserId = userId;


// Hide your own profile while viewing another user.
const ownProfileElements = [
    document.getElementById("profileCover"),
    document.getElementById("profileAvatar")?.closest(".profile-header"),
    document.getElementById("profilePostCount")?.closest(".profile-stats"),
    document.getElementById("profileEditor"),
    document.getElementById("profilePosts")?.closest(".profile-posts")
];

ownProfileElements.forEach(element => {
    if (element) {
        element.style.display = "none";
    }
});

// Hide the "Your Profile" heading.
const profileSection = document.getElementById("profile");

if (profileSection) {
    profileSection.querySelectorAll(":scope > .section-heading")
        .forEach(heading => {
            heading.style.display = "none";
        });
}

// Hide Find People and Discover People while viewing a public profile.
const profileSearchCard = document
    .getElementById("profileSearchForm")
    ?.closest(".profile-search-card");

if (profileSearchCard) {
    profileSearchCard.style.display = "none";
}



    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        console.error("Profile loading error:", error);
        return;
    }

   if (!profile) {

    showPATRIODXToast(
        "Profile not found.",
        "error"
    );

    return;
}


    const card =
        document.getElementById("publicProfileCard");

    const postsContainer =
        document.getElementById("publicProfilePostsContainer");

    if (card) {
        card.style.display = "block";
    }

    if (postsContainer) {
        postsContainer.style.display = "block";
    }


    const nameElement =
        document.getElementById("publicProfileDisplayName");
const badgeElement =
    document.getElementById("publicProfileBadge");
    const usernameElement =
        document.getElementById("publicProfileUsername");

    const bioElement =
        document.getElementById("publicProfileBio");

    const avatarElement =
        document.getElementById("publicProfileAvatar");


    if (nameElement) {
        nameElement.textContent =
            profile.display_name || "PATRIODX User";
    }
if (badgeElement) {
    badgeElement.innerHTML =
        getPATRIODXBadge(profile);
}
    if (usernameElement) {
        usernameElement.textContent =
            profile.username
                ? "@" + profile.username
                : "@user";
    }

    if (bioElement) {
        bioElement.textContent =
            profile.bio || "No bio yet.";
    }


    if (avatarElement) {

        if (profile.avatar_url) {

            avatarElement.innerHTML =
                `<img src="${profile.avatar_url}" alt="Profile picture">`;

        } else {

            avatarElement.textContent = "👤";
        }
    }


    // --------------------------------------
    // FOLLOW BUTTON
    // --------------------------------------

    const followButton =
        document.getElementById("publicProfileFollowButton");

    if (followButton) {

        if (currentUser && userId === currentUser.id) {

            followButton.style.display = "none";

        } else {

            followButton.style.display = "inline-block";

            const following =
                await isFollowingUser(userId);

            followButton.textContent =
                following ? "Following" : "Follow";

            followButton.disabled = false;

            followButton.onclick = function () {

                if (following) {
                    unfollowUser(userId);
                } else {
                    followUser(userId);
                }

            };
        }
    }

// --------------------------------------
// MESSAGE BUTTON
// --------------------------------------

const messageButton = document.getElementById(
    "publicProfileMessageButton"
);

if (messageButton) {
    messageButton.style.display = "none";
    messageButton.onclick = null;

    if (currentUser && userId !== currentUser.id) {
        try {
            const following = await isFollowingUser(userId);

            if (following) {
                messageButton.style.display = "inline-flex";

                messageButton.onclick = async function () {
                    messageButton.disabled = true;

                    try {
                  const opened = await createConversationWithUser(userId);

if (opened && typeof navigatePATRIODX === "function") {
    navigatePATRIODX("messaging");
}
                    } catch (error) {
                        console.error(
                            "Could not start conversation:",
                            error
                        );

                        showPATRIODXToast(
                            "Could not open this conversation. Please try again.",
                            "error"
                        );
                    } finally {
                        messageButton.disabled = false;
                    }
                };
            }
        } catch (error) {
            console.error("Could not check follow status:", error);
        }
    }
}
    // --------------------------------------
    // FOLLOW COUNTS
    // --------------------------------------

    const counts =
        await getProfileFollowCounts(userId);

    const followerCount =
        document.getElementById("publicProfileFollowerCount");

    const followingCount =
        document.getElementById("publicProfileFollowingCount");

    if (followerCount) {
        followerCount.textContent = counts.followers;
    }

    if (followingCount) {
        followingCount.textContent = counts.following;
    }


    // --------------------------------------
    // LOAD USER POSTS
    // --------------------------------------

    const { data: posts, error: postsError } =
        await supabaseClient
            .from("posts")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", {
                ascending: false
            });

    if (postsError) {
        console.error("Public profile posts error:", postsError);
        return;
    }


    const postCount =
        document.getElementById("publicProfilePostCount");

    if (postCount) {
        postCount.textContent =
            posts ? posts.length : 0;
    }


    const postsElement =
        document.getElementById("publicProfilePosts");

    if (!postsElement) return;


    if (!posts || posts.length === 0) {

        postsElement.innerHTML = `
            <div class="social-empty-state">
               <div><i data-lucide="file-pen-line"></i></div>
                <h3>No posts yet</h3>
                <p>This user has not posted anything yet.</p>
            </div>
        `;

        return;
    }


postsElement.innerHTML = (
    await Promise.all(posts.map(async post => {
        const date = post.created_at
            ? new Date(post.created_at).toLocaleString()
            : "";

        let media = "";

        if (post.image_url) {
            media = `
                <img
                    src="${escapeHTML(post.image_url)}"
                    class="social-post-image"
                    alt="Post image"
                    loading="lazy"
                >
            `;
        }

        if (post.video_url) {
            media = `
                <video
                    class="social-post-image"
                    controls
                    preload="metadata"
                >
                    <source src="${escapeHTML(post.video_url)}">
                </video>
            `;
        }

        let stats = { likes: 0, comments: 0 };
        let liked = false;

        try {
            [stats, liked] = await Promise.all([
                getSocialCounts(post.id),
                hasLikedSocialPost(post.id)
            ]);
        } catch (error) {
            console.error(
                "Could not load public profile post statistics:",
                post.id,
                error
            );
        }

        return `
            <article class="social-post-card">

                <div class="social-post-header">
                    <div class="social-post-avatar">
                        ${
                            profile.avatar_url
                                ? `<img src="${escapeHTML(profile.avatar_url)}" alt="Profile picture">`
                                : '<i data-lucide="user"></i>'
                        }
                    </div>

                   <div class="social-post-author">
    <strong>
        ${escapeHTML(profile.display_name || "PATRIODX User")}
        ${
            typeof getPATRIODXBadge === "function"
                ? getPATRIODXBadge(profile)
                : ""
        }
    </strong>

    <span>
        ${
            profile.username
                ? "@" + escapeHTML(profile.username.replace(/^@/, ""))
                : ""
        }
    </span>
</div>

                    <div class="social-post-date">
                        ${escapeHTML(date)}
                    </div>
                </div>

                <div class="social-post-content">
                    ${escapeHTML(post.content || "")}
                </div>

                ${media}

                <div
                    class="public-profile-post-stats"
                    id="public-profile-stats-${escapeHTML(post.id)}"
                >
                    <span>
                        <i data-lucide="heart"></i>
                        <span class="public-profile-like-count">${stats.likes}</span>
                        <span>likes</span>
                    </span>

                    <span>
                        <i data-lucide="message-circle"></i>
                        ${stats.comments}
                        <span>comments</span>
                    </span>
                </div>

                <div class="public-profile-post-actions">
                    <button
                        type="button"
                        class="social-like-button public-profile-like-button ${liked ? "liked" : ""}"
                        data-post-id="${escapeHTML(post.id)}"
                        aria-label="${liked ? "Unlike post" : "Like post"}"
                        title="${liked ? "Unlike" : "Like"}"
                    >
                        <i data-lucide="heart"></i>
                        <span>${liked ? "Liked" : "Like"}</span>
                    </button>

                    <button
                        type="button"
                        class="public-profile-comment-button"
                        data-post-id="${escapeHTML(post.id)}"
                    >
                        <i data-lucide="message-circle"></i>
                        Comment
                    </button>
                </div>
            </article>
        `;
    }))
).join("");

if (typeof lucide !== "undefined") {
    lucide.createIcons();
}

// Make public profile posts clickable
postsElement
    .querySelectorAll(".social-post-card")
    .forEach((card, index) => {

        const post = posts[index];
        if (!post) return;

        card.style.cursor = "pointer";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", "Open post");

        function openThisPost() {
            openProfilePostViewer({
                postId: post.id,
                imageUrl: post.image_url || "",
                videoUrl: post.video_url || "",
                author: profile.display_name || "PATRIODX User",
                caption: post.content || "",
                date: post.created_at
                    ? new Date(post.created_at).toLocaleString()
                    : ""
            });
        }

        card.addEventListener("click", function (event) {
            // Preserve video controls and action buttons
            if (event.target.closest("video, button, a")) return;
            openThisPost();
        });

        card.addEventListener("keydown", function (event) {
            if (
                event.target === card &&
                (event.key === "Enter" || event.key === " ")
            ) {
                event.preventDefault();
                openThisPost();
            }
        });
    });

// Handle likes on public profile posts
postsElement
    .querySelectorAll(".public-profile-like-button")
    .forEach(button => {
        button.addEventListener("click", async function (event) {
            event.stopPropagation();

            const postId = this.dataset.postId;
            if (!postId || this.disabled) return;

            this.disabled = true;

            try {
                await likeSocialPost(postId);

                const [stats, liked] = await Promise.all([
                    getSocialCounts(postId),
                    hasLikedSocialPost(postId)
                ]);

                const statsElement = document.getElementById(
                    `public-profile-stats-${postId}`
                );

                if (statsElement) {
                    const countElement = statsElement.querySelector(
                        ".public-profile-like-count"
                    );

                    if (countElement) {
                        countElement.textContent = stats.likes;
                    }
                }

                this.classList.toggle("liked", liked);
                this.setAttribute(
                    "aria-label",
                    liked ? "Unlike post" : "Like post"
                );
                this.title = liked ? "Unlike" : "Like";

                const label = this.querySelector("span");
                if (label) {
                    label.textContent = liked ? "Liked" : "Like";
                }

                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            } catch (error) {
                console.error("Public profile like error:", error);
            } finally {
                this.disabled = false;
            }
        });
    });

// Open the post viewer when Comment is clicked
postsElement
    .querySelectorAll(".public-profile-comment-button")
    .forEach(button => {
        button.addEventListener("click", function (event) {
            event.stopPropagation();

            const post = posts.find(
                item => String(item.id) === String(this.dataset.postId)
            );

            if (!post) return;

            openProfilePostViewer({
                postId: post.id,
                imageUrl: post.image_url || "",
                videoUrl: post.video_url || "",
                author: profile.display_name || "PATRIODX User",
                caption: post.content || "",
                date: post.created_at
                    ? new Date(post.created_at).toLocaleString()
                    : ""
            });
        });
    });


}
function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ------------------------------------------
// SEARCH USERS
// ------------------------------------------

async function searchPATRIODXUsers(username) {

    const results =
        document.getElementById("profileSearchResults");

    if (!results) return;

    const cleanUsername =
        username.trim().replace(/^@/, "");

    if (!cleanUsername) {

        results.innerHTML = "";

        return;
    }


    results.innerHTML = `
        <div class="social-empty-state">
            <p>Searching...</p>
        </div>
    `;


    const { data, error } =
        await supabaseClient
            .from("profiles")
          .select("id, username, display_name, avatar_url, bio, is_verified, is_owner, verification_expires_at")
            .ilike("username", `%${cleanUsername}%`)
            .limit(10);


    if (error) {

        console.error("Profile search error:", error);

        results.innerHTML = `
            <div class="social-empty-state">
                <p>Could not search profiles.</p>
            </div>
        `;

        return;
    }


    if (!data || data.length === 0) {

        results.innerHTML = `
            <div class="social-empty-state">
               <div><i data-lucide="search"></i></div>
                <h3>No users found</h3>
                <p>No PATRIODX users matched that username.</p>
            </div>
        `;

        return;
    }


    results.innerHTML = data.map(profile => {

        const avatar = profile.avatar_url
            ? `<img src="${profile.avatar_url}" alt="Profile">`
           : '<i data-lucide="user"></i>';


return `
    <button
        type="button"
        class="profile-search-result"
        data-user-id="${escapeHTML(profile.id)}"
        style="width:100%; text-align:left;"
    >

        <div class="profile-search-result-avatar">
            ${avatar}
        </div>

        <div class="profile-search-result-info">

           <div class="profile-search-result-name">
    ${escapeHTML(
        profile.display_name ||
        "PATRIODX User"
    )}
    ${
        typeof getPATRIODXBadge === "function"
            ? getPATRIODXBadge(profile)
            : ""
    }
</div>


            <div class="profile-search-result-username">
                ${
                    profile.username
                        ? "@" + escapeHTML(profile.username)
                        : ""
                }
            </div>

        </div>

    </button>
`;


    }).join("");
if (typeof lucide !== "undefined") {
    lucide.createIcons();
}

    document
        .querySelectorAll(".profile-search-result")
        .forEach(result => {

            result.addEventListener("click", function () {

                const userId =
                    this.getAttribute("data-user-id");

                loadPublicProfile(userId);

                const publicCard =
                    document.getElementById("publicProfileCard");

                if (publicCard) {
                    publicCard.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }

            });

        });
}


// ------------------------------------------
// SEARCH FORM
// ------------------------------------------

function initializeProfileSearch() {

    const form =
        document.getElementById("profileSearchForm");

    const input =
        document.getElementById("profileSearchInput");

    if (!form || !input) return;


    form.addEventListener("submit", async function(event) {

        event.preventDefault();

        await searchPATRIODXUsers(input.value);

    });

}


// ------------------------------------------
// START
// ------------------------------------------

initializeProfileSearch();

if (typeof loadMyFollowCounts === "function") {
    loadMyFollowCounts();
}
// =========================================================
// PATRIODX DISCOVER PEOPLE
// =========================================================

let discoverPeopleLoading = false;


// ---------------------------------------------------------
// LOAD DISCOVERABLE PROFILES
// ---------------------------------------------------------

async function loadDiscoverPeople() {

    const list = document.getElementById(
        "discoverPeopleList"
    );

    const refreshButton = document.getElementById(
        "refreshDiscoverPeople"
    );

    if (!list || discoverPeopleLoading) {
        return;
    }

    if (!currentUser) {

        list.innerHTML = `
            <div class="social-empty-state">
                <h3>Sign in to discover people</h3>
                <p>
                    Sign in to find people and grow your network.
                </p>
            </div>
        `;

        return;
    }

    discoverPeopleLoading = true;

    if (refreshButton) {
        refreshButton.disabled = true;
    }

    list.innerHTML = `
        <div class="social-empty-state">
            <p>Finding people to connect with...</p>
        </div>
    `;

    try {

        // Get the profiles this user already follows.
        const {
            data: followRows,
            error: followError
        } = await supabaseClient
            .from("profile_follows")
            .select("following_id")
            .eq("follower_id", currentUser.id);

        if (followError) {
            throw followError;
        }

        const followingIds = new Set(
            (followRows || [])
                .map(row => row.following_id)
                .filter(Boolean)
        );

        // Load real profiles from PATRIODX.
        const {
            data: profiles,
            error: profilesError
        } = await supabaseClient
            .from("profiles")
            .select(
                "id, username, display_name, avatar_url, bio"
            )
            .limit(100);

        if (profilesError) {
            throw profilesError;
        }

        // Exclude yourself and accounts you already follow.
        const candidates = (profiles || []).filter(
            profile =>
                profile.id &&
                profile.id !== currentUser.id &&
                !followingIds.has(profile.id)
        );

        // Shuffle the available profiles so Refresh can
        // show a different selection.
        for (
            let i = candidates.length - 1;
            i > 0;
            i--
        ) {

            const j = Math.floor(
                Math.random() * (i + 1)
            );

            [candidates[i], candidates[j]] = [
                candidates[j],
                candidates[i]
            ];
        }

        const suggestions = candidates.slice(0, 6);

        if (suggestions.length === 0) {

            list.innerHTML = `
                <div class="social-empty-state">
                    <div class="social-empty-icon">
                        <i data-lucide="users"></i>
                    </div>

                    <h3>No new people to suggest</h3>

                    <p>
                        Check back when more people join
                        PATRIODX.
                    </p>
                </div>
            `;

            return;
        }

        list.innerHTML = suggestions.map(profile => {

            const avatar = profile.avatar_url
                ? `
                    <img
                        src="${escapeHTML(profile.avatar_url)}"
                        alt=""
                        loading="lazy"
                    >
                `
                : `
                    <i data-lucide="user"></i>
                `;

            return `
                <article class="discover-person-card">

                    <button
                        type="button"
                        class="discover-person-profile"
                        data-discover-profile="${escapeHTML(profile.id)}"
                    >
                        <span class="discover-person-avatar">
                            ${avatar}
                        </span>

                      <span class="discover-person-info">
    <strong>
        ${escapeHTML(
            profile.display_name ||
            "PATRIODX User"
        )}
        ${
            typeof getPATRIODXBadge === "function"
                ? getPATRIODXBadge(profile)
                : ""
        }
    </strong>
    <span>
        ${
            profile.username
                ? "@" + escapeHTML(profile.username)
                : "@user"
        }
    </span>
</span>
                    </button>

                    ${
                        profile.bio
                            ? `
                                <p class="discover-person-bio">
                                    ${escapeHTML(profile.bio)}
                                </p>
                            `
                            : ""
                    }

                    <button
                        type="button"
                        class="discover-person-follow"
                        data-discover-follow="${escapeHTML(profile.id)}"
                    >
                        <i data-lucide="user-plus"></i>
                        Follow
                    </button>

                </article>
            `;

        }).join("");

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

    } catch (error) {

        console.error(
            "Discover People error:",
            error
        );

        list.innerHTML = `
            <div class="social-empty-state">
                <h3>Couldn't load suggestions</h3>
                <p>
                    Please try refreshing the suggestions.
                </p>
            </div>
        `;

    } finally {

        discoverPeopleLoading = false;

        if (refreshButton) {
            refreshButton.disabled = false;
        }
    }
}


// ---------------------------------------------------------
// FOLLOW A SUGGESTED PERSON
// ---------------------------------------------------------

async function followDiscoveredPerson(userId, button) {

    if (!currentUser) {

        showPATRIODXToast(
            "Please sign in first.",
            "warning"
        );

        return;
    }

    if (
        !userId ||
        userId === currentUser.id ||
        !button ||
        button.disabled
    ) {
        return;
    }

    button.disabled = true;
    button.textContent = "Following...";

    try {

        const { error } = await supabaseClient
            .from("profile_follows")
            .insert({
                follower_id: currentUser.id,
                following_id: userId
            });

        if (error) {

            if (error.code === "23505") {

                showPATRIODXToast(
                    "You already follow this person.",
                    "info"
                );

                await loadDiscoverPeople();
                return;
            }

            throw error;
        }

        showPATRIODXToast(
            "You're now following this person!",
            "success"
        );

        // Update the existing follower/following counters.
        if (typeof loadMyFollowCounts === "function") {
            await loadMyFollowCounts();
        }

        // Remove the newly followed account from suggestions.
        await loadDiscoverPeople();

    } catch (error) {

        console.error(
            "Discover follow error:",
            error
        );

        button.disabled = false;
        button.innerHTML = `
            <i data-lucide="user-plus"></i>
            Follow
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        showPATRIODXToast(
            "Could not follow this person. Please try again.",
            "error"
        );
    }
}


// ---------------------------------------------------------
// DISCOVER PEOPLE BUTTONS
// ---------------------------------------------------------

function initializeDiscoverPeople() {

    const list = document.getElementById(
        "discoverPeopleList"
    );

    const refreshButton = document.getElementById(
        "refreshDiscoverPeople"
    );

    if (!list || list.dataset.initialized === "true") {
        return;
    }

    list.dataset.initialized = "true";

    list.addEventListener("click", async function(event) {

        const profileButton = event.target.closest(
            "[data-discover-profile]"
        );

        const followButton = event.target.closest(
            "[data-discover-follow]"
        );

        if (profileButton) {

            const userId = profileButton.getAttribute(
                "data-discover-profile"
            );

            if (userId) {
                await loadPublicProfile(userId);

                const publicCard = document.getElementById(
                    "publicProfileCard"
                );

                if (publicCard) {
                    publicCard.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            }

            return;
        }

        if (followButton) {

            const userId = followButton.getAttribute(
                "data-discover-follow"
            );

            await followDiscoveredPerson(
                userId,
                followButton
            );
        }
    });

    if (refreshButton) {

        refreshButton.addEventListener(
            "click",
            loadDiscoverPeople
        );
    }

    loadDiscoverPeople();
}


// ---------------------------------------------------------
// START DISCOVER PEOPLE
// ---------------------------------------------------------

initializeDiscoverPeople();
/* =========================================================
   PATRIODX SIMPLE APP NAVIGATION
========================================================= */

const PATRIODX_PAGES = [
    "home",
    "dashboard",
    "profile",
    "social",
    "saved",
    "messaging",
    "notifications",
    "analytics",
    "products",
    "customers",
    "sales",
    "invoices",
    "marketplace",
    "patriodxAI",
    "contact",
    "account"
];
const PATRIODX_EXTRA_SECTIONS = [
    ".features-section",
    ".pricing-section",
    ".final-cta",
    ".stats-grid",
    ".recent-activity",
    ".danger-zone",
    "footer"
];


function patriodxShow(element) {
    if (!element) return;

    element.style.setProperty(
        "display",
        "block",
        "important"
    );

    element.style.setProperty(
        "visibility",
        "visible",
        "important"
    );

    element.style.setProperty(
        "opacity",
        "1",
        "important"
    );
}


function patriodxHide(element) {
    if (!element) return;

    element.style.setProperty(
        "display",
        "none",
        "important"
    );
}


function navigatePATRIODX(page) {

    if (page === "ai") {
        page = "patriodxAI";
    }

    if (!PATRIODX_PAGES.includes(page)) {
        page = "home";
    }


    /* =====================================================
       HIDE EVERY MAIN APP PAGE
    ===================================================== */

    PATRIODX_PAGES.forEach(id => {

        const element =
            document.getElementById(id);

        patriodxHide(element);

    });


    /* =====================================================
       HIDE EXTRA SECTIONS
    ===================================================== */

    PATRIODX_EXTRA_SECTIONS.forEach(selector => {

        document
            .querySelectorAll(selector)
            .forEach(element => {

                patriodxHide(element);

            });

    });


   
    /* =====================================================
       SHOW SELECTED PAGE
    ===================================================== */

    const selected =
        document.getElementById(page);

    patriodxShow(selected);

if (page === "saved") {
    loadSavedPosts();
}
    /* =====================================================
       HOME
    ===================================================== */

    if (page === "home") {

        document
            .querySelectorAll(
                ".landing-section, " +
                ".features-section, " +
                ".pricing-section, " +
                ".final-cta"
            )
            .forEach(element => {

                patriodxShow(element);

            });

    }


    /* =====================================================
       DASHBOARD
    ===================================================== */

    if (page === "dashboard") {

        document
            .querySelectorAll(
                ".stats-grid, .recent-activity"
            )
            .forEach(element => {

                patriodxShow(element);

            });

    }


    /* =====================================================
       ACCOUNT / SETTINGS
    ===================================================== */

    if (page === "account") {

        document
            .querySelectorAll(
                ".danger-zone"
            )
            .forEach(element => {

                patriodxShow(element);

            });


        /* Show Appearance */

      const appearance =
    document.getElementById(
        "settingsAppearance"
    );

if (appearance) {
    appearance.style.setProperty(
        "display",
        "block",
        "important"
    );

    appearance.style.setProperty(
        "visibility",
        "visible",
        "important"
    );

    appearance.style.setProperty(
        "opacity",
        "1",
        "important"
    );
}


        /* Show Settings cards */

        document
            .querySelectorAll(
                "#account .settings-card"
            )
            .forEach(element => {

                patriodxShow(element);

            });

    }


    /* =====================================================
       ACTIVE SIDEBAR
    ===================================================== */

    document
        .querySelectorAll(".sidebar-link")
        .forEach(link => {

            link.classList.remove("active");

            let linkPage =
                link.dataset.page;

            if (linkPage === "ai") {
                linkPage = "patriodxAI";
            }

            if (linkPage === page) {
                link.classList.add("active");
            }

        });


    /* =====================================================
       ACTIVE MOBILE NAVIGATION
    ===================================================== */

    document
        .querySelectorAll(".mobile-nav-link")
        .forEach(link => {

            link.classList.remove("active");

            let linkPage =
                (link.getAttribute("href") || "")
                .replace("#", "");

            if (linkPage === "ai") {
                linkPage = "patriodxAI";
            }

            if (linkPage === page) {
                link.classList.add("active");
            }

        });


    /* =====================================================
       UPDATE URL
    ===================================================== */

    history.pushState(
        { page: page },
        "",
        "#" + page
    );


    /* =====================================================
       RESET VIEW POSITION
    ===================================================== */

    window.scrollTo({
        top: 0,
        left: 0,
        behavior: "instant"
    });


    /* =====================================================
       CLOSE MOBILE SIDEBAR
    ===================================================== */

    const sidebar =
        document.getElementById(
            "patriodxSidebar"
        );

    if (sidebar) {

        sidebar.classList.remove(
            "mobile-open"
        );

    }

}
/* =========================================================
   OLD scrollToSection COMPATIBILITY
========================================================= */

function scrollToSection(id) {

    if (PATRIODX_PAGES.includes(id)) {

        navigatePATRIODX(id);

        return;
    }


    if (id === "ai") {

        navigatePATRIODX(
            "patriodxAI"
        );

        return;
    }


    const element =
        document.getElementById(id);

    if (element) {

        element.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    }

}


/* =========================================================
   HEADER BUTTONS
========================================================= */

function setupPATRIODXHeaderButtons() {

    const notificationButton =
        document.querySelector(
            '[title="Notifications"]'
        );

    const messageButton =
        document.querySelector(
            '[title="Messages"]'
        );

    const profileButton =
        document.querySelector(
            '[title="Your Profile"]'
        );


    if (notificationButton) {

        notificationButton.onclick =
            function(event) {

                event.preventDefault();

                navigatePATRIODX(
                    "notifications"
                );

            };

    }


    if (messageButton) {

        messageButton.onclick =
            function(event) {

                event.preventDefault();

                navigatePATRIODX(
                    "messaging"
                );

            };

    }


    if (profileButton) {

        profileButton.onclick =
            function(event) {

                event.preventDefault();

                navigatePATRIODX(
                    "profile"
                );

            };

    }

}


/* =========================================================
   SIDEBAR BUTTONS
========================================================= */

function setupPATRIODXLinks() {

    document
        .querySelectorAll(
            ".sidebar-link, .mobile-nav-link"
        )
        .forEach(link => {

            link.onclick =
                function(event) {

                    const href =
                        this.getAttribute(
                            "href"
                        );

                    let page =
                        this.dataset.page ||
                        (href || "").replace(
                            "#",
                            ""
                        );


                    if (page === "ai") {
                        page = "patriodxAI";
                    }


                    if (
                        !PATRIODX_PAGES.includes(
                            page
                        )
                    ) {
                        return;
                    }


                    event.preventDefault();

                    navigatePATRIODX(
                        page
                    );

                };

        });

}


/* =========================================================
   LOGO
========================================================= */

function setupPATRIODXLogo() {

    const logo =
        document.querySelector(
            ".patriodx-logo"
        );

    if (!logo) return;


    logo.onclick =
        function(event) {

            event.preventDefault();

            navigatePATRIODX(
                "home"
            );

        };

}


/* =========================================================
   MOBILE MENU
========================================================= */

function setupPATRIODXMobileMenu() {

    const button =
        document.getElementById(
            "mobileMenuButton"
        );

    const sidebar =
        document.getElementById(
            "patriodxSidebar"
        );


    if (!button || !sidebar) {
        return;
    }


    button.onclick =
        function(event) {

            event.preventDefault();

            sidebar.classList.toggle(
                "mobile-open"
            );

        };

}


/* =========================================================
   BROWSER BACK / FORWARD
========================================================= */

window.addEventListener(
    "popstate",
    function() {

        let page =
            window.location.hash
                .replace("#", "");


        if (page === "ai") {
            page = "patriodxAI";
        }


        if (
            !PATRIODX_PAGES.includes(page)
        ) {
            page = "home";
        }


        /* Don't push another history entry */

        const oldPushState =
            history.pushState;

        history.pushState =
            function() {};

        navigatePATRIODX(page);

        history.pushState =
            oldPushState;

    }
);


/* =========================================================
   START NAVIGATION
========================================================= */

function startPATRIODXNavigation() {

    setupPATRIODXHeaderButtons();

    setupPATRIODXLinks();

    setupPATRIODXLogo();

    setupPATRIODXMobileMenu();
setupPATRIODXStoryViewer();

    let startingPage =
        window.location.hash
            .replace("#", "");


    if (startingPage === "ai") {
        startingPage = "patriodxAI";
    }


    if (
        !PATRIODX_PAGES.includes(
            startingPage
        )
    ) {
        startingPage = "home";
    }


    /* Initial display without adding history */

    const oldPushState =
        history.pushState;

    history.pushState =
        function() {};

    navigatePATRIODX(
        startingPage
    );

    history.pushState =
        oldPushState;

}


if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        startPATRIODXNavigation,
        { once: true }
    );

} else {

    startPATRIODXNavigation();

}
/* =========================================================
   PATRIODX LANGUAGE SYSTEM
========================================================= */

const PATRIODX_TRANSLATIONS = {

    en: {
        search: "Search PATRIODX...",
        profile: "Profile",
        notifications: "Notifications",
        messages: "Messages",
        logout: "Logout",

        home: "Home",
        dashboard: "Dashboard",
        social: "Social",
        analytics: "Analytics",
        products: "Products",
        customers: "Customers",
        sales: "Sales",
        invoices: "Invoices",
        contact: "Contact",
        account: "Account",
        ai: "PATRIODX AI",

        language: "Language",

        welcome: "Welcome to PATRIODX",
        runBusiness: "Run your business. Grow your money.",
        connect: "Connect. Share. Grow.",

        notificationsTitle: "Notifications",
        messagesTitle: "Messages",
        profileTitle: "Profile",

        noNotifications: "No notifications yet",
        noPosts: "No posts yet",

        contactTitle: "Contact",
        quickLinks: "Quick Links",

        privacy: "Privacy Policy",
        terms: "Terms of Service",
connect: "Connect. Share. Grow.",
socialDescription: "Connect with customers and businesses, share updates and promote what you do.",
createPost: "Create a Post",
photo: "Photo",
video: "Video",
post: "Post",
latestPosts: "Latest Posts",
        main: "MAIN",
business: "BUSINESS",
grow: "GROW",
growWithPatriodx: "Grow with PATRIODX",
unlockTools: "Unlock more business tools.",
viewPlans: "View Plans",
        controlCenter: "PATRIODX • CONTROL CENTER",
runBusinessSmarter: "Run your business smarter.",
dashboardDescription: "Manage your products, customers, sales and invoices from one powerful business dashboard.",
manageProducts: "Manage Products",
viewAnalytics: "View Analytics",
quickActions: "QUICK ACTIONS",
getThingsDoneFaster: "Get things done faster.",

addProduct: "Add Product",
addInventoryItem: "Add something to your inventory",

addCustomer: "Add Customer",
addNewCustomer: "Add a new customer",

recordSale: "Record Sale",
recordTransaction: "Record a new transaction",

createInvoice: "Create Invoice",
sendInvoice: "Send a professional invoice",
findPeople: "Find People",
searchUsername: "Search username...",
patriodxProfile: "PATRIODX PROFILE",
yourProfile: "Your Profile",
buildYourIdentity: "Build your identity on PATRIODX.",

follow: "Follow",
posts: "Posts",
followers: "Followers",
following: "Following",

tellPeopleAboutYourself: "Tell people about yourself.",
editProfile: '<i data-lucide="pencil"></i> Edit Profile',
editYourProfile: "Edit Your Profile",
customizeProfile: "Customize how people see you on PATRIODX.",

username: "Username",
usernamePlaceholder: "username",
uniqueUsername: "Your unique PATRIODX username.",

displayName: "Display Name",
yourName: "Your name",

bio: "Bio",
bioPlaceholder: "Tell people about yourself...",

profilePicture: "Profile Picture",
saveProfile: "Save Profile",
cancel: "Cancel",

yourPosts: "Your Posts",
        allRights: "All rights reserved."
    },

    fr: {
        search: "Rechercher sur PATRIODX...",
        profile: "Profil",
        notifications: "Notifications",
        messages: "Messages",
        logout: "Déconnexion",

        home: "Accueil",
        dashboard: "Tableau de bord",
        social: "Social",
        analytics: "Analyses",
        products: "Produits",
        customers: "Clients",
        sales: "Ventes",
        invoices: "Factures",
        contact: "Contact",
        account: "Compte",
        ai: "PATRIODX IA",

        language: "Langue",

        welcome: "Bienvenue sur PATRIODX",
        runBusiness: "Gérez votre entreprise. Faites fructifier votre argent.",
        connect: "Connectez-vous. Partagez. Développez-vous.",

        notificationsTitle: "Notifications",
        messagesTitle: "Messages",
        profileTitle: "Profil",

        noNotifications: "Aucune notification pour le moment",
        noPosts: "Aucune publication pour le moment",

        contactTitle: "Contact",
        quickLinks: "Liens rapides",

        privacy: "Politique de confidentialité",
        terms: "Conditions d'utilisation",
connect: "Connectez-vous. Partagez. Développez-vous.",
socialDescription: "Connectez-vous avec des clients et des entreprises, partagez des actualités et faites la promotion de vos activités.",
createPost: "Créer une publication",
photo: "Photo",
video: "Vidéo",
post: "Publier",
latestPosts: "Dernières publications",
        main: "PRINCIPAL",
business: "ENTREPRISE",
grow: "DÉVELOPPEMENT",
growWithPatriodx: "Développez-vous avec PATRIODX",
unlockTools: "Débloquez plus d'outils professionnels.",
viewPlans: "Voir les offres",
        controlCenter: "PATRIODX • CENTRE DE CONTRÔLE",
runBusinessSmarter: "Gérez votre entreprise plus intelligemment.",
dashboardDescription: "Gérez vos produits, clients, ventes et factures depuis un puissant tableau de bord.",
manageProducts: "Gérer les produits",
viewAnalytics: "Voir les analyses",
quickActions: "ACTIONS RAPIDES",
getThingsDoneFaster: "Accomplissez vos tâches plus rapidement.",

addProduct: "Ajouter un produit",
addInventoryItem: "Ajoutez un élément à votre inventaire",

addCustomer: "Ajouter un client",
addNewCustomer: "Ajouter un nouveau client",

recordSale: "Enregistrer une vente",
recordTransaction: "Enregistrer une nouvelle transaction",

createInvoice: "Créer une facture",
sendInvoice: "Envoyer une facture professionnelle",
findPeople: '<i data-lucide="search"></i> Trouver des personnes',
searchUsername: "Rechercher un nom d'utilisateur...",
patriodxProfile: '<i data-lucide="user"></i> PROFIL PATRIODX',
yourProfile: "Votre profil",
buildYourIdentity: "Construisez votre identité sur PATRIODX.",

follow: "Suivre",
posts: "Publications",
followers: "Abonnés",
following: "Abonnements",

tellPeopleAboutYourself: "Parlez de vous aux autres.",
editProfile: '<i data-lucide="pencil"></i> Modifier le profil',

editYourProfile: "Modifier votre profil",
customizeProfile: "Personnalisez la façon dont les autres vous voient sur PATRIODX.",

username: "Nom d'utilisateur",
usernamePlaceholder: "nom d'utilisateur",
uniqueUsername: "Votre nom d'utilisateur PATRIODX unique.",

displayName: "Nom affiché",
yourName: "Votre nom",

bio: "Biographie",
bioPlaceholder: "Parlez de vous...",

profilePicture: "Photo de profil",
saveProfile: "Enregistrer le profil",
cancel: "Annuler",

yourPosts: "Vos publications",
        allRights: "Tous droits réservés."
    },

    es: {
        search: "Buscar en PATRIODX...",
        profile: "Perfil",
        notifications: "Notificaciones",
        messages: "Mensajes",
        logout: "Cerrar sesión",

        home: "Inicio",
        dashboard: "Panel",
        social: "Social",
        analytics: "Analítica",
        products: "Productos",
        customers: "Clientes",
        sales: "Ventas",
        invoices: "Facturas",
        contact: "Contacto",
        account: "Cuenta",
        ai: "PATRIODX IA",

        language: "Idioma",

        welcome: "Bienvenido a PATRIODX",
        runBusiness: "Administra tu negocio. Haz crecer tu dinero.",
        connect: "Conecta. Comparte. Crece.",

        notificationsTitle: "Notificaciones",
        messagesTitle: "Mensajes",
        profileTitle: "Perfil",

        noNotifications: "Aún no hay notificaciones",
        noPosts: "Aún no hay publicaciones",

        contactTitle: "Contacto",
        quickLinks: "Enlaces rápidos",

        privacy: "Política de privacidad",
        terms: "Términos de servicio",
connect: "Conecta. Comparte. Crece.",
socialDescription: "Conecta con clientes y empresas, comparte novedades y promociona lo que haces.",
createPost: "Crear una publicación",
photo: "Foto",
video: "Vídeo",
post: "Publicar",
latestPosts: "Últimas publicaciones",
        main: "PRINCIPAL",
business: "NEGOCIO",
grow: "CRECER",
growWithPatriodx: "Crece con PATRIODX",
unlockTools: "Desbloquea más herramientas empresariales.",
viewPlans: "Ver planes",
        controlCenter: "PATRIODX • CENTRO DE CONTROL",
runBusinessSmarter: "Gestiona tu negocio de forma más inteligente.",
dashboardDescription: "Gestiona tus productos, clientes, ventas y facturas desde un potente panel de control.",
manageProducts: "Gestionar productos",
viewAnalytics: "Ver analíticas",
quickActions: "ACCIONES RÁPIDAS",
getThingsDoneFaster: "Haz las cosas más rápido.",

addProduct: "Añadir producto",
addInventoryItem: "Añade algo a tu inventario",

addCustomer: "Añadir cliente",
addNewCustomer: "Añadir un nuevo cliente",

recordSale: "Registrar venta",
recordTransaction: "Registrar una nueva transacción",

createInvoice: "Crear factura",
sendInvoice: "Enviar una factura profesional",
findPeople: '<i data-lucide="search"></i> Buscar personas',

searchUsername: "Buscar nombre de usuario...",
patriodxProfile: '<i data-lucide="user"></i> PERFIL PATRIODX',
yourProfile: "Tu perfil",
buildYourIdentity: "Construye tu identidad en PATRIODX.",

follow: "Seguir",
posts: "Publicaciones",
followers: "Seguidores",
following: "Siguiendo",

tellPeopleAboutYourself: "Cuéntale a la gente sobre ti.",
editProfile: '<i data-lucide="pencil"></i> Editar perfil',

editYourProfile: "Editar tu perfil",
customizeProfile: "Personaliza cómo te ven las personas en PATRIODX.",

username: "Nombre de usuario",
usernamePlaceholder: "nombre de usuario",
uniqueUsername: "Tu nombre de usuario único de PATRIODX.",

displayName: "Nombre para mostrar",
yourName: "Tu nombre",

bio: "Biografía",
bioPlaceholder: "Cuéntale a la gente sobre ti...",

profilePicture: "Foto de perfil",
saveProfile: "Guardar perfil",
cancel: "Cancelar",

yourPosts: "Tus publicaciones",
        allRights: "Todos los derechos reservados."
    }

};


/* =========================================================
   CURRENT LANGUAGE
========================================================= */

let PATRIODX_CURRENT_LANGUAGE =
    localStorage.getItem(
        "patriodxLanguage"
    ) || "en";


/* =========================================================
   TRANSLATE ELEMENT
========================================================= */

function patriodxTranslateElement(
    element,
    language
) {

    if (!element) return;

    const key =
        element.dataset.i18n;

    if (!key) return;

    const translations =
        PATRIODX_TRANSLATIONS[language];

    if (!translations) return;

    if (
        Object.prototype.hasOwnProperty.call(
            translations,
            key
        )
    ) {

        element.textContent =
            translations[key];

    }

}


/* =========================================================
   APPLY TRANSLATIONS
========================================================= */

function applyPATRIODXLanguage(
    language
) {

    if (
        !PATRIODX_TRANSLATIONS[language]
    ) {

        language = "en";

    }


    PATRIODX_CURRENT_LANGUAGE =
        language;


    localStorage.setItem(
        "patriodxLanguage",
        language
    );


    document.documentElement.lang =
        language;


    const translations =
        PATRIODX_TRANSLATIONS[language];


    /* Elements using data-i18n */

    document
        .querySelectorAll(
            "[data-i18n]"
        )
        .forEach(element => {

            patriodxTranslateElement(
                element,
                language
            );

        });
document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
    const key = element.dataset.i18nPlaceholder;

    if (
        translations &&
        Object.prototype.hasOwnProperty.call(translations, key)
    ) {
        element.placeholder = translations[key];
    }
});

    /* Search placeholder */

    const searchInput =
        document.getElementById(
            "globalSearchInput"
        );

    if (searchInput) {

        searchInput.placeholder =
            translations.search;

    }


    /* Profile */

    const profileName =
        document.getElementById(
            "headerProfileName"
        );

    if (
        profileName &&
        (
            !profileName.textContent.trim() ||
            profileName.textContent.trim() === "Profile"
        )
    ) {

        profileName.textContent =
            translations.profile;

    }


    /* Language selector */

    const selector =
        document.getElementById(
            "languageSelector"
        );

    if (
        selector &&
        selector.value !== language
    ) {

        selector.value =
            language;

    }

}


/* =========================================================
   LANGUAGE SELECTOR
========================================================= */

function setupPATRIODXLanguageSelector() {

    const selector =
        document.getElementById(
            "languageSelector"
        );


    if (!selector) return;


    if (
        selector.dataset.languageReady ===
        "true"
    ) {
        return;
    }


    selector.dataset.languageReady =
        "true";


    selector.addEventListener(
        "change",
        function() {

            applyPATRIODXLanguage(
                this.value
            );

        }
    );


    applyPATRIODXLanguage(
        PATRIODX_CURRENT_LANGUAGE
    );

}


/* =========================================================
   START LANGUAGE SYSTEM
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        setupPATRIODXLanguageSelector,
        { once: true }
    );

} else {

    setupPATRIODXLanguageSelector();

}
// =========================================================
// PATRIODX BLUE CHECK VERIFICATION
// =========================================================
function showPATRIODXVerificationPlan() {

    return new Promise(function(resolve) {

        const overlay =
            document.createElement("div");

        overlay.className =
            "patriodx-confirm-overlay";

        overlay.innerHTML = `
            <div class="patriodx-confirm-modal">

                <h3>PATRIODX VERIFIED</h3>

                <p>
                    Choose your verification plan.
                </p>

                <div class="verification-plan-options">

                    <button
                        type="button"
                        class="verification-plan-option"
                        data-plan="1"
                    >
                        <strong>Monthly</strong>
                        <span>GHS 58.09</span>
                    </button>

                    <button
                        type="button"
                        class="verification-plan-option"
                        data-plan="2"
                    >
                        <strong>Yearly</strong>
                        <span>GHS 580.95</span>
                    </button>

                </div>

                <div class="patriodx-confirm-actions">

                    <button
                        type="button"
                        class="secondary-btn"
                        id="verificationCancelButton"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        id="verificationContinueButton"
                        class="primary-btn"
                        disabled
                    >
                        Continue
                    </button>

                </div>

            </div>
        `;

        document.body.appendChild(overlay);

        let selectedPlan = null;

        const options =
            overlay.querySelectorAll(
                ".verification-plan-option"
            );

        const continueButton =
            overlay.querySelector(
                "#verificationContinueButton"
            );

        const cancelButton =
            overlay.querySelector(
                "#verificationCancelButton"
            );

        options.forEach(function(option) {

            option.addEventListener(
                "click",
                function() {

                    options.forEach(function(item) {
                        item.classList.remove(
                            "selected"
                        );
                    });

                    option.classList.add(
                        "selected"
                    );

                    selectedPlan =
                        option.dataset.plan;

                    continueButton.disabled =
                        false;
                }
            );

        });

        cancelButton.addEventListener(
            "click",
            function() {

                overlay.remove();

                resolve(null);
            }
        );

        continueButton.addEventListener(
            "click",
            function() {

                overlay.remove();

                resolve(selectedPlan);
            }
        );

    });
}
// =========================================================
// PATRIODX INPUT MODAL
// =========================================================

function showPATRIODXInput(title, message) {

    return new Promise(function(resolve) {

        const overlay =
            document.createElement("div");

        overlay.className =
            "patriodx-confirm-overlay";

        overlay.innerHTML = `
            <div class="patriodx-confirm-modal">

                <h3>${title}</h3>

                <p>${message}</p>

                <input
                    type="text"
                    id="patriodxInputField"
                    class="patriodx-input"
                    autocomplete="off"
                >

                <div class="patriodx-confirm-actions">

                    <button
                        type="button"
                        class="secondary-btn"
                        id="patriodxInputCancel"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        class="primary-btn"
                        id="patriodxInputContinue"
                    >
                        Continue
                    </button>

                </div>

            </div>
        `;

        document.body.appendChild(overlay);

        const input =
            overlay.querySelector(
                "#patriodxInputField"
            );

        const cancel =
            overlay.querySelector(
                "#patriodxInputCancel"
            );

        const continueButton =
            overlay.querySelector(
                "#patriodxInputContinue"
            );

        input.focus();

        cancel.addEventListener(
            "click",
            function() {

                overlay.remove();

                resolve(null);
            }
        );

        continueButton.addEventListener(
            "click",
            function() {

                const value =
                    input.value.trim();

                overlay.remove();

                resolve(value || null);
            }
        );

        input.addEventListener(
            "keydown",
            function(event) {

                if (event.key === "Enter") {

                    continueButton.click();

                }

                if (event.key === "Escape") {

                    cancel.click();

                }

            }
        );

    });
}
async function startVerificationPlan() {

   if (!currentUser) {

    showPATRIODXToast(
        "Please log in before getting verified.",
        "warning"
    );

    return;
}
  const choice =
    await showPATRIODXVerificationPlan();

if (choice === null) {
    return;
}

    let plan;
if (choice.trim() === "1") {
    plan = "monthly";
} else if (choice.trim() === "2") {
    plan = "yearly";
} else {
    showPATRIODXToast(
        "Please enter 1 for Monthly or 2 for Yearly.",
        "warning"
    );
    return;
}
    try {

        const {
            data: {
                session
            }
        } = await supabaseClient.auth.getSession();

       if (!session || !session.access_token) {

    showPATRIODXToast(
        "Your login session has expired. Please log in again.",
        "warning"
    );

    return;
}

        const response = await fetch(
            "https://businessos-wine-eight.vercel.app/api/initialize-verification",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${session.access_token}`
                },

                body: JSON.stringify({
                    plan: plan
                })
            }
        );

        const result = await response.json();

        console.log(
            "Verification initialization:",
            result
        );

        if (!response.ok || !result.status) {
            throw new Error(
                result.error ||
                "Unable to start verification payment."
            );
        }

        if (!result.authorization_url) {
            throw new Error(
                "Paystack did not return a checkout URL."
            );
        }

        window.location.href =
            result.authorization_url;

    } catch (error) {

       console.error(
    "PATRIODX VERIFICATION ERROR:",
    error
);

showPATRIODXToast(
    "Could not start verification. " +
    error.message,
    "error"
);
}
}

window.startVerificationPlan =
    startVerificationPlan;
if (typeof lucide !== "undefined") {
    lucide.createIcons();
}
/* =========================================================
   PATRIODX ROUTER INITIALIZATION
========================================================= */

window.addEventListener("hashchange", () => {

    let page =
        window.location.hash
            .replace("#", "")
            .trim();

    if (!page) {
        page = "home";
    }

    if (page === "ai") {
        page = "patriodxAI";
    }

    navigatePATRIODX(page);

});


/* Load the correct page when PATRIODX starts */

document.addEventListener("DOMContentLoaded", () => {

    let page =
        window.location.hash
            .replace("#", "")
            .trim();

    if (!page) {
        page = "home";
    }

    if (page === "ai") {
        page = "patriodxAI";
    }

    navigatePATRIODX(page);

});
// PATRIODX ROUTER SYNC
/* =========================================================
   GLOBAL SEARCH
========================================================= */

let globalSearchTimer = null;

function setupGlobalSearch() {

    const input =
        document.getElementById("globalSearchInput");

    const results =
        document.getElementById("globalSearchResults");

    if (!input || !results) {
        return;
    }

    if (input.dataset.ready === "true") {
        return;
    }

    input.dataset.ready = "true";

    input.addEventListener("input", function () {

        const query =
            input.value.trim();

        clearTimeout(globalSearchTimer);

        if (query.length < 2) {
            results.style.display = "none";
            results.innerHTML = "";
            return;
        }

        results.style.display = "block";

        results.innerHTML = `
            <div class="global-search-empty">
                Searching...
            </div>
        `;

        globalSearchTimer =
            setTimeout(
                () => performGlobalSearch(query),
                300
            );
    });


    document.addEventListener(
        "click",
        function (event) {

            if (
                !event.target.closest(
                    ".patriodx-global-search"
                )
            ) {
                results.style.display = "none";
            }

        }
    );
}


async function performGlobalSearch(query) {

    const results =
        document.getElementById(
            "globalSearchResults"
        );

    if (!results || !currentUser) {
        return;
    }

    const cleanQuery =
        query.replace(/[%_]/g, "");

    const { data, error } =
        await supabaseClient
            .from("profiles")
          .select(
    "id, username, display_name, avatar_url, is_verified, is_owner, verification_expires_at"
)
            .or(
                `username.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%`
            )
            .limit(8);

    if (error) {

        console.error(
            "Global search error:",
            error
        );

        results.innerHTML = `
            <div class="global-search-empty">
                Search failed. Please try again.
            </div>
        `;

        return;
    }


    if (!data || !data.length) {

        results.innerHTML = `
            <div class="global-search-empty">
                No people found for "${query}".
            </div>
        `;

        return;
    }


    results.innerHTML =
        data.map(profile => {

            const name =
                profile.display_name ||
                profile.username ||
                "PATRIODX User";

            const username =
                profile.username
                    ? "@" + profile.username
                    : "";

            const avatar =
                profile.avatar_url
                    ? `
                        <img
                            src="${profile.avatar_url}"
                            alt=""
                        >
                    `
                    : `
                        <span>
                            ${name.charAt(0).toUpperCase()}
                        </span>
                    `;

            return `
                <button
                    type="button"
                    class="global-search-result"
                    onclick="openGlobalSearchProfile('${profile.id}')"
                >

                    <span class="global-search-result-avatar">
                        ${avatar}
                    </span>

                    <span class="global-search-result-content">

                       <span class="global-search-result-name">
    ${escapeHTML(name)}
    ${
        typeof getPATRIODXBadge === "function"
            ? getPATRIODXBadge(profile)
            : ""
    }
</span>

                        <span class="global-search-result-username">
                            ${escapeHTML(username)}
                        </span>

                    </span>

                </button>
            `;

        }).join("");


    results.style.display = "block";
}


function openGlobalSearchProfile(profileId) {

    const results =
        document.getElementById(
            "globalSearchResults"
        );

    if (results) {
        results.style.display = "none";
    }

    const input =
        document.getElementById(
            "globalSearchInput"
        );

    if (input) {
        input.value = "";
    }

    navigatePATRIODX("profile");

    setTimeout(() => {

        const profileInput =
            document.getElementById(
                "profileSearchInput"
            );

        if (profileInput) {
            profileInput.value = "";
        }

    }, 100);
}


setupGlobalSearch();
async function submitPATRIODXStory(event) {

    event.preventDefault();

    const fileInput =
        document.getElementById("storyMedia");

    const button =
        document.getElementById("postStoryButton");

   if (!fileInput || !fileInput.files.length) {

    showPATRIODXToast(
        "Please select a photo or video.",
        "warning"
    );

    return;
}


if (!currentUser) {

    showPATRIODXToast(
        "Please sign in again.",
        "warning"
    );

    return;
}


const file = fileInput.files[0];

const isImage =
    file.type.startsWith("image/");

const isVideo =
    file.type.startsWith("video/");


if (!isImage && !isVideo) {

    showPATRIODXToast(
        "Please select an image or video.",
        "warning"
    );

    return;
}


if (file.size > 50 * 1024 * 1024) {

    showPATRIODXToast(
        "Story files must be smaller than 50 MB.",
        "warning"
    );

    return;
}

    button.disabled = true;
    button.innerHTML =
        '<i data-lucide="loader-circle"></i> Posting...';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    try {

        const extension =
            file.name.split(".").pop().toLowerCase();

        const filePath =
            `stories/${currentUser.id}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } =
            await supabaseClient
                .storage
                .from("patriodx-media")
                .upload(
                    filePath,
                    file,
                    {
                        cacheControl: "3600",
                        upsert: false,
                        contentType: file.type
                    }
                );

        if (uploadError) {
            throw uploadError;
        }

        const { data: publicData } =
            supabaseClient
                .storage
                .from("patriodx-media")
                .getPublicUrl(filePath);

        const mediaUrl =
            publicData.publicUrl;

        const { error: storyError } =
            await supabaseClient
                .from("stories")
                .insert({
                    user_id: currentUser.id,
                    media_url: mediaUrl,
                    media_type: isImage
                        ? "image"
                        : "video"
                });

        if (storyError) {
            throw storyError;
        }

      showPATRIODXToast(
    "Story posted successfully.",
    "success"
);

        closeAddStoryModal();

        document.getElementById("addStoryForm")?.reset();

        const preview =
            document.getElementById("storyPreview");

        if (preview) {
            preview.style.display = "none";
            preview.innerHTML = "";
        }

               await loadSocialPosts();

        if (typeof loadPATRIODXStories === "function") {
            await loadPATRIODXStories();
        }

    } catch (error) {

        console.error(
            "Story upload error:",
            error
        );

    showPATRIODXToast(
    error.message ||
    "Could not post your story.",
    "error"
);
    } finally {

        button.disabled = false;

        button.innerHTML =
            '<i data-lucide="send"></i> Post Story';

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}
/* =========================================================
MOBILE CREATE SHEET — RELIABLE INITIALIZATION
========================================================= */

function openMobileCreateSheet() {
const sheet = document.getElementById("mobileCreateSheet");
if (!sheet) {
console.error("PATRIODX: Create sheet not found.");
return;
}


sheet.style.display = "flex";
document.body.classList.add("mobile-create-open");

if (typeof lucide !== "undefined") {
    lucide.createIcons();
}


}

function closeMobileCreateSheet() {
const sheet = document.getElementById("mobileCreateSheet");
if (sheet) {
sheet.style.display = "none";
}


document.body.classList.remove("mobile-create-open");


}

function setupMobileCreateSheet() {
const createButton = document.getElementById("mobileCreateButton");
const closeButton = document.getElementById("mobileCreateClose");
const sheet = document.getElementById("mobileCreateSheet");


if (!createButton || !closeButton || !sheet) {
    console.error("PATRIODX: Create controls are missing.", {
        createButton: !!createButton,
        closeButton: !!closeButton,
        sheet: !!sheet
    });
    return;
}

if (createButton.dataset.createReady === "true") return;

createButton.dataset.createReady = "true";
createButton.addEventListener("click", openMobileCreateSheet);
closeButton.addEventListener("click", closeMobileCreateSheet);

sheet.addEventListener("click", event => {
    if (event.target === sheet) {
        closeMobileCreateSheet();
    }
});

document.getElementById("mobileCreatePost")?.addEventListener("click", () => {
    closeMobileCreateSheet();

    if (typeof navigatePATRIODX === "function") {
        navigatePATRIODX("social");
    }

    setTimeout(() => {
        const composer = document.getElementById("socialPostContent");

        if (composer) {
            composer.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            composer.focus({ preventScroll: true });
        }
    }, 200);
});
document.getElementById("mobileCreateStory")?.addEventListener("click", () => {
    closeMobileCreateSheet();
    if (typeof openAddStoryModal === "function") {
        openAddStoryModal();
    } else {
        document.getElementById("addStoryModal")?.style.setProperty("display", "flex");
    }
});

document.getElementById("mobileCreateLive")?.addEventListener("click", () => {
    closeMobileCreateSheet();
    if (typeof openGoLiveModal === "function") {
        openGoLiveModal();
    } else {
        document.getElementById("goLiveModal")?.style.setProperty("display", "flex");
    }
});


}

/* =========================================================
MOBILE MORE BUTTON — OPEN EXISTING SIDEBAR
========================================================= */

function setupMobileMoreButton() {
const moreButton = document.getElementById("mobileMoreButton");
const sidebar = document.getElementById("patriodxSidebar");


if (!moreButton || !sidebar || moreButton.dataset.moreReady === "true") {
    return;
}

moreButton.dataset.moreReady = "true";

moreButton.addEventListener("click", event => {
    event.preventDefault();

    const isOpen = sidebar.classList.contains("mobile-open");

    sidebar.classList.toggle("mobile-open", !isOpen);
document.body.classList.toggle("mobile-sidebar-open", !isOpen);
moreButton.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen && typeof lucide !== "undefined") {
        lucide.createIcons();
    }
});

sidebar.querySelectorAll(".sidebar-link").forEach(link => {
    link.addEventListener("click", () => {
        sidebar.classList.remove("mobile-open");
        document.body.classList.remove("mobile-sidebar-open");
        moreButton.setAttribute("aria-expanded", "false");
    });
});


}

/*

* The HTML for the Create sheet appears after script.js.
* Initialize after the complete document has been parsed.
  */
 function setupPATRIODXMobileActions() {
const createButton = document.getElementById("mobileCreateButton");
const moreButton = document.getElementById("mobileMoreButton");
const sheet = document.getElementById("mobileCreateSheet");


console.log("PATRIODX mobile controls:", {
    createButton: !!createButton,
    moreButton: !!moreButton,
    createSheet: !!sheet
});

setupMobileCreateSheet();
setupMobileMoreButton();


}

if (document.readyState === "loading") {
document.addEventListener(
"DOMContentLoaded",
setupPATRIODXMobileActions,
{ once: true }
);
} else {
setupPATRIODXMobileActions();
}


/* =========================================================
   PATRIODX IN-SITE TOAST NOTIFICATIONS
========================================================= */

function showPATRIODXToast(message, type = "info") {

    let toast =
        document.getElementById("patriodxToast");

    if (!toast) {

        toast =
            document.createElement("div");

        toast.id = "patriodxToast";

        toast.innerHTML = `
            <span
                id="patriodxToastIcon"
                class="patriodx-toast-icon"
            ></span>

            <span
                id="patriodxToastMessage"
                class="patriodx-toast-message"
            ></span>
        `;

        document.body.appendChild(toast);
    }

    const icon =
        document.getElementById(
            "patriodxToastIcon"
        );

    const messageElement =
        document.getElementById(
            "patriodxToastMessage"
        );

    if (messageElement) {
        messageElement.textContent = message;
    }

    toast.className =
        "patriodx-toast " + type;

    if (icon) {

        const icons = {
            success: "check-circle",
            error: "circle-alert",
            warning: "triangle-alert",
            info: "info"
        };

        icon.innerHTML =
            `<i data-lucide="${icons[type] || "info"}"></i>`;
    }

    toast.classList.add("show");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    clearTimeout(
        toast._hideTimer
    );

    toast._hideTimer =
        setTimeout(() => {

            toast.classList.remove("show");

        }, 3000);
}
const openProfileButton =
    document.getElementById("openProfileButton");

if (openProfileButton) {

    openProfileButton.addEventListener(
        "click",
        function() {

            const profileSection =
                document.getElementById("profile");

            if (profileSection) {

                profileSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            }
        }
    );
}
/* =========================================================
PATRIODX — PUBLIC PROFILE POST VIEWER
========================================================= */

function openProfilePostViewer(postData) {
const viewer = document.getElementById("profilePostViewer");
const mediaContainer = document.getElementById("profilePostViewerMedia");
const authorContainer = document.getElementById("profilePostViewerAuthor");
const captionContainer = document.getElementById("profilePostViewerCaption");
const dateContainer = document.getElementById("profilePostViewerDate");


if (
    !viewer ||
    !mediaContainer ||
    !authorContainer ||
    !captionContainer ||
    !dateContainer ||
    !postData
) {
    return;
}

mediaContainer.replaceChildren();

if (postData.imageUrl) {
    const image = document.createElement("img");
    image.src = postData.imageUrl;
    image.alt = "Post image";
    mediaContainer.appendChild(image);
} else if (postData.videoUrl) {
    const video = document.createElement("video");
    video.src = postData.videoUrl;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    mediaContainer.appendChild(video);
} else {
    const emptyMedia = document.createElement("div");
    emptyMedia.className = "profile-post-viewer-text-only";
    emptyMedia.textContent = "Text post";
    mediaContainer.appendChild(emptyMedia);
}

authorContainer.textContent = postData.author || "PATRIODX User";
captionContainer.textContent = postData.caption || "";
dateContainer.textContent = postData.date || "";
window.currentProfileViewerPostId = postData.postId;

viewer.style.display = "flex";
viewer.setAttribute("aria-hidden", "false");
document.body.style.overflow = "hidden";

refreshProfilePostViewer(postData.postId);
if (window.lucide) {
    lucide.createIcons();
}


}

function closeProfilePostViewer() {
const viewer = document.getElementById("profilePostViewer");
const mediaContainer = document.getElementById("profilePostViewerMedia");


if (!viewer) return;

viewer.style.display = "none";
viewer.setAttribute("aria-hidden", "true");
document.body.style.overflow = "";

if (mediaContainer) {
    const video = mediaContainer.querySelector("video");

    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }

    mediaContainer.replaceChildren();
}


}

/* Close the viewer with Escape */
document.addEventListener("keydown", function (event) {
if (event.key === "Escape") {
closeProfilePostViewer();
}
});
/* =========================================================
   PATRIODX — PROFILE VIEWER INTERACTIONS
========================================================= */

async function refreshProfilePostViewer(postId) {
    const likeCount = document.getElementById("profilePostViewerLikeCount");
    const likeButton = document.getElementById("profilePostViewerLike");
    const commentsContainer = document.getElementById("profilePostViewerComments");

    if (!likeCount || !likeButton || !commentsContainer) {
        console.error("PATRIODX: A profile viewer interaction element is missing.");
        return;
    }

    if (!postId) {
        likeCount.textContent = "Likes unavailable";
        commentsContainer.textContent = "Comments unavailable.";
        return;
    }

    likeCount.textContent = "Loading likes...";
    commentsContainer.textContent = "Loading comments...";

    try {
        const stats = await getSocialCounts(postId);

        likeCount.textContent =
            `${stats.likes} ${stats.likes === 1 ? "like" : "likes"}`;

        const liked = await hasLikedSocialPost(postId);

        likeButton.classList.toggle("liked", liked);
        likeButton.setAttribute("aria-label", liked ? "Unlike post" : "Like post");
        likeButton.title = liked ? "Unlike post" : "Like post";
        likeButton.innerHTML = '<i data-lucide="heart"></i>';

        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("PATRIODX: Could not load post likes:", error);
        likeCount.textContent = "Likes could not be loaded.";
    }

    try {
        const { data: comments, error } = await supabaseClient
            .from("comments")
            .select("*")
            .eq("post_id", postId)
            .order("created_at", { ascending: true });

        if (error) throw error;

        commentsContainer.replaceChildren();

        if (!comments || comments.length === 0) {
            commentsContainer.textContent = "No comments yet. Be the first!";
            return;
        }

        const userIds = [...new Set(
            comments.map(comment => comment.user_id).filter(Boolean)
        )];

        const commentIds = comments.map(comment => comment.id);

        const [profileResult, commentLikeResult] = await Promise.all([
            userIds.length
                ? supabaseClient
                    .from("profiles")
                    .select("id, username, display_name, avatar_url")
                    .in("id", userIds)
                : Promise.resolve({ data: [], error: null }),

            supabaseClient
                .from("comment_likes")
                .select("comment_id, user_id")
                .in("comment_id", commentIds)
        ]);

        if (profileResult.error) {
            console.error("PATRIODX: Could not load profiles:", profileResult.error);
        }

        if (commentLikeResult.error) {
            throw commentLikeResult.error;
        }

        const profiles = profileResult.data || [];
        const commentLikes = commentLikeResult.data || [];

        const profileMap = new Map(
            profiles.map(profile => [profile.id, profile])
        );

        const commentsByParent = new Map();

        comments.forEach(comment => {
            const parentId = comment.parent_comment_id || null;

            if (!commentsByParent.has(parentId)) {
                commentsByParent.set(parentId, []);
            }

            commentsByParent.get(parentId).push(comment);
        });

        function renderComment(comment, isReply = false) {
            const profile = profileMap.get(comment.user_id);
            const isOwner = Boolean(
                currentUser && comment.user_id === currentUser.id
            );

            const author = isOwner
                ? "You"
                : (
                    profile?.display_name ||
                    profile?.username ||
                    "PATRIODX User"
                );

            const likesForComment = commentLikes.filter(
                item => item.comment_id === comment.id
            );

            const userLiked = Boolean(
                currentUser &&
                likesForComment.some(item => item.user_id === currentUser.id)
            );

            const row = document.createElement("div");
            row.className = isReply
                ? "social-comment social-comment-reply"
                : "social-comment";

            row.dataset.commentId = comment.id;

            const avatar = document.createElement("div");
            avatar.className = "social-comment-avatar";

            if (profile?.avatar_url) {
                const image = document.createElement("img");
                image.src = profile.avatar_url;
                image.alt = author;
                image.loading = "lazy";
                avatar.appendChild(image);
            } else {
                const initial = document.createElement("span");
                initial.textContent = author.charAt(0).toUpperCase();
                avatar.appendChild(initial);
            }

            const content = document.createElement("div");
            content.className = "social-comment-content";

           const name = document.createElement("strong");
name.textContent = author;

if (
    profile &&
    typeof getPATRIODXBadge === "function"
) {
    name.insertAdjacentHTML(
        "beforeend",
        getPATRIODXBadge(profile)
    );
}
const text = document.createElement("p");
text.className = "social-comment-text";
text.innerHTML = renderClickableMentions(
    comment.content || ""
);
            const date = document.createElement("small");
            date.textContent = formatDate(comment.created_at);

            content.append(name, text, date);

            const actions = document.createElement("div");
            actions.className = "social-comment-actions";

            const commentLikeButton = document.createElement("button");
            commentLikeButton.type = "button";
            commentLikeButton.className = "profile-comment-like-button";
            commentLikeButton.dataset.commentId = comment.id;
            commentLikeButton.textContent =
                `${userLiked ? "♥" : "♡"} ${likesForComment.length}`;
            commentLikeButton.setAttribute(
                "aria-label",
                userLiked ? "Unlike comment" : "Like comment"
            );
            commentLikeButton.classList.toggle("liked", userLiked);

            actions.appendChild(commentLikeButton);

            // Replies are displayed beneath top-level comments.
            if (!isReply) {
                const replyButton = document.createElement("button");
                replyButton.type = "button";
                replyButton.className = "profile-comment-reply-button";
                replyButton.dataset.commentId = comment.id;
                replyButton.textContent = "Reply";
                actions.appendChild(replyButton);
            }

            if (isOwner) {
                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.className = "profile-comment-edit-button";
                editButton.dataset.commentId = comment.id;
                editButton.textContent = "Edit";
                actions.appendChild(editButton);

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "profile-comment-delete-button";
                deleteButton.dataset.commentId = comment.id;
                deleteButton.textContent = "Delete";
                actions.appendChild(deleteButton);
            }

            content.appendChild(actions);
            row.append(avatar, content);

            if (!isReply) {
                const replyForm = document.createElement("form");
                replyForm.className = "profile-comment-reply-form";
                replyForm.dataset.parentCommentId = comment.id;
                replyForm.hidden = true;

                const replyInput = document.createElement("input");
                replyInput.type = "text";
                replyInput.name = "reply";
                replyInput.maxLength = 2000;
                replyInput.placeholder = "Write a reply...";
                replyInput.required = true;

                const replySubmit = document.createElement("button");
                replySubmit.type = "submit";
                replySubmit.textContent = "Reply";

                replyForm.append(replyInput, replySubmit);
                row.appendChild(replyForm);
            }

            const editForm = document.createElement("form");
            editForm.className = "profile-comment-edit-form";
            editForm.dataset.commentId = comment.id;
            editForm.hidden = true;

            const editInput = document.createElement("input");
            editInput.type = "text";
            editInput.name = "editedContent";
            editInput.maxLength = 2000;
            editInput.value = comment.content || "";
            editInput.required = true;

            const saveButton = document.createElement("button");
            saveButton.type = "submit";
            saveButton.textContent = "Save";

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "Cancel";
            cancelButton.className = "profile-comment-edit-cancel";

            editForm.append(editInput, saveButton, cancelButton);
            row.appendChild(editForm);

            return row;
        }

        function appendCommentTree(comment, isReply = false) {
            const row = renderComment(comment, isReply);
            commentsContainer.appendChild(row);

            if (!isReply) {
                const replies = commentsByParent.get(comment.id) || [];

                replies.forEach(reply => {
                    appendCommentTree(reply, true);
                });
            }
        }

        const topLevelComments = commentsByParent.get(null) || [];

        if (topLevelComments.length === 0) {
            commentsContainer.textContent = "No comments yet. Be the first!";
        } else {
            topLevelComments.forEach(comment => {
                appendCommentTree(comment);
            });
        }

        if (window.lucide) lucide.createIcons();

    } catch (error) {
        console.error("PATRIODX: Could not load post comments:", error);
        commentsContainer.textContent = "Comments could not be loaded.";
    }
}
/* Like or unlike the post from the viewer. */
document.getElementById("profilePostViewerLike")?.addEventListener("click", async function () {
    const postId = window.currentProfileViewerPostId;

    if (!postId) return;

    this.disabled = true;

    try {
        await likeSocialPost(postId);
        await refreshProfilePostViewer(postId);
    } finally {
        this.disabled = false;
    }
});


/* Scroll to the comments when the comment button is clicked. */
document.getElementById("profilePostViewerCommentFocus")?.addEventListener("click", function () {
    document.getElementById("profilePostViewerCommentInput")?.focus();
});


/* Submit a comment from the viewer. */
document.addEventListener("submit", async function (event) {
    const form = event.target;

    if (!form || form.id !== "profilePostViewerCommentForm") {
        return;
    }

    event.preventDefault();

    const postId = window.currentProfileViewerPostId;
    const input = document.getElementById("profilePostViewerCommentInput");
    const button = form.querySelector("button[type='submit']");

    if (!postId || !input || !button) {
        console.error("PATRIODX: Missing post ID, comment input, or submit button.");
        return;
    }

    if (!currentUser) {
        showPATRIODXToast("Please log in before commenting.", "warning");
        return;
    }

    const content = input.value.trim();

    if (!content) {
        return;
    }

    button.disabled = true;
    button.textContent = "Sending...";

    try {
        const { error } = await supabaseClient
            .from("comments")
            .insert({
                post_id: postId,
                user_id: currentUser.id,
                content: content
            });

        if (error) {
            throw error;
        }

        input.value = "";

        await refreshProfilePostViewer(postId);
        await refreshSocialPostStats(postId);
        await refreshHomePostStats(postId);

        showPATRIODXToast("Comment added.", "success");
    } catch (error) {
        console.error("Viewer comment submission error:", error);

        showPATRIODXToast(
            "Could not add comment. " + (error.message || "Unknown error"),
            "error"
        );
    } finally {
        button.disabled = false;
        button.textContent = "Post";
    }
});
/* Share the currently open post. */
document.getElementById("profilePostViewerShare")?.addEventListener("click", async function () {
    const postId = window.currentProfileViewerPostId;

    if (!postId) return;

    const shareUrl = new URL(window.location.href);
    shareUrl.hash = `post-${postId}`;

    try {
        if (navigator.share) {
            await navigator.share({
                title: "PATRIODX post",
                url: shareUrl.href
            });
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl.href);
            showPATRIODXToast("Post link copied.", "success");
        } else {
            showPATRIODXToast("Sharing is not available in this browser.", "warning");
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Share error:", error);
        }
    }
});
/* Delete the current user's own comment. */
document.addEventListener("click", async function (event) {
    const button = event.target.closest(".profile-comment-delete-button");

    if (!button) return;

    const commentId = button.dataset.commentId;
    const postId = window.currentProfileViewerPostId;

    if (!commentId || !postId || !currentUser) {
        showPATRIODXToast("Unable to delete this comment.", "error");
        return;
    }

  const confirmed = await showPATRIODXConfirm(
    "Delete Comment",
    "Are you sure you want to delete this comment? This action cannot be undone."
);

if (!confirmed) {
    return;
}

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const { data, error } = await supabaseClient
            .from("comments")
            .delete()
            .eq("id", commentId)
            .eq("user_id", currentUser.id)
            .eq("post_id", postId)
            .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(
                "Comment was not deleted. Check your permissions or comment ownership."
            );
        }

        await refreshProfilePostViewer(postId);
        await refreshSocialPostStats(postId);
        await refreshHomePostStats(postId);

        showPATRIODXToast("Comment deleted.", "success");

    } catch (error) {
        console.error("PATRIODX: Could not delete comment:", error);

        showPATRIODXToast(
            "Could not delete comment. " + error.message,
            "error"
        );

        button.disabled = false;
        button.textContent = "Delete";
    }
});
/* =========================================================
   PATRIODX — COMMENT LIKE, REPLY AND EDIT HANDLERS
========================================================= */

/* Handle comment likes, reply forms, and edit forms. */
document.addEventListener("click", async function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const likeButton = target.closest(".profile-comment-like-button");
    const replyButton = target.closest(".profile-comment-reply-button");
    const editButton = target.closest(".profile-comment-edit-button");
    const cancelButton = target.closest(".profile-comment-edit-cancel");

    if (cancelButton) {
        const editForm = cancelButton.closest(".profile-comment-edit-form");
        if (editForm) editForm.hidden = true;
        return;
    }

    if (replyButton) {
        const row = replyButton.closest(".social-comment");
        const replyForm = row?.querySelector(".profile-comment-reply-form");

        if (replyForm) {
            replyForm.hidden = !replyForm.hidden;

            if (!replyForm.hidden) {
                replyForm.querySelector("input")?.focus();
            }
        }
        return;
    }

    if (editButton) {
        const row = editButton.closest(".social-comment");
        const editForm = row?.querySelector(".profile-comment-edit-form");

        if (editForm) {
            editForm.hidden = !editForm.hidden;

            if (!editForm.hidden) {
                editForm.querySelector("input")?.focus();
            }
        }
        return;
    }

    if (!likeButton) return;

    if (!currentUser) {
        showPATRIODXToast("Please log in to like comments.", "warning");
        return;
    }

    const commentId = likeButton.dataset.commentId;
    const postId = window.currentProfileViewerPostId;

    if (!commentId || !postId) return;

    likeButton.disabled = true;

    try {
        const { data: existingLike, error: lookupError } = await supabaseClient
            .from("comment_likes")
            .select("id")
            .eq("comment_id", commentId)
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (lookupError) throw lookupError;

        if (existingLike) {
            const { error } = await supabaseClient
                .from("comment_likes")
                .delete()
                .eq("comment_id", commentId)
                .eq("user_id", currentUser.id);

            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from("comment_likes")
                .insert({
                    comment_id: commentId,
                    user_id: currentUser.id
                });

            if (error) throw error;
        }

        await refreshProfilePostViewer(postId);

    } catch (error) {
        console.error("PATRIODX: Could not update comment like:", error);
        showPATRIODXToast(
            "Could not update comment like. " + error.message,
            "error"
        );
    } finally {
        likeButton.disabled = false;
    }
});


/* Submit a reply or save an edited comment. */
document.addEventListener("submit", async function (event) {
    const form = event.target;

    if (!(form instanceof HTMLFormElement)) return;

    const isReplyForm = form.classList.contains("profile-comment-reply-form");
    const isEditForm = form.classList.contains("profile-comment-edit-form");

    if (!isReplyForm && !isEditForm) return;

    event.preventDefault();

    if (!currentUser) {
        showPATRIODXToast("Please log in first.", "warning");
        return;
    }

    const postId = window.currentProfileViewerPostId;
    const input = form.querySelector("input");
    const button = form.querySelector("button[type='submit']");
    const content = input?.value.trim();

    if (!postId || !input || !button || !content) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = isReplyForm ? "Sending..." : "Saving...";

    try {
        if (isReplyForm) {
            const parentCommentId = form.dataset.parentCommentId;

            if (!parentCommentId) {
                throw new Error("The parent comment could not be found.");
            }

            const { error } = await supabaseClient
                .from("comments")
                .insert({
                    post_id: postId,
                    user_id: currentUser.id,
                    parent_comment_id: parentCommentId,
                    content: content
                });

            if (error) throw error;

            showPATRIODXToast("Reply added.", "success");
        } else {
            const commentId = form.dataset.commentId;

            if (!commentId) {
                throw new Error("The comment could not be found.");
            }

            const { data, error } = await supabaseClient
                .from("comments")
                .update({
                    content: content,
                    updated_at: new Date().toISOString()
                })
                .eq("id", commentId)
                .eq("user_id", currentUser.id)
                .eq("post_id", postId)
                .select("id");

            if (error) throw error;

            if (!data || data.length === 0) {
                throw new Error("The comment was not updated. Check ownership and permissions.");
            }

            showPATRIODXToast("Comment updated.", "success");
        }

        await refreshProfilePostViewer(postId);
        await refreshSocialPostStats(postId);
        await refreshHomePostStats(postId);

    } catch (error) {
        console.error("PATRIODX: Could not save comment change:", error);

        showPATRIODXToast(
            "Could not save. " + error.message,
            "error"
        );
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
});
// =========================================================
// PATRIODX — MARKETPLACE FRAME INTEGRATION
// =========================================================

window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) {
        return;
    }

    if (
        !event.data ||
        event.data.type !== "patriodx-marketplace-height"
    ) {
        return;
    }

    const marketplaceFrame = document.getElementById(
        "patriodxMarketplaceFrame"
    );

    if (!marketplaceFrame || event.source !== marketplaceFrame.contentWindow) {
        return;
    }

    const height = Number(event.data.height);

    if (!Number.isFinite(height) || height < 200 || height > 50000) {
        return;
    }

    marketplaceFrame.style.height = `${Math.ceil(height)}px`;
});
// Return to the conversation list on mobile
document.addEventListener("click", function (event) {
    const backButton = event.target.closest("#mobileChatBackButton");

    if (!backButton) return;

    const messagingSection = document.getElementById("messaging");

    if (messagingSection) {
        messagingSection.classList.remove("mobile-chat-open");
    }
});
// PATRIODX mobile messaging changes
/* PATRIODX — Refresh inbox when Messages becomes visible */
(() => {
    let lastRefresh = 0;

    async function refreshMessagingInbox() {
        const messaging = document.getElementById("messaging");

        if (
            !messaging ||
            !currentUser ||
            !messagingListIsVisible(messaging)
        ) {
            return;
        }

        const now = Date.now();

        if (now - lastRefresh < 800) return;

        lastRefresh = now;

        if (typeof loadConversations === "function") {
            await loadConversations();
        }
    }

    function messagingListIsVisible(element) {
        return element.getClientRects().length > 0 &&
            getComputedStyle(element).display !== "none";
    }

    document.addEventListener("click", event => {
        const trigger = event.target.closest(
            '[href="#messaging"], [data-section="messaging"], [data-target="messaging"]'
        );

        if (!trigger) return;

        setTimeout(refreshMessagingInbox, 150);
        setTimeout(refreshMessagingInbox, 500);
    });

    window.addEventListener("pageshow", refreshMessagingInbox);
})();
// Open seller profiles from Home marketplace cards.
document.addEventListener("click", function (event) {
    const button = event.target.closest(".home-marketplace-seller-link");

    if (!button) return;

    const userId = button.dataset.homeSellerId;

    if (userId && typeof loadPublicProfile === "function") {
        loadPublicProfile(userId);

        document.getElementById("publicProfileCard")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
});