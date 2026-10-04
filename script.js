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
// =========================================================
// PRODUCT MODAL
// =========================================================

function openProductModal(productId = null) {

    const modal =
        document.getElementById("productModal");

    const form =
        document.getElementById("productForm");

    if (!modal || !form) return;

    editingProductId =
        productId;

    form.reset();

    document.getElementById(
        "productId"
    ).value = "";

    document.getElementById(
        "productModalTitle"
    ).textContent =
        productId
            ? "Edit Product"
            : "Add Product";

    if (productId) {

        const product =
            products.find(
                p => p.id === productId
            );

        if (!product) return;

        document.getElementById(
            "productId"
        ).value =
            product.id;

        document.getElementById(
            "productName"
        ).value =
            product.name;

        document.getElementById(
            "productPrice"
        ).value =
            product.price;

        document.getElementById(
            "productStock"
        ).value =
            product.stock;
    }

    modal.classList.add("active");
}

function closeProductModal() {

    const modal =
        document.getElementById(
            "productModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }

    editingProductId = null;
}

async function saveProduct(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    const name =
        document.getElementById(
            "productName"
        ).value.trim();

    const price =
        Number(
            document.getElementById(
                "productPrice"
            ).value
        );

    const stock =
        Number(
            document.getElementById(
                "productStock"
            ).value
        );

    if (
        !name ||
        price < 0 ||
        stock < 0
    ) {

     showPATRIODXToast(
    "Please enter valid product details.",
    "warning"
);

        return;
    }

    let result;

    if (editingProductId) {

        result =
            await supabaseClient
                .from("products")
                .update({
                    name,
                    price,
                    stock,
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    editingProductId
                )
                .eq(
                    "business_id",
                    currentBusiness.id
                );

    } else {

        if (!canCreate("product")) {
            return;
        }

        result =
            await supabaseClient
                .from("products")
                .insert({
                    business_id:
                        currentBusiness.id,
                    name,
                    price,
                    stock
                });
    }

    if (result.error) {

        console.error(result.error);

      showPATRIODXToast(
    "Could not save product.",
    "error"
);

        return;
    }

    closeProductModal();

    await loadData();

    renderAll();
}


// =========================================================
// PRODUCT DISPLAY
// =========================================================

function renderProducts() {

    const container =
        document.getElementById(
            "productsList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "productSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const filtered =
        products.filter(product =>
            product.name
                .toLowerCase()
                .includes(search)
        );

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
               <div class="empty-icon">
    <i data-lucide="package"></i>
</div>
                <h3>No products yet</h3>
                <p>Add your first product to start managing your inventory.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(product => `

        <div class="item-card">

            <h3>${safe(product.name)}</h3>

            <p>
                Price:
                <strong>
                    ${money(product.price)}
                </strong>
            </p>

            <p>
                Stock:
                <strong>
                    ${product.stock}
                </strong>
            </p>

            <div class="card-actions">

                <button
                    type="button"
                    onclick="openProductModal('${product.id}')"
                >
                    Edit
                </button>

                <button
                    type="button"
                    class="danger-btn"
                    onclick="deleteProduct('${product.id}')"
                >
                    Delete
                </button>

            </div>

        </div>

    `).join("");
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

    const container =
        document.getElementById(
            "customersList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "customerSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const filtered =
        customers.filter(customer =>

            customer.name
                .toLowerCase()
                .includes(search)

            ||

            (customer.email || "")
                .toLowerCase()
                .includes(search)

            ||

            (customer.phone || "")
                .toLowerCase()
                .includes(search)
        );

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <h3>No customers yet</h3>
                <p>Add your first customer to start building your customer list.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(customer => `

        <div class="item-card">

            <h3>
                ${safe(customer.name)}
            </h3>

            <p>
                📧
                ${safe(
                    customer.email ||
                    "No email"
                )}
            </p>

            <p>
                📱
                ${safe(
                    customer.phone ||
                    "No phone"
                )}
            </p>

            <div class="card-actions">

                <button
                    type="button"
                    class="danger-btn"
                    onclick="deleteCustomer('${customer.id}')"
                >
                    Delete
                </button>

            </div>

        </div>

    `).join("");
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
                total
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
// SALES DISPLAY
// =========================================================

function renderSales() {

    const container =
        document.getElementById(
            "salesList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "salesSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const filtered =
        sales.filter(sale =>

            (sale.product_name || "")
                .toLowerCase()
                .includes(search)
        );

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i data-lucide="receipt"></i></div>
                <h3>No sales yet</h3>
                <p>Your recorded sales will appear here.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(sale => `

        <div class="sale-card">

            <div>

                <h3>
                    ${safe(
                        sale.product_name
                    )}
                </h3>

                <p>
                    Quantity:
                    ${sale.quantity}
                </p>

                <small>
                    ${formatDate(
                        sale.created_at
                    )}
                </small>

            </div>

            <strong>
                ${money(sale.total)}
            </strong>

            <button
                type="button"
                class="danger-btn"
                onclick="deleteSale('${sale.id}')"
            >
                Delete
            </button>

        </div>

    `).join("");
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
// INVOICE DISPLAY
// =========================================================

function renderInvoices() {

    const container =
        document.getElementById(
            "invoicesList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "invoiceSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const status =
        document.getElementById(
            "invoiceStatusFilter"
        )?.value || "all";

    const filtered =
        invoices.filter(invoice => {

            const matchesSearch =

                (invoice.invoice_number || "")
                    .toLowerCase()
                    .includes(search)

                ||

                (invoice.customer_name || "")
                    .toLowerCase()
                    .includes(search)

                ||

                (invoice.product_name || "")
                    .toLowerCase()
                    .includes(search);

            const matchesStatus =
                status === "all" ||
                invoice.status === status;

            return (
                matchesSearch &&
                matchesStatus
            );
        });

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
               <div class="empty-icon"><i data-lucide="receipt"></i></div>
                <h3>No invoices yet</h3>
                <p>Create your first invoice for a customer.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(invoice => `

        <div class="invoice-card">

            <div>

                <h3>
                    ${safe(
                        invoice.invoice_number
                    )}
                </h3>

                <p>
                    Customer:
                    ${safe(
                        invoice.customer_name
                    )}
                </p>

                <p>
                    Product:
                    ${safe(
                        invoice.product_name
                    )}
                </p>

                <p>
                    Due:
                    ${formatDate(
                        invoice.due_date
                    )}
                </p>

                <strong>
                    ${money(invoice.total)}
                </strong>

            </div>

            <div>

                <span>
                    ${
                       invoice.status === "paid"
    ? '<i data-lucide="circle-check"></i> Paid'
    : '<i data-lucide="clock-3"></i> Unpaid'
                    }
                </span>

                <br><br>

                <button
                    type="button"
                    onclick="toggleInvoiceStatus('${invoice.id}')"
                >
                    Mark ${
                        invoice.status === "paid"
                            ? "Unpaid"
                            : "Paid"
                    }
                </button>

                <button
                    type="button"
                    onclick="viewInvoice('${invoice.id}')"
                >
                    View
                </button>

                <button
                    type="button"
                    class="danger-btn"
                    onclick="deleteInvoice('${invoice.id}')"
                >
                    Delete
                </button>

            </div>

        </div>

    `).join("");
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


    // SIMPLE REVENUE TREND

    const chart =
        document.getElementById(
            "revenueChart"
        );

    if (!chart) return;

    if (!sales.length) {

        chart.innerHTML = `
            <div class="empty-chart">
                Make your first sale to see your revenue trend.
            </div>
        `;

        return;
    }

    const recent =
        [...sales]
            .reverse()
            .slice(-10);

    const max =
        Math.max(
            ...recent.map(
                s =>
                    Number(
                        s.total || 0
                    )
            ),
            1
        );

    chart.innerHTML = `

        <div class="simple-chart">

            ${
                recent
                    .map(sale => {

                        const height =
                            Math.max(
                                8,
                                (
                                    Number(
                                        sale.total ||
                                        0
                                    ) /
                                    max
                                ) *
                                100
                            );

                        return `
                            <div class="chart-bar-wrap">

                                <div
                                    class="chart-bar"
                                    style="height:${height}%"
                                    title="${money(
                                        sale.total
                                    )}"
                                ></div>

                            </div>
                        `;

                    })
                    .join("")
            }

        </div>
    `;
}


// =========================================================
// RECENT ACTIVITY
// =========================================================

function renderRecentActivity() {

    const container =
        document.getElementById(
            "recentActivity"
        );

    if (!container) return;

    if (
        !sales.length &&
        !invoices.length
    ) {

        container.innerHTML = `
            <div class="empty-state">
               <div class="empty-icon"><i data-lucide="chart-column"></i></div>
                <h3>No recent activity</h3>
                <p>Your latest business activity will appear here.</p>
            </div>
        `;

        return;
    }

    const activity = [

        ...sales.map(sale => ({

            type: "Sale",

            text:
                `${sale.product_name} sale`,

            amount:
                sale.total,

            date:
                sale.created_at
        })),

        ...invoices.map(invoice => ({

            type: "Invoice",

            text:
                `${invoice.invoice_number} created`,

            amount:
                invoice.total,

            date:
                invoice.created_at
        }))

    ]
        .sort(
            (a, b) =>
                new Date(b.date) -
                new Date(a.date)
        )
        .slice(0, 8);

    container.innerHTML =
        activity
            .map(item => `

                <div class="activity-item">

                    <div>

                        <strong>
                            ${safe(item.type)}
                        </strong>

                        <p>
                            ${safe(item.text)}
                        </p>

                        <small>
                            ${formatDate(
                                item.date
                            )}
                        </small>

                    </div>

                    <strong>
                        ${money(item.amount)}
                    </strong>

                </div>

            `)
            .join("");
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


function startProPlan() {
if (!currentUser) {

    showPATRIODXToast(
        "Please log in before upgrading your plan.",
        "warning"
    );

    return;
}


// Continue directly to Paystack.
// The browser confirm popup has been removed.


if (typeof PaystackPop === "undefined") {

    showPATRIODXToast(
        "Payment system could not load. Please refresh the page and try again.",
        "error"
    );

    return;
}


    try {

        const paystack = new PaystackPop();


        paystack.newTransaction({

            key: PAYSTACK_PUBLIC_KEY,

            email: currentUser.email,

            // GHS 900
            // Paystack uses pesewas.

            amount: 90000,

            currency: "GHS",

            metadata: {
                plan: "Pro"
            },


            onSuccess: async function(transaction) {

                console.log(
                    "Paystack transaction:",
                    transaction
                );


              showPATRIODXToast(
    "Payment received. Verifying your payment...",
    "info"
);

                await verifyPatriodxPayment(
                    transaction.reference,
                    "Pro"
                );

            },


            onCancel: function() {

                console.log(
                    "Paystack checkout cancelled."
                );

            },


            onError: function(error) {

                console.error(
                    "Paystack error:",
                    error
                );

showPATRIODXToast(
    "Payment could not be completed. Please try again.",
    "error"
);
            }

        });


    } catch (error) {

        console.error(
            "Paystack error:",
            error
        );


    showPATRIODXToast(
    "Unable to start payment. Please try again.",
    "error"
);

    }
}


function startBusinessPlan() {

    if (!currentUser) {

        showPATRIODXToast(
            "Please log in before upgrading your plan.",
            "warning"
        );

        return;
    }

    if (typeof PaystackPop === "undefined") {

        showPATRIODXToast(
            "Payment system could not load. Please refresh the page and try again.",
            "error"
        );

        return;
    }

    try {

        const paystack = new PaystackPop();

        paystack.newTransaction({

            key: PAYSTACK_PUBLIC_KEY,

            email: currentUser.email,

            // GHS 1,900
            // Paystack uses pesewas.

            amount: 190000,

            currency: "GHS",

            metadata: {
                plan: "Business"
            },

            onSuccess: async function(transaction) {

                console.log(
                    "Paystack transaction:",
                    transaction
                );

                showPATRIODXToast(
                    "Payment received. Verifying your payment...",
                    "info"
                );

                await verifyPatriodxPayment(
                    transaction.reference,
                    "Business"
                );

            },

            onCancel: function() {

                console.log(
                    "Paystack checkout cancelled."
                );

            },

            onError: function(error) {

                console.error(
                    "Paystack error:",
                    error
                );

                showPATRIODXToast(
                    "Payment could not be completed. Please try again.",
                    "error"
                );

            }

        });

    } catch (error) {

        console.error(
            "Paystack error:",
            error
        );

        showPATRIODXToast(
            "Unable to start payment. Please try again.",
            "error"
        );

    }
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

    const [
        likesResult,
        commentsResult
    ] = await Promise.all([

        supabaseClient
            .from("post_likes")
            .select(
                "id",
                {
                    count: "exact",
                    head: true
                }
            )
            .eq(
                "post_id",
                postId
            ),

        supabaseClient
            .from("comments")
            .select(
                "id",
                {
                    count: "exact",
                    head: true
                }
            )
            .eq(
                "post_id",
                postId
            )

    ]);


    return {

        likes:
            likesResult.count || 0,

        comments:
            commentsResult.count || 0

    };
}
async function hasLikedSocialPost(postId) {

    if (!currentUser) {
        return false;
    }

    const { data, error } =
        await supabaseClient
            .from("post_likes")
            .select("id")
            .eq("post_id", postId)
            .eq("user_id", currentUser.id)
            .maybeSingle();

    if (error) {
        console.error(
            "Could not check post like:",
            error
        );

        return false;
    }

    return !!data;
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


async function loadPATRIODXStories() {

    const storiesContainer =
        document.getElementById("socialOtherStories");

    if (!storiesContainer || !currentUser) {
        return;
    }

    try {

        const { data: stories, error } =
            await supabaseClient
                .from("stories")
                .select(
                    "id, user_id, media_url, media_type, created_at, expires_at"
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
                    "id, username, display_name, avatar_url"
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

            storyButton.className =
                "social-story-item";

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

            nameElement.textContent =
                name;

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

        video.addEventListener(
            "loadedmetadata",
            function () {

                const duration =
                    Math.min(
                        Math.max(
                            video.duration || 5,
                            3
                        ),
                        15
                    );

                startPATRIODXStoryProgress(
                    duration
                );

            },
            {
                once: true
            }
        );

        video.addEventListener(
            "ended",
            function () {

                showNextPATRIODXStory();

            }
        );

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


function startPATRIODXStoryProgress(
    duration
) {

    const progress =
        document.getElementById(
            "storyViewerProgress"
        );

    if (!progress) {
        return;
    }

    clearTimeout(
        patriodxStoryViewerTimer
    );

    progress.style.transition = "none";
    progress.style.width = "0%";

    requestAnimationFrame(
        function () {

            progress.style.transition =
                `width ${duration}s linear`;

            progress.style.width = "100%";

        }
    );

    patriodxStoryViewerTimer =
        setTimeout(
            function () {

                showNextPATRIODXStory();

            },
            duration * 1000
        );
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
                "id, username, display_name, avatar_url"
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


    /* =========================================================
       RENDER FEED
    ========================================================= */

    socialFeed.innerHTML =
        postsWithCounts
            .map(post => {

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

                           <div class="social-post-avatar">
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

                                <div class="social-post-author">

                                    ${safe(author)}

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

                                ${
                                    !isOwnPost
                                        ? `
                                            <button
                                                type="button"
                                                class="social-post-icon-button"
                                                onclick="reportSocialPost('${post.id}')"
                                                title="Report post"
                                                aria-label="Report post"
                                            >
                                                <i data-lucide="flag"></i>
                                            </button>
                                        `
                                        : ""
                                }


                                ${
                                    isOwnPost
                                        ? `
                                            <button
                                                type="button"
                                                class="social-post-icon-button"
                                                onclick="deleteSocialPost('${post.id}')"
                                                title="Delete post"
                                                aria-label="Delete post"
                                            >
                                                <i data-lucide="trash-2"></i>
                                            </button>
                                        `
                                        : ""
                                }

                            </div>

                        </div>


                        <!-- POST CONTENT -->

                        ${
                            post.content
                                ? `
                                    <div class="social-post-content">
                                        ${safe(post.content)}
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
                                onclick="likeSocialPost('${post.id}')"
                                aria-label="Like post"
                            >
                                <i data-lucide="heart"></i>
                                <span>Like</span>
                            </button>


                            <button
                                type="button"
                                class="social-action-button"
                                onclick="toggleComments('${post.id}')"
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


                            <button
                                type="button"
                                class="social-action-button"
                                onclick="translateSocialPost('${post.id}')"
                                aria-label="Translate post"
                            >
                                <i data-lucide="languages"></i>
                                <span>Translate</span>
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
                `;

            })
            .join("");


    /* =========================================================
       LUCIDE
    ========================================================= */

    if (typeof lucide !== "undefined") {

    requestAnimationFrame(() => {
        lucide.createIcons();
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
                    .getElementById(
                        "socialPostContent"
                    )
                    .value
                    .trim();

            if (
                !content &&
                !selectedSocialFile
            ) {

                showPATRIODXToast(
                    "Please write something or select a photo/video.",
                    "warning"
                );

                return;
            }

            const button =
                document.getElementById(
                    "socialPostButton"
                );

            button.disabled = true;

            button.textContent =
                "Uploading...";

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

                        imageUrl =
                            uploadedUrl;

                    } else {

                        videoUrl =
                            uploadedUrl;
                    }
                }

                const { error } =
                    await supabaseClient
                        .from("posts")
                        .insert({

                            user_id:
                                currentUser.id,

                            business_id:
                                currentBusiness?.id ||
                                null,

                            content:
                                content || null,

                            image_url:
                                imageUrl,

                            video_url:
                                videoUrl

                        });

                if (error) {
                    throw error;
                }

                document
                    .getElementById(
                        "socialPostContent"
                    )
                    .value = "";

                clearSocialMedia();

                button.disabled =
                    false;

                button.innerHTML =
                    '<i data-lucide="megaphone"></i> Post';

                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }

                await loadSocialPosts();

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

                button.disabled =
                    false;

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

    const button =
        document.querySelector(
            `.social-like-button[data-post-id="${postId}"]`
        );

    if (!button) {
        return;
    }

    const liked =
        await hasLikedSocialPost(postId);

    button.classList.toggle(
        "liked",
        liked
    );

    button.innerHTML =
        liked
            ? '<i data-lucide="heart"></i> Liked'
            : '<i data-lucide="heart"></i> Like';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
/* =========================================================
   REFRESH POST COUNTS
========================================================= */

async function refreshSocialPostStats(postId) {

    const stats =
        await getSocialCounts(
            postId
        );


    const statsElement =
        document.getElementById(
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
                commentProfileMap.get(
                    comment.user_id
                );

            const isOwnComment =
                comment.user_id ===
                currentUser?.id;

            const author =
                isOwnComment
                    ? "You"
                    : (
                        commentProfile?.display_name ||
                        commentProfile?.username ||
                        "PATRIODX User"
                    );

            return `

                <div class="social-comment">

                    <div class="social-comment-avatar">
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

                        <strong>
                            ${safe(author)}
                        </strong>

                        <p>
                            ${safe(comment.content)}
                        </p>

                        <small>
                            ${formatDate(comment.created_at)}
                        </small>

                    </div>

                </div>

            `;
        })
        .join("");
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

                user_id:
                    postData.user_id,

                type:
                    "comment",

                title:
                    `${commenterName} commented on your post`,

                message:
                    content

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

    if (!currentUser) return;


    const confirmed =
        await showPATRIODXConfirm(
            "Delete Post",
            "Delete this post? This cannot be undone."
        );

    if (!confirmed) return;


    const { data: post, error: postError } =
        await supabaseClient
            .from("posts")
            .select(
                "id,user_id,image_url,video_url"
            )
            .eq(
                "id",
                postId
            )
            .single();


 if (postError) {

    showPATRIODXToast(
        "Could not find this post.",
        "error"
    );

    return;
}
    if (
        post.user_id !==
        currentUser.id
    ) {

      showPATRIODXToast(
    "You can only delete your own posts.",
    "warning"
);

        return;
    }


    const { error } =
        await supabaseClient
            .from("posts")
            .delete()
            .eq(
                "id",
                postId
            )
            .eq(
                "user_id",
                currentUser.id
            );


    if (error) {

        console.error(
            "Delete post error:",
            error
        );

      showPATRIODXToast(
    "Could not delete post. " +
    error.message,
    "error"
);
        return;
    }


    /*
       Remove the media file from storage.
       The post is already deleted even if
       storage cleanup fails.
    */

    try {

        const mediaUrl =
            post.image_url ||
            post.video_url;


        if (mediaUrl) {

            const marker =
                "/patriodx-media/";

            const index =
                mediaUrl.indexOf(marker);


            if (index !== -1) {

                const filePath =
                    mediaUrl
                        .substring(
                            index +
                            marker.length
                        );


                await supabaseClient
                    .storage
                    .from("patriodx-media")
                    .remove([
                        filePath
                    ]);
            }
        }

    } catch (storageError) {

        console.warn(
            "Media cleanup failed:",
            storageError
        );
    }


    await loadSocialPosts();
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
   START SOCIAL
========================================================= */

if (socialFeed) {

    loadSocialPosts();
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
/* =========================================================
   PATRIODX VERIFICATION BADGES
========================================================= */

function getPATRIODXBadge(profile) {

    if (!profile) return "";
if (
    profile.is_verified &&
    profile.verification_expires_at
) {
    const expiresAt =
        new Date(
            profile.verification_expires_at
        );

    if (
        expiresAt <= new Date()
    ) {
        return "";
    }
}
    if (profile.is_owner) {
        return `
            <span
    class="patriodx-verification-badge owner-badge"
    title="PATRIODX Owner"
    aria-label="PATRIODX Owner"
>
    <i data-lucide="star"></i>
    <i data-lucide="check"></i>
</span>
        `;
    }

    if (profile.is_verified) {
        return `
           <span 
    class="patriodx-verification-badge verified-badge" 
    title="PATRIODX Verified" 
    aria-label="PATRIODX Verified" 
> 
    <i data-lucide="star"></i> 
    <i data-lucide="check"></i> 
</span>
        `;
    }

    return "";
}

window.getPATRIODXBadge =
    getPATRIODXBadge;
/* =========================================================
   PATRIODX HOME FEED
========================================================= */

const homeFeed =
    document.getElementById("homeFeed");

async function loadHomePosts() {

    if (!homeFeed) return;

    homeFeed.innerHTML = `
        <div class="social-empty-state">
         <div><i data-lucide="clock-3"></i></div>
            <h3>Loading your feed...</h3>
            <p>Please wait.</p>
        </div>
    `;

    const { data: posts, error } =
        await supabaseClient
            .from("posts")
            .select("*")
            .order("created_at", {
                ascending: false
            });

    if (error) {

        console.error(
            "Could not load Home feed:",
            error
        );

        homeFeed.innerHTML = `
            <div class="social-empty-state">
               <div><i data-lucide="triangle-alert"></i></div>
                <h3>Could not load your feed</h3>
                <p>${safe(error.message)}</p>
            </div>
        `;

        return;
    }

    if (!posts || posts.length === 0) {

        homeFeed.innerHTML = `
            <div class="social-empty-state">
               <div><i data-lucide="globe"></i></div>
                <h3>No posts yet</h3>
                <p>
                    Be the first to share something
                    with the PATRIODX community.
                </p>
            </div>
        `;

        return;
    }

    const postsWithCounts =
        await Promise.all(
            posts.map(async post => {

                const counts =
                    await getSocialCounts(post.id);

                return {
                    ...post,
                    ...counts
                };

            })
        );

    homeFeed.innerHTML =
        postsWithCounts.map(post => {

            const isOwnPost =
                post.user_id === currentUser?.id;

            const author =
                isOwnPost
                    ? (
                        currentBusiness?.name ||
                        currentUser?.user_metadata?.full_name ||
                        currentUser?.email ||
                        "You"
                    )
                    : "PATRIODX User";

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
                    id="home-post-${post.id}"
                >

                    <div class="social-post-header">

                        <div class="social-post-avatar">
                            <i data-lucide="user"></i>
                        </div>

                        <div class="social-post-author-area">

                            <div class="social-post-author">
                                ${safe(author)}
                            </div>

                            <div class="social-post-date">
                                ${formatDate(post.created_at)}
                            </div>

                        </div>

                    </div>


                    ${
                        post.content
                            ? `
                                <div class="social-post-content">
                                    ${safe(post.content)}
                                </div>
                            `
                            : ""
                    }


                    ${image}

                    ${video}


                    <div class="social-post-stats">

                       <span>
    <i data-lucide="heart"></i> ${post.likes}
</span>

<span>
    <i data-lucide="message-circle"></i> ${post.comments}
</span>
                    </div>


                   <div class="social-post-actions-bar">

   <button
    type="button"
    class="social-action-button social-like-button"
    data-post-id="${post.id}"
    onclick="likeSocialPost('${post.id}')"
>
    <i data-lucide="heart"></i> Like
</button>

    <button
        type="button"
        class="social-action-button"
        onclick="toggleHomeComments('${post.id}')"
    >
        <i data-lucide="message-circle"></i> Comment
    </button>

    <button
        type="button"
        class="social-action-button"
        onclick="shareSocialPost('${post.id}')"
    >
        <i data-lucide="share-2"></i> Share
    </button>

                    </div>

                </article>
            `;

        }).join("");
}
/* =========================================================
   PATRIODX HOME POST STATS
========================================================= */

async function refreshHomePostStats(postId) {

    const statsElement =
        document.querySelector(
            `#home-post-${postId} .social-post-stats`
        );

    if (!statsElement) return;

    const counts =
        await getSocialCounts(postId);

   statsElement.innerHTML = `
    <span><i data-lucide="heart"></i> ${counts.likes}</span>
    <span><i data-lucide="message-circle"></i> ${counts.comments}</span>
    `;
}

window.refreshHomePostStats =
    refreshHomePostStats;
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
                                    ${safe(comment.content)}
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

const conversationUserSearch =
    document.getElementById(
        "conversationUserSearch"
    );

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
                "id, username, display_name"
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

    if (!conversationUserList) {
        return;
    }


    const search =
        (
            conversationUserSearch?.value ||
            ""
        )
        .trim()
        .toLowerCase();


    const users =
        conversationUsers.filter(
            user => {

                const name =
                    (
                        user.display_name ||
                        ""
                    ).toLowerCase();

                const username =
                    (
                        user.username ||
                        ""
                    ).toLowerCase();

                return (
                    name.includes(search) ||
                    username.includes(search)
                );

            }
        );


    if (!users.length) {

        conversationUserList.innerHTML = `
            <div class="messaging-empty-state">

                <div>
                    <i data-lucide="user-x"></i>
                </div>

                <h3>
                    No users found
                </h3>

                <p>
                    Try a different search.
                </p>

            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    conversationUserList.innerHTML =
        users.map(
            user => {

                const name =
                    user.display_name ||
                    user.username ||
                    "PATRIODX User";

                const username =
                    user.username
                        ? `@${user.username}`
                        : "";

                return `
                    <button
                        type="button"
                        class="conversation-user-item"
                        data-user-id="${user.id}"
                    >

                        <div class="conversation-user-avatar">
                            <i data-lucide="user"></i>
                        </div>

                        <div class="conversation-user-info">

                            <strong>
                                ${safe(name)}
                            </strong>

                            ${
                                username
                                    ? `
                                        <span>
                                            ${safe(username)}
                                        </span>
                                    `
                                    : ""
                            }

                        </div>

                    </button>
                `;

            }
        ).join("");


    conversationUserList
        .querySelectorAll(
            ".conversation-user-item"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                function() {

                    const userId =
                        this.dataset.userId;

                    if (!userId) {
                        return;
                    }

                    createConversationWithUser(
                        userId
                    );

                }
            );

        });


    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}


async function createConversationWithUser(otherUserId) {
    if (!currentUser || !otherUserId) {
        return;
    }

    /*
     * First check whether a conversation already exists
     * between the current user and the selected user.
     */

    const { data: myMemberships, error: myMembershipError } =
        await supabaseClient
            .from("conversation_members")
            .select("conversation_id")
            .eq("user_id", currentUser.id);

    if (myMembershipError) {
        console.error(
            "Could not load your conversations:",
            myMembershipError
        );

        showPATRIODXToast(
            "Could not check existing conversations. " +
            myMembershipError.message,
            "error"
        );

        return;
    }

    const myConversationIds =
        (myMemberships || [])
            .map(member => member.conversation_id);

    if (myConversationIds.length) {
        const { data: otherMemberships, error: otherMembershipError } =
            await supabaseClient
                .from("conversation_members")
                .select("conversation_id")
                .eq("user_id", otherUserId)
                .in(
                    "conversation_id",
                    myConversationIds
                );

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

            return;
        }

        const sharedConversation =
            (otherMemberships || [])[0];

        if (sharedConversation) {
            const existingConversationId =
                sharedConversation.conversation_id;

            if (newConversationModal) {
                newConversationModal.style.display =
                    "none";
            }

            if (conversationUserSearch) {
                conversationUserSearch.value = "";
            }

            await loadConversations();
            await openConversation(
                existingConversationId
            );

            return;
        }
    }

    /*
     * No existing conversation was found.
     * Create a new one.
     */

    const conversationId =
        crypto.randomUUID();

    const { error: conversationError } =
        await supabaseClient
            .from("conversations")
            .insert({
                id: conversationId
            });

    if (conversationError) {
        console.error(
            "Could not create conversation:",
            conversationError
        );

        showPATRIODXToast(
            "Could not create conversation. " +
            conversationError.message,
            "error"
        );

        return;
    }

    /*
     * Add the current user first.
     */

    const { error: currentMemberError } =
        await supabaseClient
            .from("conversation_members")
            .insert({
                conversation_id:
                    conversationId,
                user_id:
                    currentUser.id
            });

    if (currentMemberError) {
        console.error(
            "Could not add current user:",
            currentMemberError
        );

        showPATRIODXToast(
            "Could not join the conversation. " +
            currentMemberError.message,
            "error"
        );

        return;
    }

    /*
     * Then add the selected user.
     */

    const { error: otherMemberError } =
        await supabaseClient
            .from("conversation_members")
            .insert({
                conversation_id:
                    conversationId,
                user_id:
                    otherUserId
            });

    if (otherMemberError) {
        console.error(
            "Could not add the selected user:",
            otherMemberError
        );

        showPATRIODXToast(
            "Could not add the selected user. " +
            otherMemberError.message,
            "error"
        );

        return;
    }

    if (newConversationModal) {
        newConversationModal.style.display =
            "none";
    }

    if (conversationUserSearch) {
        conversationUserSearch.value = "";
    }

    await loadConversations();
    await openConversation(conversationId);
}

/* =========================================================
   LOAD CONVERSATIONS
========================================================= */
async function loadConversations() {

    if (!currentUser || !conversationList) {
        return;
    }

    conversationList.innerHTML = `
        <div class="messaging-empty-state">
            <div>
                <i data-lucide="loader-circle"></i>
            </div>
            <p>Loading conversations...</p>
        </div>
    `;

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    /* =====================================================
       GET CONVERSATION MEMBERSHIPS
    ===================================================== */

    const { data: memberships, error: membershipError } =
        await supabaseClient
            .from("conversation_members")
            .select(
                "conversation_id, user_id"
            )
            .eq(
                "user_id",
                currentUser.id
            );

    if (membershipError) {

        console.error(
            "Could not load conversation memberships:",
            membershipError
        );

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>
                    <i data-lucide="triangle-alert"></i>
                </div>
                <h3>Could not load conversations</h3>
                <p>
                    ${safe(membershipError.message)}
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }

    const conversationIds =
        (memberships || []).map(
            member =>
                member.conversation_id
        );

    if (!conversationIds.length) {

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>
                    <i data-lucide="message-circle"></i>
                </div>
                <h3>No conversations</h3>
                <p>
                    Start a conversation with
                    someone on PATRIODX.
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    /* =====================================================
       GET CONVERSATIONS
    ===================================================== */

    const { data: conversations, error: conversationError } =
        await supabaseClient
            .from("conversations")
            .select("*")
            .in(
                "id",
                conversationIds
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

    if (conversationError) {

        console.error(
            "Could not load conversations:",
            conversationError
        );

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>
                    <i data-lucide="triangle-alert"></i>
                </div>
                <h3>Could not load conversations</h3>
                <p>
                    ${safe(conversationError.message)}
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    /* =====================================================
       GET ALL MEMBERS FOR THESE CONVERSATIONS
    ===================================================== */

    const { data: allMembers, error: allMembersError } =
        await supabaseClient
            .from("conversation_members")
            .select(
                "conversation_id, user_id"
            )
            .in(
                "conversation_id",
                conversationIds
            );

    if (allMembersError) {

        console.error(
            "Could not load conversation members:",
            allMembersError
        );

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>
                    <i data-lucide="triangle-alert"></i>
                </div>
                <h3>Could not load conversations</h3>
                <p>
                    ${safe(allMembersError.message)}
                </p>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        return;
    }


    /* =====================================================
       FIND THE OTHER USERS
    ===================================================== */

    const otherUserIds = [
        ...new Set(
            (allMembers || [])
                .filter(
                    member =>
                        member.user_id !==
                        currentUser.id
                )
                .map(
                    member =>
                        member.user_id
                )
        )
    ];


    /* =====================================================
       LOAD OTHER USERS' PROFILES
    ===================================================== */

    let profiles = [];

    if (otherUserIds.length) {

        const { data: profileData, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select(
                    "id, username, display_name"
                )
                .in(
                    "id",
                    otherUserIds
                );

        if (profileError) {

            console.error(
                "Could not load conversation profiles:",
                profileError
            );

        } else {

            profiles =
                profileData || [];
        }
    }


    /* =====================================================
       CREATE QUICK PROFILE LOOKUP
    ===================================================== */

    const profileMap =
        new Map(
            profiles.map(
                profile => [
                    profile.id,
                    profile
                ]
            )
        );
const visibleConversations =
    (conversations || []).filter(
        conversation => {
            const members =
                (allMembers || []).filter(
                    member =>
                        member.conversation_id ===
                        conversation.id
                );

            return members.some(
                member =>
                    member.user_id !==
                    currentUser.id
            );
        }
    );

    /* =====================================================
       RENDER CONVERSATIONS
    ===================================================== */

    conversationList.innerHTML =
      (visibleConversations || [])
            .map(
                conversation => {

                    const members =
                        (allMembers || []).filter(
                            member =>
                                member.conversation_id ===
                                conversation.id
                        );

                    const otherMember =
                        members.find(
                            member =>
                                member.user_id !==
                                currentUser.id
                        );

                    const otherProfile =
                        otherMember
                            ? profileMap.get(
                                otherMember.user_id
                            )
                            : null;

                    const displayName =
                        otherProfile?.display_name ||
                        otherProfile?.username ||
                        "PATRIODX Conversation";

                    const username =
                        otherProfile?.username
                            ? `@${otherProfile.username}`
                            : "";

                    return `
                        <button
                            type="button"
                            class="conversation-item ${
                                activeConversationId ===
                                conversation.id
                                    ? "active"
                                    : ""
                            }"
                            data-conversation-id="${
                                conversation.id
                            }"
                        >

                            <div class="conversation-avatar">
                                <i data-lucide="user"></i>
                            </div>

                            <div class="conversation-info">

                                <strong>
                                    ${safe(displayName)}
                                </strong>

                               ${
    username
        ? `
            <span>
                ${safe(username)}
            </span>
        `
        : ""
}

                            </div>

                        </button>
                    `;
                }
            )
            .join("");


    /* =====================================================
       CLICK HANDLERS
    ===================================================== */

    conversationList
        .querySelectorAll(
            ".conversation-item"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    function() {

                        const conversationId =
                            this.dataset
                                .conversationId;

                        if (!conversationId) {
                            return;
                        }

                        openConversation(
                            conversationId
                        );
                    }
                );
            }
        );


    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
/* =========================================================
   OPEN CONVERSATION
========================================================= */

async function openConversation(
    conversationId
) {

    activeConversationId =
        conversationId;


    await loadConversations();


    messageInput.disabled = false;
    messageSendButton.disabled = false;


    const { data: conversation, error } =
        await supabaseClient
            .from("conversations")
            .select("*")
            .eq(
                "id",
                conversationId
            )
            .single();


    if (error) {

        console.error(
            "Could not open conversation:",
            error
        );

        return;
    }


  const members =
    await supabaseClient
        .from("conversation_members")
        .select("user_id")
        .eq(
            "conversation_id",
            conversationId
        );

let otherUser = null;

if (!members.error) {

    const otherMember =
        (members.data || []).find(
            member =>
                member.user_id !==
                currentUser.id
        );

    if (otherMember) {

        const { data: profile } =
            await supabaseClient
                .from("profiles")
                .select(
                    "username, display_name"
                )
                .eq(
                    "id",
                    otherMember.user_id
                )
                .single();

        otherUser = profile;
    }
}

const title =
    otherUser?.display_name ||
    otherUser?.username ||
    "PATRIODX User";

const username =
    otherUser?.username
        ? `@${otherUser.username}`
        : "PATRIODX";

document.getElementById(
    "chatHeader"
).innerHTML = `

    <div>

        <h3>
            ${safe(title)}
        </h3>

        <p>
            ${safe(username)}
        </p>

    </div>

`;


    await loadMessages(
        conversationId
    );


    subscribeToMessages(
        conversationId
    );

}


/* =========================================================
   LOAD MESSAGES
========================================================= */

async function loadMessages(
    conversationId
) {

    if (!messageList) return;


    messageList.innerHTML = `
        <div class="messaging-empty-state">
          <div><i data-lucide="clock-3"></i></div>
            <p>Loading messages...</p>
        </div>
    `;


    const { data: messages, error } =
        await supabaseClient
            .from("messages")
            .select("*")
            .eq(
                "conversation_id",
                conversationId
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Could not load messages:",
            error
        );

        messageList.innerHTML = `
            <div class="messaging-empty-state">
               <div><i data-lucide="triangle-alert"></i></div>
                <p>
                    Could not load messages.
                </p>
            </div>
        `;

        return;
    }


    if (
        !messages ||
        messages.length === 0
    ) {

        messageList.innerHTML = `
            <div class="messaging-empty-state">
               <div><i data-lucide="message-circle"></i></div>
                <h3>
                    No messages yet
                </h3>

                <p>
                    Send the first message.
                </p>

            </div>
        `;

        return;
    }


    messageList.innerHTML =
        messages.map(
            message => {

                const mine =
                    message.sender_id ===
                    currentUser.id;


                return `
                    <div
                        class="message-bubble ${
                            mine
                                ? "mine"
                                : "theirs"
                        }"
                    >

                        <div>
                            ${safe(message.content)}
                        </div>

                        <span class="message-time">
                            ${formatDate(
                                message.created_at
                            )}
                        </span>

                    </div>
                `;

            }
        ).join("");


    messageList.scrollTop =
        messageList.scrollHeight;

}


/* =========================================================
   SEND MESSAGE
========================================================= */
if (messageForm) {

    messageForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            if (!currentUser) {

                showPATRIODXToast(
                    "Please log in before sending messages.",
                    "warning"
                );

                return;
            }


            if (!activeConversationId) {

                showPATRIODXToast(
                    "Please select a conversation first.",
                    "warning"
                );

                return;
            }


            const content =
                messageInput.value.trim();


            if (!content) return;


            messageSendButton.disabled =
                true;


            const { error } =
                await supabaseClient
                    .from("messages")
                    .insert({

                        conversation_id:
                            activeConversationId,

                        sender_id:
                            currentUser.id,

                        content:
                            content

                    });


            if (error) {

                console.error(
                    "Could not send message:",
                    error
                );

                showPATRIODXToast(
                    "Could not send message. " +
                    error.message,
                    "error"
                );

                messageSendButton.disabled =
                    false;

                return;
            }


          messageInput.value = "";


/*
 * Create a notification for the other
 * participant in this conversation.
 */

const { data: conversationMembers } =
    await supabaseClient
        .from("conversation_members")
        .select("user_id")
        .eq(
            "conversation_id",
            activeConversationId
        );

if (conversationMembers) {

    const recipient =
        conversationMembers.find(
            member =>
                member.user_id !==
                currentUser.id
        );

    if (recipient) {

       const { data: senderProfile } =
    await supabaseClient
        .from("profiles")
        .select("display_name, username")
        .eq(
            "id",
            currentUser.id
        )
        .single();

const senderName =
    senderProfile?.display_name ||
    senderProfile?.username ||
    "PATRIODX User";

        const { error: notificationError } =
            await supabaseClient
                .from("notifications")
                .insert({
                    user_id:
                        recipient.user_id,

                    type:
                        "message",

                    title:
                        senderName,

                    message:
                        "sent you a message.",

                    related_id:
                        activeConversationId,

                    is_read:
                        false
                });

        if (notificationError) {

            console.error(
                "Could not create message notification:",
                notificationError
            );

        }
    }
}


messageSendButton.disabled =
    false;


await loadMessages(
    activeConversationId
);
        }
    );

}
/* =========================================================
   REALTIME MESSAGES
========================================================= */

function subscribeToMessages(
    conversationId
) {

    if (messagingRealtimeChannel) {

        supabaseClient.removeChannel(
            messagingRealtimeChannel
        );

    }


    messagingRealtimeChannel =
        supabaseClient
            .channel(
                `messages-${conversationId}`
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter:
                        `conversation_id=eq.${conversationId}`
                },
                function(payload) {

                    if (
                        activeConversationId ===
                        conversationId
                    ) {

                        loadMessages(
                            conversationId
                        );

                    }

                }
            )
            .subscribe();

}

/* =========================================================
   NEW CONVERSATION
========================================================= */

if (newConversationButton) {

    newConversationButton.addEventListener(
        "click",
        async function() {

            if (!currentUser) {

                showPATRIODXToast(
                    "Please log in first.",
                    "warning"
                );

                return;
            }

            /* Generate the conversation ID ourselves */
            const conversationId =
                crypto.randomUUID();

            /* Create conversation */
            const { error: conversationError } =
                await supabaseClient
                    .from("conversations")
                    .insert({
                        id: conversationId
                    });

            if (conversationError) {

                console.error(
                    "Could not create conversation:",
                    conversationError
                );

                showPATRIODXToast(
                    "Could not create conversation. " +
                    conversationError.message,
                    "error"
                );

                return;
            }

            /* Add current user as a member */
            const { error: memberError } =
                await supabaseClient
                    .from("conversation_members")
                    .insert({
                        conversation_id:
                            conversationId,

                        user_id:
                            currentUser.id
                    });

            if (memberError) {

                console.error(
                    "Could not add conversation member:",
                    memberError
                );

                showPATRIODXToast(
                    "Conversation was created, but you could not be added. " +
                    memberError.message,
                    "error"
                );

                return;
            }

            /* Reload conversations */
            await loadConversations();

            /* Open the new conversation */
            await openConversation(
                conversationId
            );

        }
    );

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

    if (
        type === "like" ||
        type === "comment"
    ) {
        navigatePATRIODX("social");
        return;
    }

    if (type === "message") {
        navigatePATRIODX("messaging");
        return;
    }

    if (type === "follow") {
        navigatePATRIODX("profile");
        return;
    }

    if (type === "sale") {
        navigatePATRIODX("sales");
        return;
    }

    if (type === "system") {
        navigatePATRIODX("home");
        return;
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


                const video =
                    post.video_url
                        ? `
                            <video
                                src="${safe(post.video_url)}"
                                class="social-post-video"
                                controls
                                preload="metadata"
                            ></video>
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

                                <div
                                    class="social-post-author"
                                >
                                    ${safe(
                                        currentProfile?.display_name ||
                                        "PATRIODX User"
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
async function loadProfileFollowList(userId, type) {

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
            "id, username, display_name, avatar_url"
        )
        .in("id", userIds);

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

    viewedProfileUserId = userId;

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


    postsElement.innerHTML = posts.map(post => {

        const date = post.created_at
            ? new Date(post.created_at).toLocaleString()
            : "";

        let media = "";

        if (post.image_url) {
            media = `
                <img
                    src="${post.image_url}"
                    class="social-post-image"
                    alt="Post image"
                >
            `;
        }

        if (post.video_url) {
            media = `
                <video
                    class="social-post-image"
                    controls
                >
                    <source src="${post.video_url}">
                </video>
            `;
        }


        return `
            <article class="social-post-card">

                <div class="social-post-header">

                    <div class="social-post-avatar">
                        ${
                            profile.avatar_url
                            ? `<img src="${profile.avatar_url}" alt="Profile picture">`
                           : '<i data-lucide="user"></i>'
                        }
                    </div>

                    <div class="social-post-author">

                        <strong>
                            ${escapeHTML(
                                profile.display_name ||
                                "PATRIODX User"
                            )}
                        </strong>

                        <span>
                            ${
                                profile.username
                                ? "@" + escapeHTML(profile.username)
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

            </article>
        `;

    }).join("");
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
            .select("id, username, display_name, avatar_url, bio")
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
            <div
                class="profile-search-result"
                data-user-id="${profile.id}"
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
                    </div>

                    <div class="profile-search-result-username">
                        ${
                            profile.username
                            ? "@" + escapeHTML(profile.username)
                            : ""
                        }
                    </div>

                </div>

            </div>
        `;

    }).join("");


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
/* =========================================================
   PATRIODX SIMPLE APP NAVIGATION
========================================================= */

const PATRIODX_PAGES = [
    "home",
    "dashboard",
    "profile",
    "social",
    "messaging",
    "notifications",
    "analytics",
    "products",
    "customers",
    "sales",
    "invoices",
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
                "id, username, display_name, avatar_url"
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
   MOBILE CREATE SHEET
========================================================= */

function openMobileCreateSheet() {

    const sheet =
        document.getElementById(
            "mobileCreateSheet"
        );

    if (!sheet) {
        return;
    }

    sheet.style.display = "flex";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}


function closeMobileCreateSheet() {

    const sheet =
        document.getElementById(
            "mobileCreateSheet"
        );

    if (!sheet) {
        return;
    }

    sheet.style.display = "none";
}


function setupMobileCreateSheet() {

    const createButton =
        document.getElementById(
            "mobileCreateButton"
        );

    const closeButton =
        document.getElementById(
            "mobileCreateClose"
        );

    const sheet =
        document.getElementById(
            "mobileCreateSheet"
        );

    if (!createButton || !closeButton || !sheet) {
        return;
    }

    if (
        createButton.dataset.createReady ===
        "true"
    ) {
        return;
    }

    createButton.dataset.createReady =
        "true";

    createButton.addEventListener(
        "click",
        openMobileCreateSheet
    );

    closeButton.addEventListener(
        "click",
        closeMobileCreateSheet
    );

    sheet.addEventListener(
        "click",
        function (event) {

            if (
                event.target === sheet
            ) {
                closeMobileCreateSheet();
            }

        }
    );
}


setupMobileCreateSheet();
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
